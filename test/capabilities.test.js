// -----------------------------------------------------------------------------
// Configuration screen action, scene actions and dashboard widget, through the
// handlers app.js registers (the fake Gladys plays the core's side).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { setup } from './helpers/setup.js';
import { createFakeTwitch } from './helpers/fakeTwitch.js';
import { CHANNELS_WIDGET } from '../src/capabilities/widget.js';
import { LANGUAGES } from '../src/i18n.js';

function channels(count = 2) {
  const twitch = createFakeTwitch();
  for (let i = 1; i <= count; i += 1) {
    twitch.addUser({ id: String(i), login: `user${i}`, display_name: `User ${i}` });
  }
  return twitch;
}

async function start({ twitch = channels(), config = {} } = {}) {
  const logins = [...Array(10).keys()].map((i) => `user${i + 1}`).join(',');
  const ctx = setup({ twitch, config: { channels: logins, ...config } });
  await ctx.gladys.connect();
  return ctx;
}

const widgetGet = (gladys, settings = {}, language = 'en') =>
  gladys.fake.widgetGet(CHANNELS_WIDGET, { settings, language, units: 'metric' });

// --- Configuration screen ------------------------------------------------------

test('test_connection: counts the channels and names the unknown ones', async (t) => {
  const twitch = channels();
  twitch.goLive('1');
  const { gladys, app } = await start({ twitch, config: { channels: 'user1, user2, ghost, a-b' } });
  t.after(app.stop);
  const { success, data } = await gladys.fake.action('test_connection', {});
  assert.equal(success, true);
  assert.equal(
    data.message.en,
    'Connected to Twitch. 2 channels watched, 1 live. Unknown on Twitch: ghost. Not a channel name: a-b.',
  );
  assert.deepEqual(Object.keys(data.message), LANGUAGES);
});

test('test_connection: refused credentials', async (t) => {
  const { gladys, app } = await start({ config: { client_secret: 'wrong' } });
  t.after(app.stop);
  const { data } = await gladys.fake.action('test_connection', {});
  assert.match(data.message.fr, /refusé/);
});

test('test_connection: no credentials', async (t) => {
  const { gladys, app } = await start({ config: { client_id: '', client_secret: '' } });
  t.after(app.stop);
  const { data } = await gladys.fake.action('test_connection', {});
  assert.match(data.message.en, /Client ID/);
});

// --- Scene actions ---------------------------------------------------------------

test('get_stream_status: any channel, live or not', async (t) => {
  const twitch = channels(3);
  twitch.goLive('3', {
    title: 'Live coding',
    game_name: 'Software and Game Development',
    viewer_count: 7,
    started_at: '2026-10-18T19:30:00Z',
  });
  // user3 is not in the watched list.
  const { gladys, app } = await start({ twitch, config: { channels: 'user1' } });
  t.after(app.stop);

  const live = await gladys.fake.sceneAction('get_stream_status', { channel: '@User3' });
  assert.deepEqual(live.data.outputs ?? live.data, {
    is_live: true,
    channel_name: 'User 3',
    viewer_count: 7,
    title: 'Live coding',
    game: 'Software and Game Development',
    uptime_minutes: 30,
  });

  const offline = await gladys.fake.sceneAction('get_stream_status', { channel: 'user1' });
  assert.equal((offline.data.outputs ?? offline.data).is_live, false);

  const unknown = await gladys.fake.sceneAction('get_stream_status', { channel: 'ghost' });
  assert.equal(unknown.success, false);
});

test('refresh_channels: polls now and counts the live channels', async (t) => {
  const { gladys, twitch, app } = await start();
  t.after(app.stop);
  twitch.goLive('1');
  twitch.goLive('2');
  const { success, data } = await gladys.fake.sceneAction('refresh_channels', {});
  assert.equal(success, true);
  assert.equal((data.outputs ?? data).live_count, 2);
  assert.equal(gladys.fake.lastState('ext:twitch:channel:2:live'), 1);
});

