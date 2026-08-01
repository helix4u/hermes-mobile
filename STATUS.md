# Hermes Mobile Current Status

Last updated: 2026-08-01

Current milestone: Pet-sidechat streaming speech and active-turn voice control

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
- Inline remote attachments now use stable Markdown renderer identities plus a
  connection-scoped in-memory preview cache. Concurrent remounts share one host
  request, completed previews survive transport replacement or disconnect, and
  refresh failures no longer clear a successful document. The cache is bounded
  to 24 entries and 32 MiB total with a 16 MiB per-entry ceiling, and attachment
  contents never cross saved connection IDs.
- The top host pill now distinguishes Degraded, Connecting, Reconnecting,
  Connection failed, and intentionally disconnected states. A connected
  core-gateway compatibility fallback reads `Degraded · <host>` and uses the
  warning color rather than appearing fully compatible or disconnected.
- The current verified debug APK was replacement-installed on the intended
  authorized Android test device over the explicitly supplied ADB endpoint. The `-r` install
  retained saved application data and Android Keystore credentials. Android
  reports package update time `2026-08-01 02:04:56`; a cold launch completed in
  522 ms and left the expected application process running with no error-priority
  log record, fatal exception, or ANR signature in its captured process tail.
- Pet poke TTS now uses keyed replacement. Rapid taps retain only the newest
  pending poke and prepare its audio without stopping the current poke. A
  successful returned payload triggers the active-poke handoff; failed or
  superseded renders leave current playback alone. Pokes never displace
  ordinary reply, Reader, generated-commentary, or sidechat speech.
- The pet overlay now spans the full usable phone viewport. Automatic movement
  uses meaningful horizontal and vertical travel, turns inward before edges,
  has a 40 px/s minimum, and re-clamps safely after rotation, split-screen, or
  keyboard-driven viewport changes.
- The overlay is now portaled directly to `document.body` and sized from
  `window.visualViewport`; the middle workspace row is no longer a movement or
  drag authority.
- Auto-speak now consumes assistant deltas during generation. Natural speech
  preparation uses one-, three-, and five-sentence batches, paragraph breaks,
  and a bounded word fallback for punctuation-free output, while playback stays
  strictly ordered.
- Synthesis is rate-limit aware: ordinary Mobile speech uses connection-scoped
  provider timing and playback-rate metrics to choose conservative chunk and
  look-ahead behavior, and Reader persists an explicit one-to-three parallel
  render cap per connection.
- Pet transcript Listen, interaction, observer, preview, and sidechat playback
  now share that segmented/adaptive engine while retaining the effective pet
  provider, custom or cloned voice, and pet playback speed. Sidechat no longer
  falls through to the ordinary reply voice or a one-piece render.
- Pet work is priority-ordered rather than skipped: automatic observations do
  not multiply while pet generation or playback is pending, accepted in-flight
  commentary may finish after the final event, and final-response auto-speech
  waits for pending pet work. Existing audio is never interrupted.
- The roaming bubble is playback-owned. It appears on actual audio start,
  pulses only while a segment is playing, remains positioned during bounded
  inter-segment preparation, and clears after the complete pet sequence.
- Android truthfully uses its bundled acoustic `Hey Hermes` detector. Once wake
  or ordinary microphone capture begins, a transcript whose opening matches a
  connection-scoped command alias routes the remainder to private sidechat.
  `Pet` is the default; users can add comma-separated pet names and STT spelling
  variants. Aliases are normalized, deduplicated, regex-escaped, and matched
  longest-first only at the start of the transcript.
- Sidechat now streams auxiliary-model content deltas into the same adaptive
  speech engine as ordinary replies. Its playback consumer waits in the serial
  audio lane immediately and starts the first natural segment as soon as that
  segment is ready, while later segments synthesize with bounded concurrency.
- Normal and independent-pet xAI settings now expose native synthesis speed,
  latency optimization, language, sample rate, MP3 bit rate, expressive-tag
  rewriting, and spoken-text normalization. Client playback speed stays a
  separate post-synthesis control.
- The wake engine no longer pauses merely because a Hermes turn is active.
  Pet-command transcripts still route to sidechat first; other active-turn
  sends use a visible connection-scoped Interrupt/Steer preference passed to
  the gateway per request without mutating host configuration.
- Wake transcript cleanup now consumes the exact `Okay Hermes`/`OK Hermes`
  normalization observed from host STT in addition to `Hey Hermes` and bare
  `Hermes`. Activation-only text becomes an empty follow-up instead of a Hermes
  prompt, while `Okay Hermes, Pet, ...` becomes `Pet, ...` before sidechat
  routing.
