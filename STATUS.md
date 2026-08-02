# Hermes Mobile Current Status

Last updated: 2026-08-02

Current milestone: Host plugin surfaces and pet-sidechat voice control

## Current result

- Support Ops is now exposed as a selected-host capability. Mobile performs an
  authenticated health probe through its existing connection transport and
  adds a sixth Support tab only when that host has the plugin route installed.
  Missing routes remain invisible; transient host failures preserve the last
  confirmed capability instead of flickering navigation.
- The new mobile-native Support Ops view covers queue counts and filters,
  search, per-row sync and ticket creation/update, full thread detail, rendered
  Discord/ticket/workspace/draft Markdown with copy actions, archived
  attachments through a bounded plugin-owned media route, workflow and
  cancellation controls, thread agent sidechat, job history, and grouped
  thread/default run settings. The UI states explicitly that it cannot post
  automatically to Discord.
- Support run settings now mirror the host authority model. Operators can pick
  analysis-only, support-investigation, coding-workspace, full-access/YOLO, or
  custom authority; toggle individual Hermes toolsets; select the Codex
  sandbox; and explicitly opt into Codex's dangerous approval/sandbox bypass.
  Thread actions also expose investigate-plus-ticket regeneration for existing
  durable tickets.
- No Hermes core or Mobile server-plugin change was required. Direct/Tailnet
  and Cloud connections use the same authenticated generic HTTP seam already
  owned by Mobile. Support Ops gained one narrow archive-media route that
  validates the configured DiscordSync root and enforces a 16 MiB preview cap.
- Reconnect interruptions no longer blank a loaded Support page or surface
  Android's expected `InterruptedIOException` as a fatal operator error. Cached
  queue/thread content remains visible with a reconnect banner, while host
  mutations stay disabled until transport health returns.
- Support thread refresh is now single-flight and uses a 12-second detail poll.
  Reconnect callback churn no longer tears down cached detail or overlaps
  controller loads. Support controller initialization and settings/detail/job
  entry points are dispatched off the backend event loop; after the live plugin
  refresh, three authenticated detail loads completed in 1.23-1.59 seconds with
  no new event-loop-stall record.
- Targeted Support sync now has an honest host capability boundary. Mobile
  loads Support health with the queue, disables both Sync entry points unless
  `targeted_sync` is explicitly true, and explains that ticket and agent
  actions still work. The workstation plugin installer migrated the existing
  DiscordSync batch location to the credential-safe targeted wrapper plus the
  local artifact build, preserving all unrelated config. The restarted live
  host reports targeted sync available and external posting disabled.
- Native voice dictation is available in every Support Ops prose composer:
  operator notes, run guidance, thread sidechat, response editing, and rejection
  feedback. Dictation appends to current text through a one-shot target that is
  resolved before pet-command or ordinary Chat routing and cleared on capture
  completion or failure.
- Support detail now has explicit inline-size containment from the page root
  through messages and Markdown. Thread titles, metadata, action rows, long
  links, and inline code wrap within the phone viewport; transcript links are
  rendered as links rather than inheriting the oversized Support action-pill
  treatment.
- Short landscape viewports now use a purpose-built three-zone shell: a fixed
  left identity/navigation rail, the active scroll surface in the center, and
  a bounded Chat voice/composer lane on the right. Connection and other sheets
  become right drawers, while Support, Reader, and file views retain strict
  viewport containment.
- The Android activity now reports actual system-bar and display-cutout insets
  to CSS on page load, rotation, and other configuration changes. The landscape
  shell, right drawers, and fixed overlays reserve those insets globally, so
  Samsung three-button navigation and the status bar no longer cover the right
  input lane or header when WebView reports zero browser safe-area values.
- The connection sheet now uses the active theme surface token. Nous Blue gets
  its blue connection background instead of the previous hardcoded black.
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
- Chat now treats MP4 and a broader Android-relevant audio/video extension set
  as first-class inline media. Authenticated generated files and direct bare
  links render through native `audio`/`video` controls in the transcript, with
  Download retained when the host size ceiling or device codec support prevents
  inline playback.
- Reader's sticky playback dock is shorter and uses one compact horizontal row.
  It now keeps Play/Resume, Pause, Stop, and an explicit Follow toggle together;
  manual scrolling disengages Follow and the pressed toggle restores active-
  block tracking.
