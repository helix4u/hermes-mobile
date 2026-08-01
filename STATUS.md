# Hermes Mobile Current Status

Last updated: 2026-07-31

Current milestone: Mobile pet personality catalog and Desktop-bound host lifecycle

## Current result

- Mobile now bundles all seven local pet definitions plus thirteen adapted
  Hermes defaults in a grouped picker that remains available without pet RPCs.
- Alien Child's prior Mobile definition is unchanged and remains the default.
- A connection-scoped editor covers name, description, tap lines, ambient
  commentary, and full sidechat prompts. Reset restores the immutable source
  definition, and edits do not cross saved connections.
- Desktop-bound Windows hosting now exits cleanly with Desktop and recovers
  through a plugin-owned recurring trigger after Desktop reopens. A forced
  listener stop recovered automatically in 15.8 seconds while Desktop remained
  open.
- Focused and full client tests, typecheck, production build, Capacitor sync,
  and Android debug assembly pass.

## Recent changes retained here

### 1. Mobile personality catalog and editor

The app owns a safe offline catalog containing Alien Child, Dr. House, Fight
Club Narrator, Gremlin, Noir Build Detective, Ponytail Principal, Shipbreaker
QA, and thirteen adapted Hermes defaults. Host-only definitions merge after
capability discovery. Structured connection-scoped edits never overwrite a
host or bundled file.

### 2. Explicit Windows host lifecycle

The Mobile host exposes start, stop, restart, status, and uninstall. Startup is
selectable as Desktop-bound, persistent, or manual. Desktop-bound mode retires
the backend, proxy, and supervisor when the packaged Desktop exits. A
plugin-owned one-minute task trigger restores all three after Desktop reopens,
including recovery when the prior supervisor was externally killed.

### 3. Forced connected-server plugin update

Control can force-replace an active `hermes-mobile` plugin even when the
hardcoded semantic version is unchanged. The target comes from the authenticated
plugin registry and remains guarded by path, size, upload, enablement, and
restart checks.

### 4. Mobile voice and wake path

Mobile has connection-scoped provider/voice selection, adaptive buffered TTS,
openWakeWord capture with review/auto-send modes, explicit capture cues, and
host transcription. Long-output and device-power acceptance continues during
ordinary use.

### 5. Pet companion reliability

Pet movement is border-aware, direct drag remains user-owned, and automatic
commentary has turn-scoped cancellation so Stop and terminal turn events clear
pending generation and queued speech.

## Known constraints

- Vanilla Cloud hosts can lack Mobile plugin routes and local custom providers;
  the client must capability-check and degrade without presenting expected 404s.
- A complete revisioned event journal is still required for perfect tool/event
  replay after process death.
- Very large inline media inherits the authenticated data-route size limit;
  download remains the fallback until a streaming seam exists.
- Very long podcast export currently assembles a mono WAV in client memory.
- Physical background, screen-off, wake-word, and provider timing behavior
  remains distinct from automated verification.

## Validation state

- Desktop Reader UI: 1 focused file, 9 tests passed; Desktop TypeScript
  typecheck and production build passed.
- Mobile personality/pet/settings slice: 6 focused files and 38 tests passed;
  the full Mobile client suite passed 51 files and 241 tests. Mobile TypeScript
  typecheck, Vite production
  build, Capacitor sync, and Android debug assembly with JDK 21 passed.
- Python prompt guidance compiled and an import smoke check confirmed both the
  Desktop and `hermes-mobile` Reader handoff hints.
- Scoped `git diff --check` and unmerged-entry checks pass in both repositories.
- Desktop test executable:
  `..\hermes-agent\apps\desktop\release-reader-xai-20260731\win-unpacked\Hermes.exe`
  (214,281,216 bytes, SHA-256
  `8200B0205D3B4866A085551D59D29751F0AB491A930128E0ACF398F5BB46488C`).
- Current Mobile debug APK:
  `client\android\app\build\outputs\apk\debug\app-debug.apk`
  (127,118,953 bytes, SHA-256
  `B6E8D7CAC47AF819FCBFD9B166C9E6EA6334EE323E1D30AB85FB8F760CE4D346`).
- No phone installation or device inspection is authorized in the current turn.

## Next action

Install the APK in a later explicitly authorized device turn or download it
manually. Confirm the seven local presets and adapted defaults appear, edit and
reset one preset, switch hosts to prove isolation, and confirm Workstation
reconnects automatically after Desktop closes and reopens.
