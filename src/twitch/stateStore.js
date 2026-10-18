// -----------------------------------------------------------------------------
// What the integration last saw of each channel, kept across restarts.
//
// Without it, every restart (an update, a Gladys reboot) would start blind:
// either fire "stream started" for every channel already live — a scene that
// says "X is live!" would repeat itself — or stay silent about a stream that
// started while the integration was down. With it, the first poll after a
// restart compares with the last known state: same stream id, nothing new;
// another one, a new stream.
//
// /data is the only writable path of the container. A file that cannot be
// read or written is not fatal: the integration then behaves as if it had
// just been installed.
// -----------------------------------------------------------------------------

import { readFile, rename, writeFile } from 'node:fs/promises';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'state' });

export const DEFAULT_STATE_FILE = '/data/twitch-state.json';

/**
 * @param {string} file path of the JSON file
 */
export function createStateStore(file = DEFAULT_STATE_FILE) {
  let warned = false;
  return {
    /** @returns {Promise<Record<string, object>>} the channels, by user id */
    async load() {
      try {
        const content = JSON.parse(await readFile(file, 'utf8'));
        return content && typeof content.channels === 'object' ? content.channels : {};
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Cannot read ${file}, starting from scratch: ${err.message}`);
        }
        return {};
      }
    },

    /** Write through a temporary file, so a crash never leaves half a file. */
    async save(channels) {
      try {
        const tmp = `${file}.tmp`;
        await writeFile(tmp, JSON.stringify({ version: 1, channels }));
        await rename(tmp, file);
      } catch (err) {
        if (!warned) {
          warned = true;
          logger.warn(`Cannot write ${file}: ${err.message}`);
        }
      }
    },
  };
}
