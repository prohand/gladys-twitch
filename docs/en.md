# Twitch

Follow Twitch channels in Gladys: know who is live, in which category and for
how many viewers, start scenes when a stream begins or ends, and show the
channels on a dashboard.

The integration only reads **public** data. No Twitch account is linked: it
uses the identifiers of a free Twitch application you create once.

Requires **Gladys 5.3.0 or later**.

## 1. Create a Twitch application

1. Go to the [Twitch developer console](https://dev.twitch.tv/console/apps/create)
   and sign in with any Twitch account (two-factor authentication must be on).
2. Fill in the form:
   - **Name**: anything unique, e.g. `Gladys my-home`;
   - **OAuth Redirect URLs**: `http://localhost` (not used, but required);
   - **Category**: `Other`;
   - **Client Type**: `Confidential`.
3. Click **Create**, then **Manage** on the new application.
4. Copy the **Client ID**, then click **New Secret** and copy the **Client
   Secret** (it is only shown once).

## 2. Configure the integration

1. Open the **Configuration** tab of the integration in Gladys.
2. Paste the **Client ID** and the **Client Secret**.
3. In **Channels**, list the channels to watch, separated by commas. Names
   (`twitchdev`), `@names` and links (`https://www.twitch.tv/twitchdev`) are all
   accepted, up to 100 channels.
4. Optionally change the **Refresh interval**: Twitch is read every 60 seconds
   by default (30 seconds to one hour).
5. Save, then click **Test the connection**: the answer says how many channels
   were found, how many are live, and which names do not exist on Twitch.
6. Open the **Discovery** tab and add the channels you want as devices.

## What you get

One device per channel, named `Twitch <channel>`, with:

| Feature  | Value                                               |
| -------- | --------------------------------------------------- |
| Live     | 1 when the channel is streaming, 0 otherwise        |
| Viewers  | Current number of viewers                           |
| Uptime   | Minutes since the stream started                    |
| Title    | Title of the stream (the last one when offline)     |
| Category | Game or category played (the last one when offline) |

The device is tied to the Twitch **user id** of the channel: a streamer who
renames their channel keeps the same device, history and scenes.

## Scenes

The integration adds its own cards to the scene editor (Gladys 5.1 or later).

Triggers:

- **Twitch stream started** — a watched channel goes live. Optionally pick the
  channel and a category (exact name, e.g. `Just Chatting`). Variables:
  `{{triggerEvent.data.channel_name}}`, `title`, `game` and `url`.
- **Twitch stream ended** — a watched channel stops streaming. Variable:
  `duration_minutes`, how long the stream lasted.
- **Twitch category changed** — a live channel switches to another game.
  Variables: `game`, `previous_game`, `title`.

Actions:

- **Check a Twitch channel** — is any public channel (watched or not) live
  right now? Returns `is_live`, `channel_name`, `viewer_count`, `title`, `game`
  and `uptime_minutes`, which the following actions can use.
- **Refresh Twitch channels** — reads the watched channels now, without
  waiting for the next refresh, and returns `live_count`.

You can also use the standard **device state** trigger and condition on the
**Live** or **Viewers** features ("when more than 100 viewers…").

Example: _when a stream starts on my favourite channel, send me a message
"{{triggerEvent.data.channel_name}} is live: {{triggerEvent.data.title}}
{{triggerEvent.data.url}}"_.

## Dashboard

Add the **Twitch channels** widget to a dashboard. It shows how many channels
are live, then one row per channel: avatar, live badge, category and viewers.
Tap a row for the stream title and a link to the channel. The **Refresh**
button reads Twitch at once.

Widget settings: pick the channels to show (all when empty) and/or show only
the live ones.

## Good to know

- A stream is declared ended only after it is missing from two Twitch answers
  in a row: Twitch sometimes forgets a live stream for one request, and scenes
  would otherwise announce a stream end and a new start a minute later.
- A channel added to the list while it is already live does not fire
  **Twitch stream started**: it did not just start.
- The integration remembers the last state of each channel in its data
  volume: after a restart, a stream that was already running is not announced
  again, and a stream that started meanwhile is.

## Troubleshooting

- **"Twitch refused the Client ID or Client Secret"**: copy them again from the
  developer console. A new secret invalidates the previous one.
- **A channel is "unknown on Twitch"**: check its spelling in the channel URL.
- The device badge shows **cloud** when Twitch answers, **unreachable** when it
  does not. Check the integration logs from the Gladys interface for details.
