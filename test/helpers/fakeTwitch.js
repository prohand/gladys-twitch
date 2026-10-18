// -----------------------------------------------------------------------------
// An in-memory Twitch: a `fetch` that answers like id.twitch.tv and the Helix
// API, so the tests never touch the network.
//
//   const twitch = createFakeTwitch();
//   twitch.addUser({ id: '1', login: 'alice' });
//   twitch.goLive('1', { title: 'Hello', game_name: 'Chess', viewer_count: 12 });
//   createTwitchClient({ clientId, clientSecret, fetch: twitch.fetch });
// -----------------------------------------------------------------------------

export const CLIENT_ID = 'test-client-id';
export const CLIENT_SECRET = 'test-client-secret';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function createFakeTwitch() {
  const users = new Map();
  const streams = new Map();
  const images = new Map();
  let tokenCounter = 0;
  const validTokens = new Set();

  const twitch = {
    requests: [],
    // Set to make the next Helix requests fail with this status.
    failWith: null,
    // Helix answers that leave the live streams out (eventual consistency).
    dropStreams: 0,

    addUser({ id, login, display_name: displayName, profile_image_url: avatar }) {
      users.set(id, {
        id,
        login,
        display_name: displayName ?? login,
        profile_image_url:
          avatar ??
          `https://static-cdn.jtvnw.net/jtv_user_pictures/${login}-profile_image-300x300.png`,
      });
    },

    goLive(userId, stream = {}) {
      const user = users.get(userId);
      streams.set(userId, {
        id: stream.id ?? `stream-${userId}-${Date.now()}-${Math.random()}`,
        user_id: userId,
        user_login: user.login,
        user_name: user.display_name,
        type: 'live',
        title: 'A stream',
        game_name: 'Just Chatting',
        viewer_count: 0,
        started_at: new Date().toISOString(),
        ...stream,
      });
    },

    update(userId, changes) {
      Object.assign(streams.get(userId), changes);
    },

    goOffline(userId) {
      streams.delete(userId);
    },

    setImage(url, bytes) {
      images.set(url, bytes);
    },

    /** Revoke every token handed out so far (Twitch answers 401). */
    revokeTokens() {
      validTokens.clear();
    },

    async fetch(input, init = {}) {
      const url = new URL(String(input));
      twitch.requests.push({ url: url.toString(), method: init.method ?? 'GET' });

      if (url.hostname === 'id.twitch.tv') {
        const body = new URLSearchParams(init.body);
        if (body.get('client_id') !== CLIENT_ID || body.get('client_secret') !== CLIENT_SECRET) {
          return json(403, { status: 403, message: 'invalid client secret' });
        }
        tokenCounter += 1;
        const token = `token-${tokenCounter}`;
        validTokens.add(token);
        return json(200, { access_token: token, expires_in: 5000000, token_type: 'bearer' });
      }

      if (url.hostname === 'static-cdn.jtvnw.net') {
        const bytes = images.get(url.toString());
        return bytes ? new Response(bytes, { status: 200 }) : new Response('', { status: 404 });
      }

      if (url.hostname !== 'api.twitch.tv') {
        throw new Error(`Unexpected request to ${url.hostname}`);
      }
      const headers = new Headers(init.headers);
      const token = headers.get('Authorization')?.replace(/^Bearer /, '');
      if (headers.get('Client-Id') !== CLIENT_ID || !validTokens.has(token)) {
        return json(401, { status: 401, message: 'Invalid OAuth token' });
      }
      if (twitch.failWith) {
        return json(twitch.failWith, { status: twitch.failWith, message: 'failure' });
      }

      if (url.pathname === '/helix/users') {
        const logins = url.searchParams.getAll('login');
        const data = [...users.values()].filter((user) => logins.includes(user.login));
        return json(200, { data });
      }
      if (url.pathname === '/helix/streams') {
        const ids = url.searchParams.getAll('user_id');
        if (twitch.dropStreams > 0) {
          twitch.dropStreams -= 1;
          return json(200, { data: [], pagination: {} });
        }
        const data = ids.filter((id) => streams.has(id)).map((id) => ({ ...streams.get(id) }));
        return json(200, { data, pagination: {} });
      }
      return json(404, { status: 404, message: 'Not Found' });
    },
  };
  twitch.fetch = twitch.fetch.bind(twitch);
  return twitch;
}
