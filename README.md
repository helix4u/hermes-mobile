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

The supported automated host path is currently Windows with the AppData Hermes
installation and Tailscale. Start with [INSTALL.md](./INSTALL.md).

An agent can safely perform the host installation from that guide without
seeing the mobile session credential. The short path is:

```text
powershell -ExecutionPolicy Bypass -File .\scripts\link-plugin.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\install-mobile-server.ps1
tailscale serve --bg --yes 9130
powershell -ExecutionPolicy Bypass -File .\scripts\test-mobile-server.ps1
```

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

On Windows, `scripts/link-plugin.ps1` creates a development junction at
`%LOCALAPPDATA%\hermes\plugins\hermes-mobile`, refuses to replace an unrelated
path, and enables the plugin without granting tool-override permission.

The server API is mounted under:

```text
/api/plugins/hermes-mobile/v1/
```

The authenticated API exposes health, capability, observation, and one-use
WebSocket-ticket routes. The gateway route delegates JSON-RPC to Hermes's real
TUI gateway transport and dispatcher.

The Windows installer creates the current-user `Hermes_Mobile_Server`
scheduled task, stores a random 384-bit session credential in
`%LOCALAPPDATA%\hermes\mobile-server\session-token` with a current-user-only
ACL, discovers the workstation's current Tailscale MagicDNS name, and keeps
these loopback services running:

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

## Security

The browser client does not persist authentication tokens. Android credentials
are stored behind a native Keystore-backed bridge. Connection metadata and
unsent drafts are scoped by connection ID. Secret and sudo values must never be
written to the mobile event journal.