- Desktop pet commentary now captures both the live display message and newest
  durable row when observation begins. The gateway validates and persists that
  anchor, and delayed commentary inserts at that transcript position instead of
  stacking after the final reply. Existing compact inline rendering, Copy, and
  Dismiss behavior is unchanged.
- The current verified debug APK was replacement-installed on the intended
  Samsung SM-S918U over the explicitly supplied ADB endpoint. The `-r` install
  retained saved application data and Android Keystore credentials. Android
  reports package update time `2026-08-01 14:00:40`; a cold launch completed in
  1.003 seconds and left the expected application process running with no error-priority
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
- Auto-speak now reconciles its input before segmentation. A repeated
  `message.complete` frame is idempotent until the next turn, cumulative stream
  snapshots append only their unseen suffix, and substantial replay overlap is
  removed at the boundary. Short repeated tokens remain untouched so deliberate
  phrasing such as "no, no" is still spoken faithfully.
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
- The prior Mobile pet/voice slice passed 75 focused tests and its full client
  suite passed 54 files and 271 tests. That revision also passed TypeScript,
  production build, Capacitor sync, Android assembly, replacement installation,
  and cold-launch smoke before the media/Reader follow-up below.
- The follow-up prepared-input regression slice passes 3 files and 32 tests,
  including the early-consumer/final-close case; TypeScript typecheck also
  passes after the fix.
- The short-opening/overlay follow-up passes 3 focused files and 44 tests,
  including the two-sentence startup rule; TypeScript typecheck, production
  build, Capacitor sync, and Android debug assembly pass.
- The media/Reader follow-up passes 3 focused files and 8 tests; the complete
  Mobile client suite passed 54 files and 272 tests. The subsequent speech-
  deduplication slice passes 2 files and 33 tests, and the complete client suite
  now passes 54 files and 275 tests. TypeScript typecheck, production build,
  Capacitor sync, and Android debug assembly pass.
- Desktop commentary ordering passes 3 focused files and 17 tests. Desktop
  TypeScript typecheck, changed-file ESLint with zero errors, Python module
  compilation, production build, and unpacked Windows packaging pass. The
  backend-focused Python regression was added but not executed under the local
  no-Python-tests safety rule.
- Python prompt guidance compiled and an import smoke check confirmed both the
  Desktop and `hermes-mobile` Reader handoff hints.
- Scoped `git diff --check` and unmerged-entry checks pass in both repositories.
- Earlier verified pet/voice Mobile debug APK:
  `client\android\app\build\outputs\apk\debug\app-debug.apk`
  (127,129,674 bytes, SHA-256
  `FE23BB8D991B12C4146978EAB7A36488B04E678841D9A70FFF68ADBA319EA051`).
- Current Desktop test executable:
  `..\hermes-agent\apps\desktop\release\win-unpacked\Hermes.exe`
  (214,281,216 bytes, SHA-256
  `5C82EB0954B6BA9ED5D342393A2AE4E1AB3AA26B3779C46D7AF722DCA1A7E016`).
- The same verified Desktop build now occupies the normal stable
  `apps\desktop\release\win-unpacked\Hermes.exe` target used by the Desktop,
  Start-menu, and taskbar shortcuts. Launching the Desktop shortcut produced a
  visible responding window, a fresh `HERMES_BACKEND_READY`, and `ok` dashboard
  and storage status.
- The current speech-deduplication APK is replacement-installed on the intended Samsung SM-S918U at
  version name 1.0/version code 1 and package update time
  `2026-08-01 14:00:40`. A cold launch completed in 1.003 seconds, left the app
  process running in the foreground, and its captured process-log tail
  contained no error-priority record, fatal exception, or ANR signature.
- The Support Ops Mobile slice passes 6 focused tests, the complete client suite
  passes 56 files and 282 tests, TypeScript typecheck and the Vite production
  build pass, and Android debug assembly completes successfully. The live
  authenticated host reports a healthy 35-thread queue; a known archived
  thread exposes all three attachments and returns an `image/png` data URL from
  the new bounded route. The Support Ops module compiles; its focused Python
  regression was added but not executed under the local no-Python-tests rule.
