// -----------------------------------------------------------------------------
// The channel monitor: the heart of the integration.
//
// Every `poll_frequency` seconds, ONE Helix request asks which of the watched
// channels are live (up to 100 per request). From the answer the monitor:
//   - publishes the states of the channel devices (only what changed);
//   - fires the scene triggers on the transitions: stream started, stream
//     ended, category changed;
//   - reports the connection status and the per-device transport badge;
//   - keeps the snapshot the dashboard widget renders.
//
// It drives its own timer instead of Gladys' `should_poll`: Gladys would poll
// each device on its own, one request per channel, where a single request
// covers them all.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { createHash } from 'node:crypto';
import { hasCredentials, parseChannels } from '../config.js';
import {
  buildChannelDevice,
  buildChannelStates,
  channelIds,
  uptimeMinutes,
} from '../devices/channel.js';
import { createTwitchClient, TwitchAuthError } from './client.js';

const logger = createLogger({ name: 'monitor' });

// Scene trigger keys, as declared in the manifest `scene_triggers` field.
// Scenes store them: never rename one.
export const SCENE_TRIGGERS = {
  STREAM_ONLINE: 'stream_online',
  STREAM_OFFLINE: 'stream_offline',
  CATEGORY_CHANGED: 'category_changed',
};

// Helix now and then leaves a live stream out of one answer (its caches are
// eventually consistent). A channel is only declared offline once it is
// missing from this many answers in a row, or a scene would announce the end
// of a stream that never stopped, and its start again a minute later.
export const OFFLINE_CONFIRMATIONS = 2;

// A stable value is re-sent every 30 minutes, so it stays recently dated in
// Gladys (the "last seen" of the device).
const STATE_HEARTBEAT_MS = 30 * 60 * 1000;

const STATUS_MESSAGES = {
  noCredentials: {
    en: 'Enter the Client ID and Client Secret of your Twitch application.',
    fr: 'Saisissez le Client ID et le Client Secret de votre application Twitch.',
    de: 'Geben Sie die Client-ID und das Client-Secret Ihrer Twitch-Anwendung ein.',
    es: 'Introduzca el Client ID y el Client Secret de su aplicación de Twitch.',
  },
  authRefused: {
    en: 'Twitch refused the Client ID or Client Secret.',
    fr: 'Twitch a refusé le Client ID ou le Client Secret.',
    de: 'Twitch hat die Client-ID oder das Client-Secret abgelehnt.',
    es: 'Twitch ha rechazado el Client ID o el Client Secret.',
  },
  unreachable: {
    en: 'Twitch cannot be reached, retrying at the next refresh.',
    fr: 'Twitch est injoignable, nouvel essai au prochain rafraîchissement.',
    de: 'Twitch ist nicht erreichbar, neuer Versuch bei der nächsten Aktualisierung.',
    es: 'No se puede acceder a Twitch, se reintentará en la próxima actualización.',
  },
};

/** Short, stable hash of a URL: the widget image key changes with the image. */
function shortHash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 10);
}

/** The 150 px variant of a Twitch avatar: well under the widget image limit. */
export function smallAvatarUrl(url) {
  return url ? url.replace(/-300x300\./, '-150x150.') : '';
}

/**
 * @param {object} options
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} options.gladys
 * @param {{ load(): Promise<object>, save(channels: object): Promise<void> }} options.stateStore
 * @param {typeof createTwitchClient} [options.createClient] injected by the tests
 * @param {() => number} [options.now]
 * @param {() => void} [options.onChange] called when what the widget shows changed
 */
