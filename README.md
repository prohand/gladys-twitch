# Twitch for Gladys Assistant

External integration for [Gladys Assistant](https://gladysassistant.com) that
follows **Twitch** channels: live status, viewers, uptime, title and category
as Gladys devices, scene triggers when a stream starts, ends or changes
category, scene actions, and a dashboard widget.

- **Type**: `device` — one device per watched channel.
- **Transport**: `cloud` (the Twitch Helix API, read-only, public data).
- **Gladys**: 5.1.0 or later (scene triggers, scene actions, widgets).
- **Languages**: English, French, German, Spanish.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## Features

| Surface              | Key                 | What it does                                                  |
| -------------------- | ------------------- | ------------------------------------------------------------- |
| Device (per channel) | `channel:<user id>` | `live`, `viewers`, `uptime` (min), `title`, `game` features   |
| Scene trigger        | `stream_online`     | A watched channel goes live (filters: channel, category)      |
| Scene trigger        | `stream_offline`    | A watched channel stops streaming (variable: duration)        |
| Scene trigger        | `category_changed`  | A live channel switches category (filters: channel, category) |
| Scene action         | `get_stream_status` | Is any public channel live? (outputs: live, viewers, title…)  |
| Scene action         | `refresh_channels`  | Read the watched channels now (output: live count)            |
| Dashboard widget     | `twitch_channels`   | Live count, one row per channel, refresh button               |
| Configuration button | `test_connection`   | Checks the credentials and the channel list                   |

## How it works

```
               every poll_frequency s (default 60)
 Gladys  <--  monitor  -- 1 request / 100 channels -->  api.twitch.tv/helix/streams
   ^            |
   |            +-- publishChangedStates   (device features, changes only)
   |            +-- publishSceneEvent      (start / end / category, on transitions)
   |            +-- setConnectionStatus    (Configuration screen)
   |            +-- publishTransports      (cloud / unreachable badge)
   |            +-- requestWidgetRefresh   (when the widget would change)
   |
   +-- /data/twitch-state.json  (last state per channel, survives restarts)
```

Authentication uses the client credentials flow: the user registers a free
application on the [Twitch developer console](https://dev.twitch.tv/console/apps/create)
and pastes its Client ID and Client Secret. No Twitch account is linked.

## Project structure

```
.
├─ index.js                          # SDK bootstrap + shutdown
├─ src/
│  ├─ app.js                         # wiring of the SDK handlers (shared with the tests)
│  ├─ config.js                      # defaults, normalization, channel list parser
│  ├─ i18n.js                        # en / fr / de / es helpers
│  ├─ twitch/client.js               # Helix client (app token, users, streams, avatars)
│  ├─ twitch/monitor.js              # poll loop, states, scene triggers, status
│  ├─ twitch/stateStore.js           # last states in /data
│  ├─ devices/channel.js             # the channel device
│  └─ capabilities/                  # actions.js, scenes.js, widget.js
├─ docs/{en,fr,de,es}.md             # user documentation (re-hosted by Gladys)
├─ test/                             # node --test, fake Gladys (SDK) + fake Twitch
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs, /data volume
├─ CHANGELOG.md                      # Keep a Changelog, rolled by the Release workflow
├─ CLAUDE.md                         # project rules for coding assistants & contributors
├─ SECURITY.md                       # how to report a vulnerability privately
├─ .github/workflows/ci.yml          # format, lint, tests (Node 22 + 24), store checks, Docker build
├─ .github/workflows/release.yml     # UI-driven release: bump + changelog + tag + build
├─ .github/workflows/build.yml       # multi-arch build (git tag, manual or called by release)
├─ .github/workflows/github-release.yml # GitHub Release of every version tag
├─ .github/scripts/changelog-release.mjs # changelog roll, tested in test/release.test.js
├─ .github/dependabot.yml            # npm weekly, GitHub Actions and Docker monthly
└─ cover.png                         # catalog cover, 800×534 px
```

## Development

```bash
npm install
npm test                 # unit tests, no network
npm run lint             # ESLint
npm run format:check     # Prettier
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run it against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="twitch" \
LOG_LEVEL=debug \
npm start
```

Outside the container, `/data` does not exist: the integration logs a warning
and simply does not persist the channel states.

## Release

1. Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
2. **Actions → Release → Run workflow**, pick `patch`, `minor` or `major`.

The workflow bumps `package.json` and the manifest (`version` +
`docker_image`), rolls the changelog, tags `vX.Y.Z`, builds the
`linux/amd64` + `linux/arm64` image to `ghcr.io/prohand/gladys-twitch`
(`:X.Y.Z` and `:latest`) and publishes the GitHub Release. The Gladys store
indexer then offers the new version.

Before the first publication: add the GitHub topic
`gladys-assistant-integration`, make the ghcr.io package public, and turn on
**Private vulnerability reporting** (see [`SECURITY.md`](SECURITY.md)). If
`main` is protected, allow GitHub Actions to push the release commit.

## License

Apache-2.0. Twitch is a trademark of Twitch Interactive, Inc.; this project is
not affiliated with or endorsed by Twitch.
