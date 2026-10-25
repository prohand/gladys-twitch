# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for **Twitch** (Node 22+, ESM, no
build step, one runtime dependency: `@gladysassistant/integration-sdk`). It
started from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js)
and runs in its own sandboxed Docker container.

It watches public Twitch channels with an **app access token** (client
credentials: the Client ID / Client Secret of an app the user registers on
dev.twitch.tv) — no Twitch account is linked. Cloud only: the manifest
declares `"transports": ["cloud"]`. Gladys 5.3+ (`gladys_version >=5.3.0`, for the
catalog `keywords`; scene triggers, scene actions and the dashboard widget need 5.1).

## Commands

```bash
npm install
npm test                                     # node --test, the built-in runner
node --test test/monitor.test.js             # one file
node --test --test-name-pattern "restart"    # tests whose name matches
npm run lint                                 # ESLint
npm run format:check                         # Prettier, as the CI runs it
npm run format                               # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24; pull requests also run the store checks and build the Docker
image. Run the three commands before pushing.

## Architecture

```
index.js                     SDK bootstrap + shutdown only
src/app.js                   wiring: SDK handlers, monitor, capabilities (shared with the tests)
src/config.js                DEFAULT_CONFIG (mirrors the manifest defaults), channel list parser
src/i18n.js                  LANGUAGES (en, fr, de, es), pick, localize
src/twitch/client.js         Helix client: app token, users, streams, CDN avatars
src/twitch/monitor.js        poll loop: states, scene triggers, status, transport, widget snapshot
src/twitch/stateStore.js     last state of each channel in /data (survives restarts)
src/devices/channel.js       the channel device: features and states
src/capabilities/actions.js  Configuration screen button (test_connection)
src/capabilities/scenes.js   scene actions (get_stream_status, refresh_channels)
src/capabilities/widget.js   dashboard widget (twitch_channels) + avatars
gladys-assistant-integration.json  manifest
docs/{en,fr,de,es}.md        user documentation, re-hosted by Gladys
test/helpers/fakeTwitch.js   in-memory Twitch (a fake `fetch`)
test/helpers/setup.js        the app against the SDK's fake Gladys + fake Twitch
.github/scripts/changelog-release.mjs  changelog roll of the Release workflow
```

### Invariants worth knowing

- **External ids are forever.** A channel device is keyed on the Twitch **user
  id** (`gladys.externalIds('channel', userId)`), never the login: a streamer
  can rename their channel. The same goes for every key users store: manifest
  `config_schema`, `actions`, scene trigger / action keys and their fields,
  widget key and settings, feature keys.
- **One request per poll.** The monitor drives its own timer (no
  `should_poll`) and asks Helix for up to 100 channels at once.
- **Offline is confirmed twice** (`OFFLINE_CONFIRMATIONS`): Helix sometimes
  drops a live stream from one answer.
- **Events fire on transitions only**: a channel seen for the first time is a
  baseline, a new stream id is a new stream, the persisted state in
  `/data/twitch-state.json` carries this across restarts.
- **Never fire a scene event from an action**: a scene bound to it would loop.
- **The container rootfs is read-only.** Write only under `/data`. Never log
  the Client Secret nor the token.
- Widget images are fetched only from `https://static-cdn.jtvnw.net`, from URLs
  the Twitch API gave.

## Rules

- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section.
- **Manifest.** Every text is `{ "en", "fr", "de", "es" }` — `label`,
  `description` and `placeholder` alike (`test/manifest.test.js` enforces the
  four languages). The catalog `description` holds 10 to 100 characters per
  language. The manifest test ties actions, scene triggers / actions and
  widgets to their handlers: change both sides together. It also pins the
  catalog fields: `categories` (1–3, `leisure` among them), `keywords` (1–10
  unique terms of 2–30 characters), no `countries` (Twitch is worldwide), and
  the `>=5.3.0` floor they require.
- **User-facing text** (action messages, connection status, widget) is
  `{ en, fr, de, es }`, built with `src/i18n.js`; `docs/en.md`, `docs/fr.md`,
  `docs/de.md` and `docs/es.md` are kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network: use `test/helpers/fakeTwitch.js`.
