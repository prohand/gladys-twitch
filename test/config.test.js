import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  MAX_CHANNELS,
  hasCredentials,
  normalizeConfig,
  parseChannels,
} from '../src/config.js';

test('channel names: whatever the user pasted becomes a login', () => {
  assert.deepEqual(
    parseChannels('GladysAssistant, @TwitchDev\nhttps://www.twitch.tv/Alice_42/videos; bob bob'),
    { logins: ['gladysassistant', 'twitchdev', 'alice_42', 'bob'], invalid: [] },
  );
});

test('channel names: what is not one is reported', () => {
  assert.deepEqual(parseChannels('alice, not-a-login, é'), {
    logins: ['alice'],
    invalid: ['not-a-login', 'é'],
  });
  assert.deepEqual(parseChannels(undefined), { logins: [], invalid: [] });
});

test('channel names: 100 at most, the size of one Helix request', () => {
  const many = Array.from({ length: 120 }, (_, i) => `user${i}`).join(',');
  assert.equal(parseChannels(many).logins.length, MAX_CHANNELS);
});

test('normalizeConfig fills the defaults and bounds the refresh interval', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.equal(normalizeConfig({ poll_frequency: '120' }).poll_frequency, 120);
  assert.equal(normalizeConfig({ poll_frequency: 5 }).poll_frequency, 30);
  assert.equal(normalizeConfig({ poll_frequency: 99999 }).poll_frequency, 3600);
  assert.equal(normalizeConfig({ poll_frequency: 'abc' }).poll_frequency, 60);
  assert.equal(normalizeConfig({ client_id: '  id  ' }).client_id, 'id');
});

test('hasCredentials needs both the Client ID and the Client Secret', () => {
  assert.equal(hasCredentials(normalizeConfig({ client_id: 'a' })), false);
  assert.equal(hasCredentials(normalizeConfig({ client_id: 'a', client_secret: 'b' })), true);
});