export function createMonitor({
  gladys,
  stateStore,
  createClient = createTwitchClient,
  now = Date.now,
  onChange = () => {},
}) {
  let config = null;
  let client = null;
  // Watched channels, by Twitch user id: `{ user, stream, misses }`.
  let channels = new Map();
  let unknownLogins = [];
  let invalidEntries = [];
  // Last state seen of every channel, persisted (see stateStore.js).
  let known = null;
  let timer = null;
  let lastStatus = null;
  let lastTransport = null;
  let lastPollAt = null;
  // One Twitch round at a time: a configuration saved during a poll waits
  // for it instead of interleaving two views of the channels.
  let queue = Promise.resolve();

  function exclusive(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  async function reportStatus(connected, message) {
    const key = connected ? 'ok' : JSON.stringify(message);
    if (key === lastStatus) {
      return;
    }
    lastStatus = key;
    await gladys
      .setConnectionStatus(connected, message)
      .catch((err) => logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  async function reportTransport(transport) {
    if (transport === lastTransport || channels.size === 0) {
      return;
    }
    lastTransport = transport;
    const entries = [...channels.keys()].map((userId) => ({
      external_id: channelIds(gladys, userId).device,
      transport,
    }));
    await gladys
      .publishTransports(entries)
      .catch((err) => logger.warn(`publishTransports failed: ${err.message}`));
  }

  async function reportFailure(err) {
    logger.error(`Twitch request failed: ${err.message}`);
    await reportStatus(
      false,
      err instanceof TwitchAuthError ? STATUS_MESSAGES.authRefused : STATUS_MESSAGES.unreachable,
    );
    await reportTransport(DEVICE_TRANSPORTS.UNREACHABLE);
  }

  async function loadKnown() {
    if (known === null) {
      known = await stateStore.load();
    }
    return known;
  }

  async function publishEvent(key, data) {
    logger.info(`Scene event ${key} <- ${data.login}`);
    // A refused event (429, Gladys restarting) must not stop the poll: the
    // states are already published, only that scene run is lost.
    await gladys
      .publishSceneEvent(key, data)
      .catch((err) => logger.warn(`publishSceneEvent ${key} failed: ${err.message}`));
  }

  /** Compare one channel with what was last seen, and list the events. */
  function diffChannel(channel, stream, events) {
    const { user } = channel;
    const previous = known[user.id];
    const base = {
      channel: channelIds(gladys, user.id).device,
      channel_name: user.display_name || user.login,
      login: user.login,
    };

    if (stream) {
      channel.misses = 0;
      // A channel seen for the first time (just added to the list) is a
      // baseline, not an event: it did not "just" start streaming.
      if (previous && (!previous.live || previous.stream_id !== stream.id)) {
        events.push([
          SCENE_TRIGGERS.STREAM_ONLINE,
          {
            ...base,
            title: stream.title ?? '',
            game: stream.game_name ?? '',
            url: `https://www.twitch.tv/${user.login}`,
          },
        ]);
      } else if (
        previous?.live &&
        previous.game &&
        stream.game_name &&
        previous.game !== stream.game_name
      ) {
        events.push([
          SCENE_TRIGGERS.CATEGORY_CHANGED,
          {
            ...base,
            game: stream.game_name,
            previous_game: previous.game,
            title: stream.title ?? '',
          },
        ]);
      }
      known[user.id] = {
        live: true,
        stream_id: stream.id,
        started_at: stream.started_at,
        game: stream.game_name || previous?.game || '',
        title: stream.title || previous?.title || '',
      };
      channel.stream = stream;
      return true;
    }

    if (previous?.live) {
      channel.misses += 1;
      if (channel.misses < OFFLINE_CONFIRMATIONS) {
        // Not confirmed yet: keep showing the stream as it was.
        return false;
      }
      events.push([
        SCENE_TRIGGERS.STREAM_OFFLINE,
        { ...base, duration_minutes: uptimeMinutes(previous.started_at, now()) },
      ]);
    }
    channel.misses = 0;
    channel.stream = null;
    known[user.id] = { ...previous, live: false, stream_id: null, started_at: null };
    return true;
  }

  async function pollNow() {
    if (!client || channels.size === 0) {
      return;
    }
    await loadKnown();
    let streams;
    try {
      streams = await client.getStreams([...channels.keys()]);
    } catch (err) {
      await reportFailure(err);
      return;
    }
    const byUser = new Map(streams.map((stream) => [stream.user_id, stream]));
    const before = JSON.stringify(widgetSignature());
    const states = [];
    const events = [];
    for (const [userId, channel] of channels) {
      const stream = byUser.get(userId) ?? null;
      if (diffChannel(channel, stream, events)) {
        states.push(...buildChannelStates(gladys, userId, stream, now()));
      }
    }
    lastPollAt = now();

    try {
      await gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
    } catch (err) {
      // Re-sent by the next poll: publishChangedStates only remembers what
      // Gladys accepted.
      logger.warn(`publishChangedStates failed: ${err.message}`);
    }
    for (const [key, data] of events) {
      await publishEvent(key, data);
    }
    // Forget the channels no longer watched: re-added later, they start from
    // a fresh baseline instead of a stale "live".
    for (const userId of Object.keys(known)) {
      if (!channels.has(userId)) {
        delete known[userId];
      }
    }
    await stateStore.save(known);
    await reportStatus(true);
    await reportTransport(DEVICE_TRANSPORTS.CLOUD);
    if (JSON.stringify(widgetSignature()) !== before) {
      onChange();
    }
  }

  /** What the widget shows, to nudge it only when it changed. */
  function widgetSignature() {
    return [...channels.values()].map((c) => [c.user.id, c.stream?.game_name, Boolean(c.stream)]);
  }

  async function resolveNow() {
    const { logins, invalid } = parseChannels(config?.channels);
    invalidEntries = invalid;
    if (!client) {
      channels = new Map();
      unknownLogins = [];
      await reportStatus(false, STATUS_MESSAGES.noCredentials);
      return;
    }
    let users;
    try {
      if (logins.length > 0) {
        users = await client.getUsersByLogin(logins);
      } else {
        // No channel yet: still check the credentials, so the status tells
        // the truth before the first channel is added.
        await client.authenticate();
        users = [];
      }
    } catch (err) {
      await reportFailure(err);
      throw err;
    }
    const found = new Set(users.map((user) => user.login.toLowerCase()));
    unknownLogins = logins.filter((login) => !found.has(login));
    if (unknownLogins.length > 0) {
      logger.warn(`Unknown Twitch channels: ${unknownLogins.join(', ')}`);
    }
    const previous = channels;
    channels = new Map(
      users.map((user) => [
        user.id,
        { user, stream: previous.get(user.id)?.stream ?? null, misses: 0 },
      ]),
    );
    // A new channel list needs its badge, whatever the last one was.
    lastTransport = null;
    await reportStatus(true);
  }

  function schedule() {
    clearTimeout(timer);
    if (!config) {
      return;
    }
    timer = setTimeout(async () => {
      await exclusive(pollNow).catch((err) => logger.error('Poll failed', err));
      schedule();
    }, config.poll_frequency * 1000);
    // The timer alone must not keep the process alive (tests, shutdown).
    timer.unref?.();
  }

  const monitor = {
    /**
     * Apply a configuration: new credentials, new channel list. Resolves the
     * channels (login -> user id) and returns the devices to publish.
     */
    configure(newConfig) {
      return exclusive(async () => {
        const credentialsChanged =
          !config ||
          config.client_id !== newConfig.client_id ||
          config.client_secret !== newConfig.client_secret;
        config = newConfig;
        if (credentialsChanged) {
          client = hasCredentials(config)
            ? createClient({ clientId: config.client_id, clientSecret: config.client_secret })
            : null;
        }
        await resolveNow();
        return monitor.devices();
      });
    },

    /** Discovery payload of the watched channels. */
    devices() {
      return [...channels.values()].map(({ user }) => buildChannelDevice(gladys, user));
    },

    /** Read the live streams now (also run by the timer). */
    poll() {
      return exclusive(pollNow);
    },

    /** Poll now, then every `poll_frequency` seconds. */
    async start() {
      await monitor.poll();
      schedule();
    },

    stop() {
      clearTimeout(timer);
      timer = null;
    },

    /** The Twitch client of the current credentials, `null` without them. */
    client() {
      return client;
    },

    /**
     * What the widget and the actions read: every watched channel, live ones
     * first (most viewers first), then the others by name.
     */
    snapshot() {
      const list = [...channels.values()].map(({ user, stream }) => ({
        userId: user.id,
        login: user.login,
        name: user.display_name || user.login,
        avatarUrl: smallAvatarUrl(user.profile_image_url),
        externalId: channelIds(gladys, user.id).device,
        live: Boolean(stream),
        viewers: Number(stream?.viewer_count) || 0,
        game: stream?.game_name ?? known?.[user.id]?.game ?? '',
        title: stream?.title ?? known?.[user.id]?.title ?? '',
        uptime: stream ? uptimeMinutes(stream.started_at, now()) : 0,
      }));
      list.sort((a, b) => b.live - a.live || b.viewers - a.viewers || a.name.localeCompare(b.name));
      return {
        channels: list,
        unknownLogins: [...unknownLogins],
        invalidEntries: [...invalidEntries],
        lastPollAt,
        configured: client !== null,
      };
    },

    /**
     * Image key of a channel avatar for the widget: it changes with the
     * avatar URL, since the core caches an image one hour by key.
     */
    avatarKey(entry) {
      return entry.avatarUrl ? `avatar-${entry.userId}-${shortHash(entry.avatarUrl)}` : null;
    },

    /** The avatar URL behind a key `avatarKey` returned, `null` if unknown. */
    avatarUrl(key) {
      const entry = monitor.snapshot().channels.find((c) => monitor.avatarKey(c) === key);
      return entry?.avatarUrl ?? null;
    },
  };
  return monitor;
}
