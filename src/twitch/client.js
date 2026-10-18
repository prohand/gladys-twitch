// -----------------------------------------------------------------------------
// Twitch Helix API client.
//
// The integration only reads public data (who is live, what they stream), so
// it authenticates as an APPLICATION: the client credentials flow, with the
// Client ID and Client Secret of an app the user registers on
// dev.twitch.tv/console. No Twitch account to link, no user token to refresh.
//
// App tokens last about two months and can be revoked at any time: the client
// renews one a minute before it expires, and once more when Twitch answers
// 401 to a request.
//
// Secrets never reach the logs: neither the Client Secret nor the token.
// -----------------------------------------------------------------------------

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const HELIX_URL = 'https://api.twitch.tv/helix/';

// Helix accepts up to 100 `login`, `id` or `user_id` parameters per request.
const MAX_IDS_PER_REQUEST = 100;

const REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_EARLY_RENEWAL_MS = 60_000;

// The only host the widget images may come from: the URLs are read from the
// Twitch API answers, never from user input, but a fixed host keeps the image
// handler from fetching anything else.
const IMAGE_HOST = 'static-cdn.jtvnw.net';
export const MAX_IMAGE_BYTES = 300 * 1024;

export class TwitchApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'TwitchApiError';
    this.status = status;
  }
}

/** The Client ID / Client Secret pair was refused. */
export class TwitchAuthError extends TwitchApiError {
  constructor(status, message) {
    super(status, message);
    this.name = 'TwitchAuthError';
  }
}

function chunk(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

/**
 * @param {object} options
 * @param {string} options.clientId
 * @param {string} options.clientSecret
 * @param {typeof fetch} [options.fetch] injected by the tests
 * @param {() => number} [options.now]
 */
export function createTwitchClient({
  clientId,
  clientSecret,
  fetch = globalThis.fetch,
  now = Date.now,
}) {
  let token = null;
  let tokenExpiresAt = 0;

  async function getToken() {
    if (token && now() < tokenExpiresAt - TOKEN_EARLY_RENEWAL_MS) {
      return token;
    }
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new TwitchAuthError(response.status, 'Twitch refused the Client ID or Client Secret');
    }
    if (!response.ok) {
      throw new TwitchApiError(response.status, `Twitch token request failed (${response.status})`);
    }
    const body = await response.json();
    token = body.access_token;
    tokenExpiresAt = now() + Number(body.expires_in ?? 0) * 1000;
    return token;
  }

  async function helix(path, params) {
    const url = new URL(path, HELIX_URL);
    for (const [key, value] of params) {
      url.searchParams.append(key, value);
    }
    // Twice at most: the second time with a fresh token, when Twitch revoked
    // the one it gave (401).
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetch(url, {
        headers: { 'Client-Id': clientId, Authorization: `Bearer ${await getToken()}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status === 401 && attempt === 0) {
        token = null;
        continue;
      }
      if (response.status === 401) {
        throw new TwitchAuthError(401, 'Twitch refused the application token');
      }
      if (!response.ok) {
        throw new TwitchApiError(response.status, `Twitch API ${path} failed (${response.status})`);
      }
      return response.json();
    }
  }

  async function list(path, key, values, extraParams = []) {
    const results = [];
    for (const ids of chunk(values, MAX_IDS_PER_REQUEST)) {
      if (ids.length === 0) {
        continue;
      }
      const body = await helix(path, [...ids.map((id) => [key, id]), ...extraParams]);
      results.push(...(body.data ?? []));
    }
    return results;
  }

  return {
    /** Check the credentials: resolves once Twitch handed out a token. */
    async authenticate() {
      await getToken();
    },

    /** Users by login: `[{ id, login, display_name, profile_image_url, ... }]`. */
    getUsersByLogin(logins) {
      return list('users', 'login', logins);
    },

    /**
     * The live streams of these user ids: offline channels are simply absent.
     * `[{ id, user_id, user_login, user_name, game_name, title, viewer_count,
     * started_at, thumbnail_url, ... }]`
     */
    getStreams(userIds) {
      return list('streams', 'user_id', userIds, [['first', String(MAX_IDS_PER_REQUEST)]]);
    },

    /**
     * Download a Twitch CDN image (avatar) for the dashboard widget, as raw
     * base64. Refuses any other host and anything over the size the core
     * accepts.
     */
    async fetchImage(imageUrl) {
      const url = new URL(imageUrl);
      if (url.protocol !== 'https:' || url.hostname !== IMAGE_HOST) {
        throw new Error(`Refusing to fetch an image from ${url.hostname}`);
      }
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) {
        throw new TwitchApiError(response.status, `Image download failed (${response.status})`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_IMAGE_BYTES) {
        throw new Error(`Image too large (${bytes.length} bytes)`);
      }
      return bytes.toString('base64');
    },
  };
}
