// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in the Configuration screen, from the `config_schema`
// of `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes the received object, so the rest of the code never deals with
// `undefined`, strings typed in a number field or a channel list pasted with
// URLs and `@` signs.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// manifest `config_schema` (checked by test/manifest.test.js).
export const DEFAULT_CONFIG = {
  client_id: '',
  client_secret: '',
  channels: '',
  // Seconds between two reads of the Twitch API. One request covers up to 100
  // channels, so a minute stays far below the 800 points a minute an app token
  // is granted.
  poll_frequency: 60,
};

export const MIN_POLL_FREQUENCY = 30;
export const MAX_POLL_FREQUENCY = 3600;

// One Helix request answers up to 100 channels: more would need several
// requests per poll for a dashboard nobody can read anyway.
export const MAX_CHANNELS = 100;

// Twitch logins: letters, digits and underscores, 25 characters at most.
const LOGIN_PATTERN = /^[a-z0-9_]{1,25}$/;

/**
 * Turn the free text of the `channels` field into Twitch logins.
 *
 * Users paste what they have at hand: `gladysassistant`, `@GladysAssistant`,
 * `https://www.twitch.tv/gladysassistant`, one per line or comma-separated.
 * Everything becomes a lowercase login; what still is not one is reported, so
 * the "Test the connection" action can name it.
 *
 * @param {unknown} raw the `channels` config value
 * @returns {{ logins: string[], invalid: string[] }}
 */
export function parseChannels(raw) {
  const logins = [];
  const invalid = [];
  for (const entry of String(raw ?? '').split(/[\s,;]+/)) {
    if (!entry) {
      continue;
    }
    const login = entry
      .replace(/^(https?:\/\/)?(www\.|m\.)?twitch\.tv\//i, '')
      .replace(/^@/, '')
      .replace(/[/?#].*$/, '')
      .toLowerCase();
    if (!LOGIN_PATTERN.test(login)) {
      invalid.push(entry);
    } else if (!logins.includes(login)) {
      logins.push(login);
    }
  }
  return { logins: logins.slice(0, MAX_CHANNELS), invalid };
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const pollFrequency = Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    client_id: String(raw.client_id ?? '').trim(),
    client_secret: String(raw.client_secret ?? '').trim(),
    channels: String(raw.channels ?? ''),
    poll_frequency: Number.isFinite(pollFrequency)
      ? Math.min(MAX_POLL_FREQUENCY, Math.max(MIN_POLL_FREQUENCY, pollFrequency))
      : DEFAULT_CONFIG.poll_frequency,
  };
}

/** Whether the config carries what the Twitch API needs. */
export function hasCredentials(config) {
  return config.client_id !== '' && config.client_secret !== '';
}
