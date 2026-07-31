# Hermes Mobile

Hermes Mobile is an independent remote client for Hermes Agent.

The project contains:

- An installable Hermes server plugin that exposes a versioned mobile contract.
- A React client that runs in a browser and is wrapped by Capacitor for Android.

Hermes remains responsible for agents, models, tools, sessions, files, and
durable conversation history. The plugin adapts the installed Hermes version to
the stable contract used by the mobile client.

This project does not modify Hermes core.

The repository is currently a private side-project alpha. It is structured so
the same install guide can become public onboarding later, but there is no
public release or support guarantee yet.

## Install the plugin

The automated host path supports Windows, macOS, and Linux Hermes installations
with Tailscale. Start with [INSTALL.md](./INSTALL.md).

An agent can safely perform the host installation from that guide without
seeing the mobile session credential. The short path is:

```text
python scripts/mobile_host.py install
python scripts/mobile_host.py status
```

Windows can bind the Mobile backend to Desktop lifetime with
`python scripts/mobile_host.py install --startup desktop`, keep it independent
with `--startup persistent`, or require explicit starts with `--startup manual`.
The same manager exposes `start`, `stop`, `restart`, and `uninstall`; see
`INSTALL.md` for the ownership and cleanup guarantees.

The final connection token is intentionally revealed only by a separate,
explicit user command documented in `INSTALL.md`.

## Project status

The first server, browser, and Android vertical slices are runnable. The server
plugin loads in Hermes `0.19.0`, the browser client can use the Hermes gateway,
and the Android project produces a debug APK with native credential, HTTP,
WebSocket, and microphone bridges. The Android client also includes native Nous
portal login, Cloud organization and agent discovery, silent per-agent sign-in,
rich tool and reasoning transcripts, slash commands, model/config/toolset/cron
controls, safe GitHub-flavored Markdown with copyable code blocks,
Hermes-backed speech-to-text, and reply playback on the phone. Cloud agents
without the standalone plugin use the existing core Hermes gateway.

Read [PLAN.md](./PLAN.md) for the durable implementation plan and
[STATUS.md](./STATUS.md) for the exact current checkpoint.

## Development

Prerequisites:

- Node.js 22 or later
- npm 11 or later
- A current Hermes Agent installation for live integration
- Android Studio with JDK 21 and Android SDK 36 for Android builds

Install JavaScript dependencies:

```text
npm install
```

Run the web client:

```text
npm run dev
```

Run focused validation:

```text
npm run typecheck
npm test
npm run build
python -m unittest discover -s tests/server -v
```

## Server plugin

`scripts/mobile_host.py install` creates a guarded plugin link under the active
Hermes home, refuses to replace an unrelated path, and enables the plugin
without granting tool-override permission. It delegates persistence to a
Windows Scheduled Task, macOS launchd agent, or Linux user-systemd unit.

The server API is mounted under:

```text
/api/plugins/hermes-mobile/v1/
```

The authenticated API exposes health, capability, observation, and one-use
WebSocket-ticket routes. The gateway route delegates JSON-RPC to Hermes's real
TUI gateway transport and dispatcher.

The Mobile app's Control page can also install the bundled server package on a
connected host. When the plugin is already active, **Force update server
plugin** resolves its exact path through Hermes's authenticated plugin
registry, requires an explicit confirmation, and overwrites the verified
package files even when the reported semantic version is unchanged. Restart
the host afterward so its plugin routes reload the replacement source.

The host manager stores a random 384-bit session credential under
`<Hermes home>/mobile-server/session-token` with current-user-only access,
discovers the workstation's current Tailscale MagicDNS name, and keeps these
loopback services running:

```text
127.0.0.1:9129  authenticated hermes serve backend
127.0.0.1:9130  Host-validating HTTP/WebSocket proxy
```

The proxy exists because Tailscale Serve preserves the tailnet hostname while
Hermes correctly rejects non-loopback Host headers on a loopback bind. It
accepts only the discovered tailnet hostname or a loopback hostname and
rewrites the upstream authority without changing Hermes core.

## Android

Build and synchronize the web assets:

```text
npm run android:sync --workspace @hermes-mobile/client
```

Build the debug APK with JDK 21:

```text
cd client\android
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
gradlew.bat assembleDebug
```

The APK is written to:

```text
client\android\app\build\outputs\apk\debug\app-debug.apk
```

Native connections require HTTPS/WSS. A credential entered during connection
setup is encrypted with an Android Keystore-backed AES-GCM key. Native HTTP and
WebSocket traffic reads the credential inside Android code, exchanges it for a
short-lived one-use WebSocket ticket, and does not retrieve it back into
JavaScript.

For a workstation connection, choose `Tailnet HTTPS`, enter the Tailscale Serve
hostname and session credential, then Connect. For Hermes Cloud, use `Sign in
with Nous`; the native sign-in window stores the portal and per-agent HttpOnly
cookies outside JavaScript, lists the account's organizations and agents, and
connects the selected agent through its ordinary Hermes JSON-RPC gateway.

An existing Docker or remote Hermes dashboard can also be added as `Direct
HTTPS`; it does not need the Mobile plugin for basic sessions and live chat.
Android probes the public `/api/health` metadata before connecting. An unlocked
gateway keeps the legacy session-token flow, while a gateway reporting
`auth_required` opens that host's own password/OAuth sign-in and reuses its
HttpOnly session cookies. If the Mobile plugin is absent, the app explicitly
reports degraded core-gateway mode because replay and recoverable-request
extensions are unavailable. Do not expose an unauthenticated dashboard or raw
HTTP endpoint to the public internet; use trusted HTTPS plus Hermes's dashboard
auth gate, preferably behind a VPN for username/password deployments.

## Security

The browser client does not persist authentication tokens. Android credentials
are stored behind a native Keystore-backed bridge. Connection metadata and
unsent drafts are scoped by connection ID. Secret and sudo values must never be
written to the mobile event journal.