- The targeted-sync follow-up passes 2 focused files and 8 tests; the complete
  client suite passes 56 files and 283 tests. TypeScript typecheck, Vite
  production build, Capacitor sync, and Android debug assembly pass. The current
  APK is `client\android\app\build\outputs\apk\debug\app-debug.apk`
  (127,138,443 bytes, SHA-256
  `3B7BA6C66795648295BA0CA76A9ABA7DE3B9A059AE2CB0902FA958778E9E193A`).
- Current Support Ops stability and dictation APK, replacement-installed on the
  intended Samsung SM-S918U through the refreshed Wireless ADB endpoint:
  `client\android\app\build\outputs\apk\debug\app-debug.apk`
  (127,138,237 bytes, SHA-256
  `E4A9B372670A9BF056604C357C3235688B43910A77082F24676ECB0D2F5F0D30`).
  Android reports package update time `2026-08-01 22:39:01`. The `-r` install
  preserved app and Keystore data; a cold launch completed in 925 ms, left the
  app process running, and produced no fatal exception or ANR. The process tail
  contains only platform ashmem/Samsung library warnings and Chromium paint-
  metric diagnostics, not an application crash.
- Current responsive Support/landscape APK, replacement-installed on the same
  Samsung SM-S918U:
  `client\android\app\build\outputs\apk\debug\app-debug.apk`
  (127,138,235 bytes, SHA-256
  `0F8D2F4E2038B31A79D79808EF94A88023D13411BDB1AF7430AD06540D03CE28`).
  Android reports package update time `2026-08-01 23:23:56`. TypeScript
  typecheck, the complete 56-file/282-test client suite, Vite production build,
  Capacitor sync, and Android debug assembly pass. Chromium portrait and
  landscape viewport captures verify the shell transition and right drawer;
  a real-phone Support capture verifies the formerly overflowing thread fits
  the portrait viewport. Native compilation also verifies the Android inset
  bridge. The installed process remains live with no fatal exception or ANR
  signature in its error-priority log.
- Current Support authority-controls APK:
  `client\android\app\build\outputs\apk\debug\app-debug.apk`
  (127,139,438 bytes, SHA-256
  `564D9FBA075AE62A323BD333C8AE7086248F21B93B9F4770AB5C94C6E2E9EB31`).
  The focused Support test, complete 56-file/283-test client suite, TypeScript
  typecheck, production build, Capacitor sync, and Android debug assembly pass.
  It was replacement-installed on the intended Samsung SM-S918U through the
  refreshed Wireless ADB endpoint. Android reports package update time
  `2026-08-02 01:29:00`; the preserved-data cold launch completed in 771 ms,
  left the expected process running, and its error-priority process log had no
  fatal-exception or ANR signature.

## Next action

On the replacement-installed responsive Support Ops APK, physically rotate
Chat, Support, Reader, and a connection sheet and verify the fixed left rail,
center scrolling, bounded right composer lane, and absence of horizontal
overflow. Then verify capability-driven tab
visibility against both the workstation and a vanilla Cloud host. Confirm
archived screenshots render inline and the loaded view remains mounted through
a brief reconnect. Dictate into each Support prose field and confirm no
transcript leaks to another field, Chat, or pet sidechat. Then
exercise queue/thread Markdown, sync/ticket actions, run settings, and private
agent sidechat without authorizing an external post. Confirm the workstation
Sync action is enabled, while a host advertising `targeted_sync: false` keeps
Sync disabled without blocking ticket or agent actions. Verify Support
investigation gives Hermes the selected toolsets in the configured repository,
Codex honors read-only/workspace-write/YOLO selection, and Investigate + redo
ticket updates the linked ticket without creating a duplicate. On
the replacement-installed speech-deduplication APK, also verify a long auto-spoken response
does not repeat any prepared segment or replay after completion. Then verify representative MP4 and audio playback in
Chat plus the compact Follow transport during manual and automatic Reader
scrolling. Then verify that completed
inline attachments remain visually stable during transcript updates and brief
reconnects, and that the host pill exposes degraded/reconnecting state. Then verify that the acoustic
activation never appears in the submitted prompt, a short first pet sentence
joins sentence two, the audio state returns to idle after the last segment, and
the pet remains visible and draggable over the open sidechat. Then continue the
independent pet voice/speed, Interrupt/Steer, and xAI-control device acceptance.
