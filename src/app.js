// -----------------------------------------------------------------------------
// Wiring: the SDK handlers, the monitor and the capabilities.
//
// Kept out of index.js so the tests run the very same wiring against the fake
// Gladys of the SDK (`createFakeGladys`) instead of a copy of it.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { createMonitor } from './twitch/monitor.js';
import { createStateStore } from './twitch/stateStore.js';
import { createTwitchClient } from './twitch/client.js';
import { ACTIONS } from './capabilities/actions.js';
import { SCENE_ACTIONS } from './capabilities/scenes.js';
import { WIDGETS, getWidgetImage, refreshWidgets } from './capabilities/widget.js';

const logger = createLogger({ name: 'app' });

/**
 * Register every handler on `gladys` (before `connect()`).
 *
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [options] injected by the tests
 * @param {ReturnType<typeof createStateStore>} [options.stateStore]
 * @param {typeof createTwitchClient} [options.createClient]
 * @param {() => number} [options.now]
 */
export function createApp(gladys, options = {}) {
  let config = normalizeConfig();

  const monitor = createMonitor({
    gladys,
    stateStore: options.stateStore ?? createStateStore(),
    createClient: options.createClient ?? createTwitchClient,
    now: options.now,
    onChange: () => refreshWidgets(gladys),
  });

  // Apply a configuration: resolve the channels, publish them as devices,
  // read their streams, and (re)start the refresh loop.
  async function apply(rawConfig) {
    config = normalizeConfig(rawConfig);
    monitor.stop();
    try {
      const devices = await monitor.configure(config);
      await gladys.publishDiscoveredDevices(devices);
      await monitor.start();
    } catch (err) {
      // The status is already reported to the Configuration screen; the
      // next save, scan or reconnection tries again.
      logger.error(`Cannot apply the configuration: ${err.message}`);
    }
    refreshWidgets(gladys);
  }

  // --- Discovery: the user opened the Discovery tab --------------------------
  gladys.onScanRequest(async () => {
    const devices = await monitor.configure(config);
    await gladys.publishDiscoveredDevices(devices);
  });

  // --- Configuration -----------------------------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> new configuration received');
    await apply(newConfig);
  });

  // --- Configuration screen buttons -------------------------------------------
  for (const [key, handler] of Object.entries(ACTIONS)) {
    gladys.onAction(key, (fields) => handler(monitor, { fields, config }));
  }

  // --- Scene actions -------------------------------------------------------------
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(monitor, { fields, now: options.now }));
  }

  // --- Dashboard widget ------------------------------------------------------------
  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(monitor, request));
    gladys.onWidgetAction(key, (actionKey, params, { settings }) =>
      widget.action(monitor, { actionKey, params, settings }),
    );
  }
  gladys.onWidgetGetImage((key) => getWidgetImage(monitor, key));

  // --- Connection lifecycle --------------------------------------------------------
  // The SDK logs the WebSocket lifecycle itself; these handlers only run the
  // integration's own (re)initialization.
  gladys.on('connected', async () => {
    try {
      await apply(await gladys.getConfig());
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
    }
  });

  // States cannot reach a disconnected Gladys: stop reading Twitch until the
  // SDK reconnects, which re-applies the configuration.
  gladys.on('disconnected', () => monitor.stop());

  return { monitor, stop: () => monitor.stop() };
}
