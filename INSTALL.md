# Hermes Mobile Installation

This guide installs the standalone Hermes Mobile server plugin and a persistent
tailnet-only Hermes backend. It does not modify Hermes core.

The automated host manager supports Windows, macOS, and Linux. It detects the
normal Hermes installation under `%LOCALAPPDATA%\hermes` on Windows or
`~/.hermes` on macOS and Linux. A non-default installation can be selected with
`--hermes-home` and `--hermes-executable`.

## What the installation creates

- A guarded plugin link under the active Hermes home's `plugins/hermes-mobile`
  pointing to this checkout's `server-plugin` directory.
- An enabled `hermes-mobile` plugin with tool overrides disabled.
- A current-user service:
  - Windows Scheduled Task: `Hermes_Mobile_Server`
  - macOS launchd agent: `dev.hermes.mobile-server`
  - Linux user-systemd unit: `hermes-mobile-server.service`
- An authenticated Hermes backend on `127.0.0.1:9129`.
- A host-validating proxy on `127.0.0.1:9130`.
- A random session credential at `<Hermes home>/mobile-server/session-token`,
  readable only by the current user (`0600` with a `0700` state directory on
  macOS/Linux; a current-user-only ACL in the Windows implementation).

The two listeners remain loopback-only. Tailscale Serve publishes port 9130 to
the user's tailnet over HTTPS.

## Prerequisites

- A working Hermes installation.
- Python 3.11 or later. The host manager uses Hermes's own virtual environment.
- On Windows, PowerShell 7 available as `pwsh.exe`.
- On macOS, a logged-in GUI session with per-user launchd available.
- On Linux, a working `systemctl --user` session.
- Tailscale installed, signed in, online, and using MagicDNS.
- This repository cloned to a stable path that will not be moved while the
  native service is installed.

For the Android app build, Node.js 22, npm 11, Android Studio, Android SDK 36,
and Android Studio's bundled JDK 21 are also required.

## Install or update the host plugin

From this repository on every supported operating system:

```text
python scripts/mobile_host.py install
```

The command refuses to replace an unrelated plugin link or native service,
enables the plugin without tool overrides, creates the protected credential,
installs or refreshes the platform-native user service, waits for both loopback
listeners, publishes the validating proxy with Tailscale Serve, and performs an
authenticated health check. Existing unrelated Tailscale Serve configuration
is never replaced automatically.

Verify the installation without printing the credential:

```text
python scripts/mobile_host.py status
```

The verification must report the scheduled task, both listeners, authenticated
health, and a compatible or explicitly degraded compatibility response.

## Put the connection on the phone

The user should run this command locally. Agents and captured automation should
not run it because `--reveal-token` intentionally prints the credential:

```text
python scripts/mobile_host.py show --reveal-token
```

In Hermes Mobile:

1. Add a `Tailnet HTTPS` connection.
2. Enter the printed HTTPS address.
3. Enter the printed token.
4. Connect and select or create a session.

The token is a secret. Do not paste it into chat, issue reports, screenshots,
terminal transcripts, or repository files.

## Connect an existing Docker or remote gateway

Hermes Mobile can use a normal Hermes dashboard gateway without installing this
repository's server plugin in the container. This core-gateway mode supports
profiles, stored sessions, projects, and live sessions; the capability screen
marks replay and recoverable-request extensions unavailable.

The Android app requires a trusted HTTPS URL. Configure the Docker dashboard's
canonical authentication gate and TLS/VPN exposure using the Hermes Docker and
Web Dashboard documentation; do not publish an unauthenticated dashboard, use
the removed/deprecated insecure bypass, or expose raw HTTP to the internet.
Username/password auth is intended for trusted networks or VPNs, while a public
internet deployment should use OAuth/OIDC.

In Hermes Mobile:

1. Add a `Direct HTTPS` connection and enter the externally reachable dashboard
   URL, including any path prefix.
2. Tap Connect. Android probes `/api/health` before attempting plugin or
   WebSocket routes.
3. If the gateway reports `auth_required`, complete its password/OAuth page in
   the native sign-in window. Do not enter a legacy session token for this mode.
4. If the gateway is not gated, enter its session token instead.

The app validates an existing gated session by minting a one-use core WebSocket
ticket and opens sign-in again when that session is absent or expired. Session
cookies remain in Android's native cookie store and are never copied into web
storage. A 404 from the Mobile plugin capability route falls back to the core
gateway; any other plugin error still fails closed so an installed but
incompatible plugin cannot be silently bypassed.

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

## Reconnect a paired Wireless debugging device

Android owns the Wireless debugging switch and rotates its ADB TLS port. A
normal application cannot silently enable that protected setting or read the
private port. Hermes Mobile's collapsed `Mobile companion` control opens
Android's own Wireless debugging or Developer options screen.

While that screen is open, the workstation can discover the current paired
port and connect without typing it:

```text
pwsh -File scripts/connect-android-wireless.ps1
```

When more than one paired phone is visible, select the intended device by its
already-known IP address:

```text
pwsh -File scripts/connect-android-wireless.ps1 -DeviceIp <phone-ip>
```

The helper uses ADB's `_adb-tls-connect._tcp` mDNS service, never pairs a new
device, and refuses ambiguous results. `-ListOnly` prints the candidates
without connecting. mDNS is local-link discovery and normally does not traverse
Tailscale; a Tailnet IP shown by Android therefore does not reveal the rotating
port to this helper. Android may also stop advertising Wireless debugging while
the screen is off, after a reboot, or under device-specific power policy; the
app does not scan ports or bypass those OS controls.

## Update an existing checkout

Pull the desired revision, rerun focused validation, then rerun:

```text
python scripts/mobile_host.py install
python scripts/mobile_host.py status
```

The plugin link follows the checkout. Reinstalling refreshes and restarts the
matching native service so the Hermes process imports the updated plugin code.

Remove the macOS or Linux native service definition with:

```text
python scripts/mobile_host.py uninstall
```

Uninstall intentionally leaves the credential, plugin link, and Tailscale Serve
configuration in place. This avoids silently deleting reusable credentials or
unrelated Serve routes. Windows service removal remains an explicit Task
Scheduler operation.

## Agent handoff contract

An installation agent should report only:

- Repository revision and checkout path.
- Hermes executable and plugin junction path.
- Whether the platform-native user service is running.
- Whether ports 9129 and 9130 are loopback listeners.
- The authenticated health and compatibility result.
- Whether Tailscale Serve maps HTTPS to port 9130.

It must not print or return the session token. The user performs the explicit
`-RevealToken` step locally.

## Current limits

- Windows service removal remains manual.
- Native mobile connections require HTTPS/WSS.
- Tailscale Serve setup is tailnet-only, not public internet hosting.
- The repository is an alpha side project and currently has no public release
  channel.
- Hermes Cloud sign-in uses the mobile app's native Nous authentication path
  and does not require this plugin on the selected Cloud agent.
