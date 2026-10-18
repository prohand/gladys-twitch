// -----------------------------------------------------------------------------
// Dashboard widget "Twitch channels" (Gladys 5.1+).
//
// Declared in the manifest `widgets` field; app.js registers `get` with
// `gladys.onWidgetGet` and `action` with `gladys.onWidgetAction`. The content
// is declarative — the core renders it with its own theme and dark mode:
//   - a tile: how many watched channels are live;
//   - a list: one row per channel (avatar, LIVE badge, category and viewers,
//     the stream title and a link to the channel in the detail panel);
//   - a "Refresh" button.
//
// Per-instance settings: show only the live channels, and/or only some of the
// channels (empty: all of them).
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { localize, pick } from '../i18n.js';

const logger = createLogger({ name: 'widget' });

export const CHANNELS_WIDGET = 'twitch_channels';

const WIDGET_ACTIONS = { REFRESH: 'refresh' };

// A `list` card-list holds 8 rows at most.
const MAX_ROWS = 8;

const TEXTS = {
  liveNow: { en: 'Live now', fr: 'En direct', de: 'Jetzt live', es: 'En directo' },
  live: { en: 'LIVE', fr: 'EN DIRECT', de: 'LIVE', es: 'EN DIRECTO' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Desconectado' },
  refresh: { en: 'Refresh', fr: 'Rafraîchir', de: 'Aktualisieren', es: 'Actualizar' },
  watch: {
    en: 'Watch on Twitch',
    fr: 'Regarder sur Twitch',
    de: 'Auf Twitch ansehen',
    es: 'Ver en Twitch',
  },
  notConfigured: {
    en: 'Enter the Twitch application credentials in the integration configuration.',
    fr: "Saisissez les identifiants de l'application Twitch dans la configuration de l'intégration.",
    de: 'Geben Sie die Zugangsdaten der Twitch-Anwendung in der Konfiguration der Integration ein.',
    es: 'Introduzca las credenciales de la aplicación de Twitch en la configuración de la integración.',
  },
  noChannel: {
    en: 'No channel to show.',
    fr: 'Aucune chaîne à afficher.',
    de: 'Kein Kanal anzuzeigen.',
    es: 'Ningún canal que mostrar.',
  },
  refreshed: {
    en: 'Channels refreshed',
    fr: 'Chaînes rafraîchies',
    de: 'Kanäle aktualisiert',
    es: 'Canales actualizados',
  },
};

// `n` is the count, `shown` how it is written (1.2k).
const VIEWERS = {
  en: (n, shown) => `${shown} viewer${n === 1 ? '' : 's'}`,
  fr: (n, shown) => `${shown} spectateur${n > 1 ? 's' : ''}`,
  de: (n, shown) => `${shown} Zuschauer`,
  es: (n, shown) => `${shown} espectador${n === 1 ? '' : 'es'}`,
};

const MORE = {
  en: (n) => `And ${n} more channel${n === 1 ? '' : 's'}.`,
  fr: (n) => `Et ${n} autre${n > 1 ? 's' : ''} chaîne${n > 1 ? 's' : ''}.`,
  de: (n) => `Und ${n} weitere${n === 1 ? 'r Kanal' : ' Kanäle'}.`,
  es: (n) => `Y ${n} canal${n === 1 ? '' : 'es'} más.`,
};

// Compact counts for a short subtitle: 1234 -> "1.2k" (or "1,2k").
function formatCount(n, language) {
  if (n < 1000) {
    return String(n);
  }
  const compact = n < 1_000_000 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1_000_000).toFixed(1)}M`;
  return language === 'en' ? compact : compact.replace('.', ',');
}

function subtitle(channel) {
  if (!channel.live) {
    return localize((language) =>
      channel.game
        ? `${pick(language, TEXTS.offline)} · ${channel.game}`
        : pick(language, TEXTS.offline),
    );
  }
  return localize((language) => {
    const viewers = pick(language, VIEWERS)(
      channel.viewers,
      formatCount(channel.viewers, language),
    );
    return channel.game ? `${channel.game} · ${viewers}` : viewers;
  });
}

function row(monitor, channel) {
  const item = {
    title: channel.name,
    subtitle: subtitle(channel),
    badge: channel.live
      ? { text: TEXTS.live, color: WIDGET_COLORS.DANGER }
      : { text: TEXTS.offline, color: WIDGET_COLORS.NEUTRAL },
    links: [{ url: `https://www.twitch.tv/${channel.login}`, label: TEXTS.watch }],
  };
  const image = monitor.avatarKey(channel);
  if (image) {
    item.image = image;
  }
  if (channel.title) {
    // Twitch titles hold 140 characters: far below the 2000 allowed.
    item.description = channel.title;
  }
  return item;
}

/** Keep the channels the widget instance asked for. */
function selectChannels(channels, settings = {}) {
  const chosen = Array.isArray(settings.channels) ? settings.channels : [];
  return channels.filter(
    (channel) =>
      (chosen.length === 0 || chosen.includes(channel.externalId)) &&
      (!settings.only_live || channel.live),
  );
}

export const WIDGETS = {
  [CHANNELS_WIDGET]: {
    async get(monitor, { settings }) {
      logger.debug(`onWidgetGet <- ${CHANNELS_WIDGET}`);
      const snapshot = monitor.snapshot();
      if (!snapshot.configured) {
        return {
          ttl_seconds: 300,
          components: [{ type: 'text', variant: 'body', text: TEXTS.notConfigured }],
        };
      }
      const shown = selectChannels(snapshot.channels, settings);
      const components = [
        {
          type: 'value',
          label: TEXTS.liveNow,
          icon: 'radio',
          value: shown.filter((channel) => channel.live).length,
          color: shown.some((channel) => channel.live)
            ? WIDGET_COLORS.DANGER
            : WIDGET_COLORS.NEUTRAL,
        },
      ];
      if (shown.length === 0) {
        components.push({ type: 'text', variant: 'caption', text: TEXTS.noChannel });
      } else {
        components.push({
          type: 'card-list',
          display: 'list',
          items: shown.slice(0, MAX_ROWS).map((channel) => row(monitor, channel)),
        });
        if (shown.length > MAX_ROWS) {
          const more = shown.length - MAX_ROWS;
          components.push({
            type: 'text',
            variant: 'caption',
            text: localize((language) => pick(language, MORE)(more)),
          });
        }
      }
      components.push({
        type: 'button',
        label: TEXTS.refresh,
        icon: 'refresh-cw',
        style: 'secondary',
        action: { key: WIDGET_ACTIONS.REFRESH },
      });
      // The monitor nudges the widget when a channel goes live or offline or
      // changes category; the TTL refreshes the viewer counts.
      return { ttl_seconds: 60, components };
    },

    // After a successful action the core drops its cached content and every
    // open dashboard re-pulls it: no nudge needed.
    async action(monitor, { actionKey }) {
      logger.info(`onWidgetAction <- ${CHANNELS_WIDGET}.${actionKey}`);
      if (actionKey === WIDGET_ACTIONS.REFRESH) {
        await monitor.poll();
        return TEXTS.refreshed;
      }
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  },
};

/**
 * The avatar behind an image key of the content, as raw base64. Only the keys
 * the content declared resolve: the URL comes from the Twitch API answer.
 */
export async function getWidgetImage(monitor, key) {
  const url = monitor.avatarUrl(key);
  const client = monitor.client();
  if (!url || !client) {
    throw new Error(`Unknown widget image: ${key}`);
  }
  return client.fetchImage(url);
}

/** Ask the core to re-pull every widget now (rate-limited core-side). */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
