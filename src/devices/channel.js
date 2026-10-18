// -----------------------------------------------------------------------------
// Device type: TWITCH CHANNEL
//
// One Gladys device per watched channel, read-only:
//   - live      0/1, the channel is streaming        (scene "device state")
//   - viewers   current viewer count                 (dashboard, charts)
//   - uptime    minutes since the stream started     ("live for 2 h" scenes)
//   - title     title of the stream                  (text)
//   - game      category played                      (text)
//
// The external id is built from the Twitch USER ID, never the login: a
// streamer can rename their channel, and Gladys keys the device, its history,
// its scenes and its dashboards on that id.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'channel';

export const FEATURES = {
  LIVE: 'live',
  VIEWERS: 'viewers',
  UPTIME: 'uptime',
  TITLE: 'title',
  GAME: 'game',
};

// Twitch caps a stream at 48 hours; the margin covers a clock gone wrong.
const MAX_UPTIME_MINUTES = 7 * 24 * 60;

export function channelIds(gladys, userId) {
  return gladys.externalIds(DEVICE_TYPE, userId);
}

/**
 * The discovery payload of one channel.
 * @param {object} user a Helix user: `{ id, login, display_name }`
 */
export function buildChannelDevice(gladys, user) {
  const ids = channelIds(gladys, user.id);
  // Every feature declares min/max: Gladys stores them NOT NULL.
  const feature = (key, name, category, type, extra) => ({
    name,
    external_id: ids.feature(key),
    category,
    type,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    ...extra,
  });
  return {
    name: `Twitch ${user.display_name || user.login}`,
    external_id: ids.device,
    params: [
      { name: 'login', value: user.login },
      { name: 'url', value: `https://www.twitch.tv/${user.login}` },
    ],
    features: [
      // A read-only binary switch: the one binary Gladys renders as on/off
      // everywhere (dashboard, scene "device state" trigger and condition).
      feature(
        FEATURES.LIVE,
        'Live',
        DEVICE_FEATURE_CATEGORIES.SWITCH,
        DEVICE_FEATURE_TYPES.SWITCH.BINARY,
        { min: 0, max: 1 },
      ),
      feature(
        FEATURES.VIEWERS,
        'Viewers',
        DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
        DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
        { min: 0, max: 100_000_000 },
      ),
      feature(
        FEATURES.UPTIME,
        'Uptime',
        DEVICE_FEATURE_CATEGORIES.DURATION,
        DEVICE_FEATURE_TYPES.DURATION.INTEGER,
        { min: 0, max: MAX_UPTIME_MINUTES, unit: DEVICE_FEATURE_UNITS.MINUTES },
      ),
      feature(
        FEATURES.TITLE,
        'Title',
        DEVICE_FEATURE_CATEGORIES.TEXT,
        DEVICE_FEATURE_TYPES.TEXT.TEXT,
        { min: 0, max: 140, keep_history: false },
      ),
      feature(
        FEATURES.GAME,
        'Category',
        DEVICE_FEATURE_CATEGORIES.TEXT,
        DEVICE_FEATURE_TYPES.TEXT.TEXT,
        { min: 0, max: 255, keep_history: false },
      ),
    ],
  };
}

/** Whole minutes since `startedAt` (ISO date), 0 when unknown. */
export function uptimeMinutes(startedAt, now) {
  const started = Date.parse(startedAt ?? '');
  if (Number.isNaN(started)) {
    return 0;
  }
  return Math.min(MAX_UPTIME_MINUTES, Math.max(0, Math.floor((now - started) / 60_000)));
}

/**
 * The states of one channel, in the `publishStates` format.
 *
 * Offline, title and category are left alone: they keep the last stream's,
 * which is what a dashboard wants to show ("last streamed: ..."), and Twitch
 * sends no stream to read them from anyway.
 *
 * @param {object | null} stream the Helix stream, `null` when offline
 */
export function buildChannelStates(gladys, userId, stream, now) {
  const ids = channelIds(gladys, userId);
  const state = (key, value) => ({ device_feature_external_id: ids.feature(key), state: value });
  if (!stream) {
    return [state(FEATURES.LIVE, 0), state(FEATURES.VIEWERS, 0), state(FEATURES.UPTIME, 0)];
  }
  const states = [
    state(FEATURES.LIVE, 1),
    state(FEATURES.VIEWERS, Number(stream.viewer_count) || 0),
    state(FEATURES.UPTIME, uptimeMinutes(stream.started_at, now)),
  ];
  // A stream without a title (or category) keeps the last one shown, rather
  // than blanking it.
  if (stream.title) {
    states.push({ device_feature_external_id: ids.feature(FEATURES.TITLE), text: stream.title });
  }
  if (stream.game_name) {
    states.push({ device_feature_external_id: ids.feature(FEATURES.GAME), text: stream.game_name });
  }
  return states;
}
