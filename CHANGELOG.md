# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Catalog: the integration now sits on the new **Leisure** shelf (with Multimedia and
  Notifications; it leaves the generic Services shelf), and is found by search terms such as
  "streaming", "streamer" or "gaming".

### Changed

- **Gladys 5.3.0 or later is now required** (the catalog search terms need it).
- SDK `@gladysassistant/integration-sdk` 0.16.

## [0.1.3] - 2026-10-23

- Maintenance release, no functional change. It publishes 0.1.2, which never
  got its image.

## [0.1.2] - 2026-10-23

- Not published: the Release workflow could not push the `v0.1.2` tag, so this
  version has no image and no GitHub Release. Use 0.1.3, which ships the same code.

## [0.1.1] - 2026-10-18

### Added

- One Gladys device per watched Twitch channel: live status, viewers, uptime,
  stream title and category. Channels are entered by name, `@name` or
  twitch.tv link, up to 100, and read in a single Twitch request.
- Scene triggers: stream started, stream ended (with its duration), category
  changed — filtered by channel and category.
- Scene actions: check whether any Twitch channel is live, refresh the watched
  channels now.
- "Twitch channels" dashboard widget: live count, one row per channel (avatar,
  live badge, category, viewers, title, link), refresh button; settings to
  pick the channels and show only the live ones.
- "Test the connection" button in the Configuration screen.
- Cloud transport badge on every channel device, unreachable when Twitch does
  not answer.
- The last state of every channel is kept in `/data`: a restart neither
  repeats a "stream started" nor misses one.
- English, French, German and Spanish texts and documentation.
- CI (Prettier, ESLint, tests on Node 22 and 24, store checks, Docker build),
  UI-driven Release workflow, multi-arch image on ghcr.io, a GitHub Release for
  every version, Dependabot.

[Unreleased]: https://github.com/prohand/gladys-twitch/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/prohand/gladys-twitch/compare/v0.1.1...v0.1.3
[0.1.2]: https://github.com/prohand/gladys-twitch/commit/a0a8734b58406f71479f359013ebfe2047f26a91
[0.1.1]: https://github.com/prohand/gladys-twitch/releases/tag/v0.1.1
