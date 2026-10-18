// -----------------------------------------------------------------------------
// The monitor through the whole wiring: devices, states, scene triggers,
// connection status and transport badge.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore, sceneEvents, setup } from './helpers/setup.js';
import { createFakeTwitch } from './helpers/fakeTwitch.js';
import { OFFLINE_CONFIRMATIONS, SCENE_TRIGGERS } from '../src/twitch/monitor.js';

const DEVICE = 'ext:twitch:channel:1';

function twoChannels() {
  const twitch = createFakeTwitch();
  twitch.addUser({ id: '1', login: 'alice', display_name: 'Alice' });
  twitch.addUser({ id: '2', login: 'bob', display_name: 'Bob' });
  return twitch;
}

async function start(options = {}) {
  const ctx = setup({ twitch: twoChannels(), config: { channels: 'alice, bob' }, ...options });
  await ctx.gladys.connect();
  return ctx;
}

test('one device per channel, keyed on the Twitch user id', async (t) => {
  const { gladys, app } = await start({ config: { channels: '@Alice, https://twitch.tv/bob' } });
  t.after(app.stop);
  const devices = gladys.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => [device.name, device.external_id]),
    [
      ['Twitch Alice', 'ext:twitch:channel:1'],
      ['Twitch Bob', 'ext:twitch:channel:2'],
    ],
  );
  assert.deepEqual(
    devices[0].features.map((feature) => feature.external_id.split(':').pop()),
    ['live', 'viewers', 'uptime', 'title', 'game'],
  );
  for (const feature of devices[0].features) {
    assert.equal(feature.read_only, true);
    assert.equal(typeof feature.min, 'number', `${feature.external_id} declares min`);
    assert.equal(typeof feature.max, 'number', `${feature.external_id} declares max`);
  }
});

test('publishes the live stream states, offline channels at 0', async (t) => {
  const twitch = twoChannels();
  twitch.goLive('1', {
    title: 'Speedrun',
    game_name: 'Celeste',
    viewer_count: 42,
    started_at: '2026-10-18T19:00:00Z',
  });
  const { gladys, app } = await start({ twitch });
  t.after(app.stop);
  const last = (key, id = 1) => gladys.fake.lastState(`ext:twitch:channel:${id}:${key}`);
  assert.equal(last('live'), 1);
  assert.equal(last('viewers'), 42);
  assert.equal(last('uptime'), 60);
  assert.equal(last('title'), 'Speedrun');
  assert.equal(last('game'), 'Celeste');
  assert.equal(last('live', 2), 0);
  assert.equal(last('viewers', 2), 0);
});

test('a first sight is a baseline: no "stream started" for a channel already live', async (t) => {
  const twitch = twoChannels();
  twitch.goLive('1');
  const { gladys, app } = await start({ twitch });
  t.after(app.stop);
  assert.deepEqual(sceneEvents(gladys), []);
});

test('fires stream_online, category_changed and stream_offline on the transitions', async (t) => {
  const { gladys, twitch, monitor, clock, app } = await start();
  t.after(app.stop);

  twitch.goLive('1', {
    id: 's1',
    title: 'Hello',
    game_name: 'Chess',
    started_at: new Date(clock.time).toISOString(),
  });
  await monitor.poll();
  assert.deepEqual(sceneEvents(gladys), [
    [
      SCENE_TRIGGERS.STREAM_ONLINE,
      {
        channel: DEVICE,
        channel_name: 'Alice',
        login: 'alice',
        title: 'Hello',
        game: 'Chess',
        url: 'https://www.twitch.tv/alice',
      },
    ],
  ]);

  // Same stream, same category: nothing new.
  await monitor.poll();
  assert.equal(gladys.fake.sceneEvents.length, 1);

  twitch.update('1', { game_name: 'Go' });
  await monitor.poll();
  assert.deepEqual(sceneEvents(gladys)[1], [
    SCENE_TRIGGERS.CATEGORY_CHANGED,
    {
      channel: DEVICE,
      channel_name: 'Alice',
      login: 'alice',
      game: 'Go',
      previous_game: 'Chess',
      title: 'Hello',
    },
  ]);

  clock.advance(90 * 60_000);
  twitch.goOffline('1');
  for (let i = 0; i < OFFLINE_CONFIRMATIONS; i += 1) {
    await monitor.poll();
  }
  assert.deepEqual(sceneEvents(gladys)[2], [
    SCENE_TRIGGERS.STREAM_OFFLINE,
    { channel: DEVICE, channel_name: 'Alice', login: 'alice', duration_minutes: 90 },
  ]);
  assert.equal(gladys.fake.lastState(`${DEVICE}:live`), 0);
  // Offline, the last title and category stay.
  assert.equal(gladys.fake.lastState(`${DEVICE}:game`), 'Go');
});

