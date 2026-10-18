import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTwitchClient, TwitchAuthError, MAX_IMAGE_BYTES } from '../src/twitch/client.js';
import { CLIENT_ID, CLIENT_SECRET, createFakeTwitch } from './helpers/fakeTwitch.js';

function clientFor(twitch, secret = CLIENT_SECRET) {
  return createTwitchClient({ clientId: CLIENT_ID, clientSecret: secret, fetch: twitch.fetch });
}

test('reuses its app token, and takes a new one when Twitch revokes it', async () => {
  const twitch = createFakeTwitch();
  twitch.addUser({ id: '1', login: 'alice' });
  const client = clientFor(twitch);
  const tokenRequests = () => twitch.requests.filter((r) => r.url.includes('id.twitch.tv')).length;

  await client.getUsersByLogin(['alice']);
  await client.getUsersByLogin(['alice']);
  assert.equal(tokenRequests(), 1);

  twitch.revokeTokens();
  const [user] = await client.getUsersByLogin(['alice']);
  assert.equal(user.id, '1');
  assert.equal(tokenRequests(), 2);
});

test('refused credentials throw a TwitchAuthError', async () => {
  const client = clientFor(createFakeTwitch(), 'wrong');
  await assert.rejects(client.authenticate(), TwitchAuthError);
});

test('asks Helix 100 channels at a time', async () => {
  const twitch = createFakeTwitch();
  const ids = Array.from({ length: 150 }, (_, i) => String(i + 1));
  for (const id of ids) {
    twitch.addUser({ id, login: `user${id}` });
  }
  twitch.goLive('1');
  twitch.goLive('150');
  const client = clientFor(twitch);
  const streams = await client.getStreams(ids);
  assert.deepEqual(streams.map((s) => s.user_id).sort(), ['1', '150']);
  assert.equal(twitch.requests.filter((r) => r.url.includes('/helix/streams')).length, 2);
});

test('only fetches images from the Twitch CDN, within the size the core accepts', async () => {
  const twitch = createFakeTwitch();
  const client = clientFor(twitch);
  const url = 'https://static-cdn.jtvnw.net/jtv_user_pictures/a-profile_image-150x150.png';
  twitch.setImage(url, Buffer.from('png-bytes'));
  assert.equal(await client.fetchImage(url), Buffer.from('png-bytes').toString('base64'));

  await assert.rejects(client.fetchImage('https://example.com/a.png'), /Refusing/);
  await assert.rejects(client.fetchImage('http://static-cdn.jtvnw.net/a.png'), /Refusing/);

  const big = 'https://static-cdn.jtvnw.net/jtv_user_pictures/big.png';
  twitch.setImage(big, Buffer.alloc(MAX_IMAGE_BYTES + 1));
  await assert.rejects(client.fetchImage(big), /too large/);
});

test('never puts the secret in a URL', async () => {
  const twitch = createFakeTwitch();
  twitch.addUser({ id: '1', login: 'alice' });
  await clientFor(twitch).getUsersByLogin(['alice']);
  for (const request of twitch.requests) {
    assert.ok(!request.url.includes(CLIENT_SECRET), request.url);
  }
});
