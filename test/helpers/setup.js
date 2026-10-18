// -----------------------------------------------------------------------------
// The whole integration, wired by src/app.js, against the fake Gladys of the
// SDK and the fake Twitch of test/helpers/fakeTwitch.js.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';
import { createTwitchClient } from '../../src/twitch/client.js';
import { CLIENT_ID, CLIENT_SECRET, createFakeTwitch } from './fakeTwitch.js';

/** A state store in memory, shared by the "restarts" of a test. */
export function createMemoryStore(initial = {}) {
  const store = {
    channels: structuredClone(initial),
    saves: 0,
    async load() {
      return structuredClone(store.channels);
    },
    async save(channels) {
      store.saves += 1;
      store.channels = structuredClone(channels);
    },
  };
  return store;
}

/** A clock the test moves by hand. */
export function createClock(start = Date.parse('2026-10-18T20:00:00Z')) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] the integration config (credentials included by default)
 * @param {ReturnType<typeof createFakeTwitch>} [options.twitch]
 * @param {ReturnType<typeof createMemoryStore>} [options.store]
 */
export function setup(options = {}) {
  const twitch = options.twitch ?? createFakeTwitch();
  const store = options.store ?? createMemoryStore();
  const clock = options.clock ?? createClock();
  const gladys = createFakeGladys({
    selector: 'twitch',
    config: {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      channels: '',
      ...options.config,
    },
  });
  const app = createApp(gladys, {
    stateStore: store,
    now: clock.now,
    createClient: (credentials) => createTwitchClient({ ...credentials, fetch: twitch.fetch }),
  });
  return { gladys, twitch, store, clock, app, monitor: app.monitor };
}

/** The scene events Gladys received, as `[key, data]`. */
export function sceneEvents(gladys) {
  return gladys.fake.sceneEvents.map((event) => [event.key, event.data]);
}
