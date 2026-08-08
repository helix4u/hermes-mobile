# Hermes Mobile Current Status

Last updated: 2026-08-08

Current milestone: Live sessions, platform roaming, Petdex, and Support parity

## Current result

- Android recovery now uses a dedicated ignored key under
  `%LOCALAPPDATA%\hermes-mobile-signing` and a serial-guarded, hashed,
  restore-rehearsed migration that excludes dead credential ciphertext. It
  completed on authorized Samsung SM-S918U test device: APK SHA-256
  `7AFF8D871807068EE5C8FA4770C7F500D409684E2EFB3D5864A33839112EDEBA`,
  certificate `707D72C0D6F58BB05FEEAB282AA670584E726F7D845CFD99B5AD1EB9BD03AAFE`,
  update `2026-08-08 00:39:20`. Local state is restored, MainActivity is live,
  no fatal/ANR was found, and bearer tokens intentionally require re-entry.

- Mobile now distinguishes durable history from live gateway sessions. The
  Sessions page polls only the cheap live-session authority while open, shows
  working/starting/waiting/idle activity, human recency labels, and attaches an
  in-progress runtime with `session.activate` instead of cold-resuming it.
- Pet roaming now derives a bounded normal walk speed from the active sprite's
  cadence with a 64 px/s floor, shorter natural rests, element-top perches,
  visual-viewport reconciliation, and resize/orientation correction. Ordinary
  vertical travel keeps the walk animation. Only a ledge within 110 px
  horizontally and 96 px vertically can trigger a jump, capped at 720 ms, so
  distant perch changes cannot become long loops of airborne frames.
- Pet settings now contain a local-first Petdex gallery with thumbnails,
  search, adopt/select, enable/disable, rename, export, remove, provider-aware
  draft generation, reference images, streamed progress, egg incubation,
  hatch preview, adopt, and discard. Arbitrary selected host sprites now render
  in Mobile rather than being replaced by Alien Child.
- Support Ops now has the same queue/overview split and core historical metrics
  as Desktop: totals, 14-day flow, topic buckets, artifact health, issue
  clusters, and independent-snapshot warnings. A thread can download a Markdown
  handoff or start a normal Hermes investigation session without granting any
  Discord posting authority.
- Mobile pet commentary has no warmup-turn threshold. Settled tool/progress
  evidence schedules observation after 900 ms and the configured delay remains
  a fallback. The observed silence was a shared Hermes auxiliary-client
  regression: the public callback argument was not forwarded into the internal
  implementation, causing every auxiliary request to raise `NameError` before
  returning text. The callback is now threaded through that boundary.

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
- The shared speech lane now supports a cooperative priority handoff. A long
  streamed reply checks for waiting pet speech before each natural audio
  segment, lets priority-20 commentary play after the current segment, then
  resumes the response without admitting ordinary lower-priority tasks or
  interrupting active audio.
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

- The auxiliary callback regression has a focused public-boundary regression
  test and passes through the canonical one-file test runner (1 selected test,
  4-worker cap). A bounded live probe against the configured
  `xai-oauth / grok-4.5` pet assignment returned `ready`, the actual
  `pet.commentary.generate` dispatcher returned commentary text, and the pet's
  configured OpenAI TTS path produced a 40,320-byte MP3. The managed Mobile host
  was restarted and reports healthy compatible loopback listeners on 9129/9130
  with desktop-bound lifecycle and Tailscale Serve intact. Physical audible
  playback on Android remains the user acceptance step.

- The cooperative pet-speech handoff passes the focused 23-test voice suite and
  the complete 57-file/296-test client suite. TypeScript typecheck, Vite
  production build, Capacitor sync, stable signing, and Android debug assembly
  pass. APK SHA-256 is
  `D0BC8F57E6C195980E6CE23A450801C8A9EF9B69AF4A92CC605B9382E3D585BF`
  (127,192,674 bytes). It was replacement-installed with preserved data on
  authorized Samsung SM-S918U test device; Android reports update time `2026-08-08
  14:17:46`.

- The nearby-jump follow-up passes 19 focused MobilePet tests, TypeScript
  typecheck, Vite production build, Capacitor sync, and Android debug assembly.
  The stable-signed APK is
  `client\android\app\build\outputs\apk\debug\app-debug.apk` (126,927,247
  bytes, SHA-256
  `EC0D3C4F4B8C29471ED143C227A38B8B1DC6041F2EE2098A7C59B833F6FE7890`).
  It was replacement-installed on the authorized Samsung SM-S918U test device at `2026-08-08
  00:47:57`; its 760 ms cold launch left the process running with no fatal or
  ANR signature. The earlier complete client suite remains 57 files and 293
  tests and was not rerun for this two-file follow-up.

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

Exercise one long auto-spoken tool turn on the installed handoff build against
the restarted host. Verify the first settled tool evidence produces audible pet
commentary without waiting for another turn, the pet takes the lane only between
response segments, and playback returns to the response with no overlap, replay,
or dropped text.

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
