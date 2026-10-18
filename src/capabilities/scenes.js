// -----------------------------------------------------------------------------
// Scene actions (Gladys 5.1+).
//
// Declared in the manifest `scene_actions` field, keyed by the same `key`;
// app.js registers each one with `gladys.onSceneAction(key, ...)`. The scene
// TRIGGERS (stream started, stream ended, category changed) are fired by the
// monitor, see src/twitch/monitor.js.
//
// The rules that matter:
//   - `fields` arrive RESOLVED (scene variables substituted, defaults applied);
//   - the result is an object of the declared `outputs`, scalars only;
//   - a scene action is never a condition: "offline" is an output the scene
//     author gates on, not a failure. Throwing is kept for what the scene
//     author must fix (no credentials, a channel that does not exist);
//   - never fire a scene event in answer to an action: a scene bound to that
//     event would loop through the integration.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { parseChannels } from '../config.js';
import { uptimeMinutes } from '../devices/channel.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_ACTION_KEYS = {
  GET_STREAM_STATUS: 'get_stream_status',
  REFRESH_CHANNELS: 'refresh_channels',
};

export const SCENE_ACTIONS = {
  // Any public channel, watched or not: "is X live right now?".
  async [SCENE_ACTION_KEYS.GET_STREAM_STATUS](monitor, { fields, now = Date.now }) {
    const [login] = parseChannels(fields.channel).logins;
    if (!login) {
      throw new Error(`"${fields.channel}" is not a Twitch channel name`);
    }
    const client = monitor.client();
    if (!client) {
      throw new Error('The Twitch integration has no Client ID / Client Secret yet');
    }
    logger.info(`Scene action get_stream_status <- ${login}`);
    const [user] = await client.getUsersByLogin([login]);
    if (!user) {
      throw new Error(`Unknown Twitch channel: ${login}`);
    }
    const [stream] = await client.getStreams([user.id]);
    return {
      is_live: Boolean(stream),
      channel_name: user.display_name || user.login,
      viewer_count: Number(stream?.viewer_count) || 0,
      title: stream?.title ?? '',
      game: stream?.game_name ?? '',
      uptime_minutes: stream ? uptimeMinutes(stream.started_at, now()) : 0,
    };
  },

  // Read the watched channels now instead of waiting for the next refresh: the
  // following actions of the scene see fresh device states.
  async [SCENE_ACTION_KEYS.REFRESH_CHANNELS](monitor) {
    logger.info('Scene action refresh_channels');
    await monitor.poll();
    const { channels } = monitor.snapshot();
    return { live_count: channels.filter((channel) => channel.live).length };
  },
};