- The sidechat prepared-audio stall is fixed. Early playback previously created
  the consumer promise before the final response arrived; `finish()` then
  returned that promise without closing the stream, even though every xAI TTS
  request had completed. Prepared input now finalizes idempotently regardless
  of whether playback has started, allowing the last segment and pet-work
  barrier to settle normally.
- Startup segmentation now holds an opening sentence shorter than 96 characters
  and joins it to sentence two. This avoids spending the first synthesis and
  playback handoff on a tiny utterance with too little runway for the next
  segment; substantial openings still start independently.
- The full-viewport pet canvas now layers at 130 and its bubble at 131, above
  the pet-sidechat popout at 120 but below the deliberate full-screen media
  viewer at 220. The pet therefore remains visible and draggable over sidechat.

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

### 5. Pet companion and streamed speech reliability

Pet movement is full-viewport and border-aware, with two-axis destinations,
faster minimum travel, and resize reconciliation. Direct drag remains
user-owned. Automatic commentary has turn-scoped cancellation so Stop and
terminal turn events clear pending generation and queued speech. Poke speech
has its own prepared-audio replacement path so slow TTS cannot create stale
tap queues or silence the current poke while the replacement still renders;
other speech keeps its existing serial ordering.
Mobile starts preparing final-response audio before the final event arrives,
without speaking partial words or replaying the completion payload. A shared
natural segmenter grows the runway after the first sentence and cuts pathological
run-on text at a nearby word boundary. Synthesis may overlap conservatively;
playback never does. Desktop uses its native streaming endpoint when available
and the same prepared-segment fallback for non-streaming providers.

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

- Desktop speech/Reader slice: 3 focused files and 20 tests passed; the broader
  UI run passed 54 files and 409 tests before the final queue-ID tightening.
  Desktop ESLint/Prettier checks, TypeScript typecheck, production build, and
  unpacked Windows packaging passed after that tightening.
- Mobile pet/voice slice: 75 focused tests passed; the full Mobile client suite
  now passes 54 files and 271 tests. Mobile TypeScript typecheck passes for the
  sidechat-streaming, xAI-control, and active-turn wake update. Production build,
  Capacitor sync, Android debug assembly, replacement installation, and cold
  launch smoke also pass for this exact revision.
- The follow-up prepared-input regression slice passes 3 files and 32 tests,
  including the early-consumer/final-close case; TypeScript typecheck also
  passes after the fix.
- The short-opening/overlay follow-up passes 3 focused files and 44 tests,
  including the two-sentence startup rule; TypeScript typecheck, production
  build, Capacitor sync, and Android debug assembly pass.
- Python prompt guidance compiled and an import smoke check confirmed both the
  Desktop and `hermes-mobile` Reader handoff hints.
- Scoped `git diff --check` and unmerged-entry checks pass in both repositories.
- Current replacement-installed Mobile debug APK:
  `client\android\app\build\outputs\apk\debug\app-debug.apk`
  (127,129,153 bytes, SHA-256
  `AA7410767A9224AE0CFDEA8C6DD06DA7835C86956970D693735CD410C5B4C174`).
- Current Desktop test executable:
  `..\hermes-agent\apps\desktop\release-pet-tts-20260731\win-unpacked\Hermes.exe`
  (214,281,216 bytes, SHA-256
  `0B49490E8C5CE12FB02802D018E942935343E84FCB3A0223DEE8D140F33BD2FD`).
- The same verified Desktop build now occupies the normal stable
  `apps\desktop\release\win-unpacked\Hermes.exe` target used by the Desktop,
  Start-menu, and taskbar shortcuts. Launching the Desktop shortcut produced a
  visible responding window, a fresh `HERMES_BACKEND_READY`, and `ok` dashboard
  and storage status.
- This latest APK is replacement-installed on the intended authorized Android test device at
  version name 1.0/version code 1 and package update time
  `2026-08-01 02:04:56`. A cold launch completed in 522 ms, left the app
  process running, and its captured process-log tail contained no error-priority
  record, fatal exception, or ANR signature.

## Next action

On the replacement-installed attachment-stability APK, verify that completed
inline attachments remain visually stable during transcript updates and brief
reconnects, and that the host pill exposes degraded/reconnecting state. Then verify that the acoustic
activation never appears in the submitted prompt, a short first pet sentence
joins sentence two, the audio state returns to idle after the last segment, and
the pet remains visible and draggable over the open sidechat. Then continue the
independent pet voice/speed, Interrupt/Steer, and xAI-control device acceptance.
