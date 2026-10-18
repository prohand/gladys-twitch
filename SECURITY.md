# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of
[prohand/gladys-twitch](https://github.com/prohand/gladys-twitch/security), then
**Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove the Client ID, Client Secret, tokens and
  addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## What the integration handles

- The **Client Secret** of the user's Twitch application: stored by Gladys as
  a `secret` field (never sent back to the browser), sent only to
  `id.twitch.tv` over HTTPS, never logged.
- The **app access token** Twitch returns: kept in memory only, sent only to
  `api.twitch.tv`, never logged nor written to disk.
- The widget avatars: downloaded only from `https://static-cdn.jtvnw.net`, from
  URLs given by the Twitch API, 300 KB at most.
- `/data/twitch-state.json`: the last live state of each watched channel
  (public data, no secret).

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Twitch.