// --- Dashboard widget ---------------------------------------------------------------

test('widget: valid content in every language, live channels first', async (t) => {
  const twitch = channels(3);
  twitch.goLive('2', { game_name: 'Chess', viewer_count: 1234, title: 'Blitz' });
  const { gladys, app } = await start({ twitch });
  t.after(app.stop);
  for (const language of LANGUAGES) {
    const { success, data } = await widgetGet(gladys, {}, language);
    assert.equal(success, true);
    assert.deepEqual(validateWidgetContent(data.content), [], language);
  }
  const { data } = await widgetGet(gladys);
  const tile = data.content.components.find((c) => c.type === 'value');
  assert.equal(tile.value, 1);
  const list = data.content.components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    list.items.map((item) => item.title),
    ['User 2', 'User 1', 'User 3'],
  );
  assert.equal(list.items[0].subtitle.en, 'Chess · 1.2k viewers');
  assert.equal(list.items[0].subtitle.fr, 'Chess · 1,2k spectateurs');
  assert.equal(list.items[0].description, 'Blitz');
  assert.equal(list.items[0].links[0].url, 'https://www.twitch.tv/user2');
});

test('widget: the settings filter the channels', async (t) => {
  const twitch = channels(3);
  twitch.goLive('2');
  const { gladys, app } = await start({ twitch });
  t.after(app.stop);
  const titles = async (settings) =>
    (await widgetGet(gladys, settings)).data.content.components
      .find((c) => c.type === 'card-list')
      ?.items.map((item) => item.title);
  assert.deepEqual(await titles({ only_live: true }), ['User 2']);
  assert.deepEqual(await titles({ channels: ['ext:twitch:channel:3'] }), ['User 3']);
  assert.equal(await titles({ only_live: true, channels: ['ext:twitch:channel:3'] }), undefined);
});

test('widget: more channels than rows, and the empty states, stay valid', async (t) => {
  const { gladys, app } = await start({ twitch: channels(10) });
  t.after(app.stop);
  const { data } = await widgetGet(gladys);
  assert.deepEqual(validateWidgetContent(data.content), []);
  const caption = data.content.components.find((c) => c.variant === 'caption');
  assert.equal(caption.text.en, 'And 2 more channels.');

  const empty = await widgetGet(gladys, { only_live: true });
  assert.deepEqual(validateWidgetContent(empty.data.content), []);

  const unconfigured = await start({ config: { client_id: '', client_secret: '' } });
  t.after(unconfigured.app.stop);
  const none = await widgetGet(unconfigured.gladys);
  assert.deepEqual(validateWidgetContent(none.data.content), []);
});

test('widget: the refresh button polls and answers a toast', async (t) => {
  const { gladys, twitch, app } = await start();
  t.after(app.stop);
  twitch.goLive('1');
  const { success, data } = await gladys.fake.widgetAction(CHANNELS_WIDGET, 'refresh', {}, {});
  assert.equal(success, true);
  assert.ok(JSON.stringify(data).includes('Channels refreshed'));
  assert.equal(gladys.fake.lastState('ext:twitch:channel:1:live'), 1);
});

test('widget: avatars are served for the keys of the content only', async (t) => {
  const twitch = channels(1);
  const avatar = 'https://static-cdn.jtvnw.net/jtv_user_pictures/user1-profile_image-150x150.png';
  twitch.setImage(avatar, Buffer.from('avatar'));
  const { gladys, app } = await start({ twitch });
  t.after(app.stop);
  const { data } = await widgetGet(gladys);
  const [item] = data.content.components.find((c) => c.type === 'card-list').items;
  assert.match(item.image, /^avatar-1-[0-9a-f]{10}$/);

  const image = await gladys.fake.widgetGetImage(item.image);
  assert.equal(image.success, true);
  assert.equal(image.data.image, Buffer.from('avatar').toString('base64'));

  const unknown = await gladys.fake.widgetGetImage('avatar-9-0000000000');
  assert.equal(unknown.success, false);
});
