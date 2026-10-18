// -----------------------------------------------------------------------------
// Configuration screen actions (manifest `actions`).
//
// "Test the connection": checks the credentials and the channel list against
// Twitch, and says in the user's words what is wrong — the message resolved
// here is displayed under the button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { localize, pick } from '../i18n.js';
import { TwitchAuthError } from '../twitch/client.js';

const logger = createLogger({ name: 'actions' });

export const ACTION_KEYS = { TEST_CONNECTION: 'test_connection' };

const PARTS = {
  noCredentials: {
    en: 'Enter the Client ID and Client Secret of your Twitch application, then save.',
    fr: 'Saisissez le Client ID et le Client Secret de votre application Twitch, puis enregistrez.',
    de: 'Geben Sie die Client-ID und das Client-Secret Ihrer Twitch-Anwendung ein und speichern Sie.',
    es: 'Introduzca el Client ID y el Client Secret de su aplicación de Twitch y guarde.',
  },
  authRefused: {
    en: 'Twitch refused the Client ID or Client Secret: copy them again from dev.twitch.tv/console.',
    fr: 'Twitch a refusé le Client ID ou le Client Secret : recopiez-les depuis dev.twitch.tv/console.',
    de: 'Twitch hat die Client-ID oder das Client-Secret abgelehnt: kopieren Sie sie erneut von dev.twitch.tv/console.',
    es: 'Twitch ha rechazado el Client ID o el Client Secret: cópielos de nuevo desde dev.twitch.tv/console.',
  },
  unreachable: {
    en: 'Twitch cannot be reached:',
    fr: 'Twitch est injoignable :',
    de: 'Twitch ist nicht erreichbar:',
    es: 'No se puede acceder a Twitch:',
  },
  connected: {
    en: 'Connected to Twitch.',
    fr: 'Connecté à Twitch.',
    de: 'Mit Twitch verbunden.',
    es: 'Conectado a Twitch.',
  },
  noChannel: {
    en: 'No channel to watch yet: add some in the "Channels" field.',
    fr: 'Aucune chaîne suivie : ajoutez-en dans le champ « Chaînes ».',
    de: 'Noch kein Kanal: fügen Sie welche im Feld „Kanäle“ hinzu.',
    es: 'Todavía ningún canal: añada alguno en el campo «Canales».',
  },
};

const WATCHED = {
  en: (n, live) => `${n} channel${n === 1 ? '' : 's'} watched, ${live} live.`,
  fr: (n, live) => `${n} chaîne${n > 1 ? 's' : ''} suivie${n > 1 ? 's' : ''}, ${live} en direct.`,
  de: (n, live) => `${n} ${n === 1 ? 'Kanal' : 'Kanäle'} beobachtet, ${live} live.`,
  es: (n, live) =>
    `${n} canal${n === 1 ? '' : 'es'} seguido${n === 1 ? '' : 's'}, ${live} en directo.`,
};

const UNKNOWN = {
  en: (list) => `Unknown on Twitch: ${list}.`,
  fr: (list) => `Introuvable sur Twitch : ${list}.`,
  de: (list) => `Auf Twitch nicht gefunden: ${list}.`,
  es: (list) => `No encontrado en Twitch: ${list}.`,
};

const INVALID = {
  en: (list) => `Not a channel name: ${list}.`,
  fr: (list) => `Pas un nom de chaîne : ${list}.`,
  de: (list) => `Kein Kanalname: ${list}.`,
  es: (list) => `No es un nombre de canal: ${list}.`,
};

/**
 * Run the connection test with the CURRENT configuration (the one saved):
 * re-resolve the channels, read their streams, and report.
 */
async function testConnection(monitor, { config }) {
  logger.info('Action test_connection');
  try {
    await monitor.configure(config);
    const client = monitor.client();
    if (!client) {
      return PARTS.noCredentials;
    }
    await client.authenticate();
    await monitor.poll();
  } catch (err) {
    if (err instanceof TwitchAuthError) {
      return PARTS.authRefused;
    }
    return localize((language) => `${pick(language, PARTS.unreachable)} ${err.message}`);
  }
  const { channels, unknownLogins, invalidEntries } = monitor.snapshot();
  return localize((language) => {
    const parts = [pick(language, PARTS.connected)];
    if (channels.length === 0) {
      parts.push(pick(language, PARTS.noChannel));
    } else {
      const live = channels.filter((channel) => channel.live).length;
      parts.push(pick(language, WATCHED)(channels.length, live));
    }
    if (unknownLogins.length > 0) {
      parts.push(pick(language, UNKNOWN)(unknownLogins.join(', ')));
    }
    if (invalidEntries.length > 0) {
      parts.push(pick(language, INVALID)(invalidEntries.join(', ')));
    }
    return parts.join(' ');
  });
}

export const ACTIONS = {
  [ACTION_KEYS.TEST_CONNECTION]: testConnection,
};