test('a stream missing from one answer is not declared offline', async (t) => {
  const { gladys, twitch, monitor, app } = await start();
  t.after(app.stop);
  twitch.goLive('1', { id: 's1' });
  await monitor.poll();
  const events = gladys.fake.sceneEvents.length;

  twitch.dropStreams = 1;
  await monitor.poll();
  assert.equal(gladys.fake.lastState(`${DEVICE}:live`), 1);
  await monitor.poll();
  assert.equal(gladys.fake.sceneEvents.length, events, 'no offline, no second online');
  assert.equal(gladys.fake.lastState(`${DEVICE}:live`), 1);
});

test('a new stream id is a new stream, even without an offline poll in between', async (t) => {
  const { gladys, twitch, monitor, app } = await start();
  t.after(app.stop);
  twitch.goLive('1', { id: 's1' });
  await monitor.poll();
  twitch.goLive('1', { id: 's2' });
  await monitor.poll();
  assert.deepEqual(
    sceneEvents(gladys).map(([key]) => key),
    [SCENE_TRIGGERS.STREAM_ONLINE, SCENE_TRIGGERS.STREAM_ONLINE],
  );
});

test('a restart remembers what it saw: no event for the same stream, one for a new one', async (t) => {
  const store = createMemoryStore();
  const twitch = twoChannels();
  twitch.goLive('1', { id: 's1' });
  const first = await start({ twitch, store });
  first.app.stop();
  assert.equal(store.channels['1'].stream_id, 's1');

  const second = await start({ twitch, store });
  t.after(second.app.stop);
  assert.deepEqual(sceneEvents(second.gladys), [], 'same stream after the restart');

  // Went offline and live again while the integration was down.
  twitch.goLive('1', { id: 's2' });
  const third = await start({ twitch, store });
  t.after(third.app.stop);
  assert.deepEqual(
    sceneEvents(third.gladys).map(([key]) => key),
    [SCENE_TRIGGERS.STREAM_ONLINE],
  );
});

test('reports the connection and the cloud transport, unreachable when Twitch fails', async (t) => {
  const { gladys, twitch, monitor, app } = await start();
  t.after(app.stop);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.deepEqual(
    gladys.fake.transports.map((entry) => [entry.device_external_id, entry.transport]),
    [
      ['ext:twitch:channel:1', 'cloud'],
      ['ext:twitch:channel:2', 'cloud'],
    ],
  );

  twitch.failWith = 503;
  await monitor.poll();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /injoignable/);
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');

  twitch.failWith = null;
  await monitor.poll();
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.equal(gladys.fake.transports.at(-1).transport, 'cloud');
});

test('without credentials: no device, a status that says what to do', async (t) => {
  const { gladys, app } = await start({ config: { client_id: '', client_secret: '' } });
  t.after(app.stop);
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  for (const language of ['en', 'fr', 'de', 'es']) {
    assert.ok(gladys.fake.connectionStatus.message[language], `message in ${language}`);
  }
});

test('refused credentials are reported as such', async (t) => {
  const { gladys, app } = await start({ config: { client_secret: 'wrong' } });
  t.after(app.stop);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused/);
});

test('a saved configuration re-publishes the channel list', async (t) => {
  const { gladys, app } = await start({ config: { channels: 'alice' } });
  t.after(app.stop);
  assert.equal(gladys.fake.discoveredDevices.length, 1);
  await gladys.fake.configUpdated({ ...gladys.fake.config, channels: 'alice bob' });
  assert.equal(gladys.fake.discoveredDevices.length, 2);
});

test('the scan request publishes the channels', async (t) => {
  const { gladys, app } = await start();
  t.after(app.stop);
  await gladys.fake.scanRequest();
  assert.equal(gladys.fake.discoveredDevices.length, 2);
});

test('a channel that went live nudges the widget', async (t) => {
  const { gladys, twitch, monitor, app } = await start();
  t.after(app.stop);
  const before = gladys.fake.widgetRefreshes.length;
  await monitor.poll();
  assert.equal(gladys.fake.widgetRefreshes.length, before, 'nothing changed, no nudge');
  twitch.goLive('2');
  await monitor.poll();
  assert.equal(gladys.fake.widgetRefreshes.length, before + 1);
});
