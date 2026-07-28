# Hermes Mobile Installation

This guide installs the standalone Hermes Mobile server plugin and a persistent
tailnet-only Hermes backend. It does not modify Hermes core.

The automated path currently targets the Windows/AppData Hermes installation:

```text
%LOCALAPPDATA%\hermes\hermes-agent\venv\Scripts\hermes.exe
```

## What the installation creates

- A junction at `%LOCALAPPDATA%\hermes\plugins\hermes-mobile` pointing to this
  checkout's `server-plugin` directory.
- An enabled `hermes-mobile` plugin with tool overrides disabled.
- A current-user scheduled task named `Hermes_Mobile_Server`.
- An authenticated Hermes backend on `127.0.0.1:9129`.
- A host-validating proxy on `127.0.0.1:9130`.
- A random session credential at
  `%LOCALAPPDATA%\hermes\mobile-server\session-token`, readable only by the
  current Windows user.

The two listeners remain loopback-only. Tailscale Serve publishes port 9130 to
the user's tailnet over HTTPS.

## Prerequisites

- A working Windows/AppData Hermes installation.
- PowerShell 7 available as `pwsh.exe`.
- Tailscale installed, signed in, online, and using MagicDNS.
- This repository cloned to a stable path that will not be moved while the
  scheduled task is installed.

For the Android app build, Node.js 22, npm 11, Android Studio, Android SDK 36,
and Android Studio's bundled JDK 21 are also required.

## Install or update the host plugin

From this repository:

```text
powershell -ExecutionPolicy Bypass -File .\scripts\link-plugin.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\install-mobile-server.ps1
```

The first command refuses to replace an unrelated plugin directory. The second
command refuses to replace an unrelated scheduled task, stops an older matching
task when necessary, registers the current checkout path, starts the backend,
and waits for its loopback listener.

Publish the validating proxy to the tailnet:

```text
tailscale serve --bg --yes 9130
```

Verify the installation without printing the credential:

```text
powershell -ExecutionPolicy Bypass -File .\scripts\test-mobile-server.ps1
```

The verification must report the scheduled task, both listeners, authenticated
health, and a compatible or explicitly degraded compatibility response.

## Put the connection on the phone

The user should run this command locally. Agents and captured automation should
not run it because it intentionally prints the credential:

```text
powershell -ExecutionPolicy Bypass -File .\scripts\show-mobile-connection.ps1 -RevealToken
```

In Hermes Mobile:

1. Add a `Tailnet HTTPS` connection.
2. Enter the printed HTTPS address.
3. Enter the printed token.
4. Connect and select or create a session.

The token is a secret. Do not paste it into chat, issue reports, screenshots,
terminal transcripts, or repository files.

## Build and install the Android app

Install dependencies and run validation:

```text
npm ci
npm run typecheck
npm test
npm run build
python -m unittest discover -s tests/server -v
```

Synchronize Capacitor and build the debug APK:

```text
npm run android:sync --workspace @hermes-mobile/client
cd client\android
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
gradlew.bat assembleDebug
```

The APK is written to:

```text
client\android\app\build\outputs\apk\debug\app-debug.apk
```

Install it with Android Studio, or with ADB after explicitly selecting the
intended device:

```text
adb -s <device-serial> install -r client\android\app\build\outputs\apk\debug\app-debug.apk
```

`-r` preserves the app's stored connection registry and Android Keystore
credentials.

## Update an existing checkout

Pull the desired revision, rerun focused validation, then rerun:

```text
powershell -ExecutionPolicy Bypass -File .\scripts\link-plugin.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\install-mobile-server.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\test-mobile-server.ps1
```

The plugin junction follows the checkout. Restarting the matching scheduled
task is required so the Hermes process imports the updated plugin code.

## Agent handoff contract

An installation agent should report only:

- Repository revision and checkout path.
- Hermes executable and plugin junction path.
- Whether `Hermes_Mobile_Server` is running.
- Whether ports 9129 and 9130 are loopback listeners.
- The authenticated health and compatibility result.
- Whether Tailscale Serve maps HTTPS to port 9130.

It must not print or return the session token. The user performs the explicit
`-RevealToken` step locally.

## Current limits

- The automated persistent-host setup is Windows-specific.
- Native mobile connections require HTTPS/WSS.
- Tailscale Serve setup is tailnet-only, not public internet hosting.
- The repository is an alpha side project and currently has no public release
  channel.
- Hermes Cloud sign-in uses the mobile app's native Nous authentication path
  and does not require this plugin on the selected Cloud agent.
