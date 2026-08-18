# Hermes Mobile Current Status

Last updated: 2026-08-17

Current milestone: Live sessions, platform roaming, Petdex, and Support parity

## Current result

- Support Ops polling no longer deadlocks behind a lock abandoned by its own
  still-running backend instance. The backend reclaims that self-owned lock,
  and repeated live polls complete without leaving a lock behind.
- Android external OAuth pages now launch the registered browser directly and
  report no-browser only when Android actually throws `ActivityNotFoundException`.
  This avoids the false negative caused by package-visibility-filtered intent
  resolution. The persistent connection and result notifications now use a
  monochrome Nous girl small icon instead of the temporary `H` glyph.
- Chat no longer locks manual input behind an awaited turn. Send stays enabled
  during an active turn and routes the new text through the selected Interrupt
  or Steer mode. Manual microphone capture also stays available during reply,
  Reader, and pet audio; starting it stops or pauses playback before recording.
- The last selected durable session is now stored per connection. Startup and
  reconnect prefer `session.activate` for its matching live runtime, then fall
  back to `session.resume`, so Mobile returns directly to the conversation
  instead of only reconnecting the host shell.
- Android now requests notification permission and posts a native result
  notification when the current live session completes in the background. The
  notification carries connection, runtime-session, and durable-session IDs;
  tapping it switches or reconnects as needed and opens that exact session.
- Generic pet sidechat no longer appends the backend's full returned history to
  the already-rendered history. The authoritative list replaces optimistic
  state, and reply fallback selects the newest assistant message rather than the
  first one in the conversation.

- Same-device Termux connections now accept HTTP/WS only for `localhost`,
  `127.0.0.1`, and IPv6 loopback. Android keeps cleartext denied globally;
  native URL policy and WebSocket ticket conversion independently reject
  remote HTTP while the connection sheet explains the local exception.

- Android recovery uses a dedicated ignored signing key plus a serial-guarded,
  hashed, restore-rehearsed migration that excludes dead credential ciphertext.
  It now also adopts a blank differently signed reinstall from an earlier
  verified same-device backup with explicit consent. On the physical Android
  test device, the loopback APK
  `966DAFCEA50921BB33E94F064870FBF11B688B73C1D31682AED605992D4D94A4`
  restored the `20260808-003847` ordinary-state archive at `18:40:08`.
  MainActivity is live with no fatal/ANR signature; tokens require re-entry.

- Mobile now distinguishes durable history from live gateway sessions. The
  Sessions page polls only the cheap live-session authority while open, shows
  working/starting/waiting/idle activity, human recency labels, and attaches an
  in-progress runtime with `session.activate` instead of cold-resuming it.
- Pet roaming derives bounded cadence from the active sprite with a 64 px/s
  floor, natural rests, UI perches, viewport correction, and only brief nearby
  jumps. During turn activity, a resting pet now resolves backend `run` state
  to a stationary review pose, so it no longer walks in place while stopped.
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
- Mobile now consumes Support Ops' plugin-owned backend lifecycle instead of
  assuming an external website or poller. Host health carries contained-worker
  state, and the Support header exposes Start, Stop, and Poll now. Missing
  dedicated Discord credentials leave copied queue/history/ticket data readable
  while source Sync and worker start remain unavailable.
- The Support backend state label now has explicit compact control typography
  and overflow containment. Android WebView no longer text-autosizes `Backend
  running`, `Backend stopped`, or `Backend needs token` beyond the adjacent
  lifecycle buttons.
- The Windows Mobile host now runs entirely from the AppData Mobile checkout.
  The empty plugin directory left by copying the former junction was replaced
  with an AppData-owned junction, and the desktop-bound scheduled task was
  recreated against AppData. Authenticated health is `ok`, compatibility is
  `compatible`, both loopback listeners are live, and Tailscale Serve remains
  configured. The freshly installed phone shows a green Workstation connection,
  the native Support tab, live queue data, and the running backend controls.
- Mobile now consumes the current Support Ops operator and portability routes.
  A collapsed setup panel edits display name, support/developer aliases,
  categories, participant voice presets, catalog-backed playback voice/speed,
  and the host backup directory; it also exports/imports credential-free JSON
  and starts an explicit host backup.
- Overview's generation control now POSTs to `/stats/regenerate` instead of
  merely refetching stale output. Queue controls POST an explicit, bounded set
  of filtered thread IDs to `/sync` and can confirm `/tickets/unticketed`.
- Queue and detail render backend-derived support/developer owners and real
  participants while omitting Argus. The configured operator name is used in
  person-specific waiting labels without renaming generic workflow roles.
- Individual Discord, ticket, workspace, draft, and sidechat content has a
  Support-voice Listen path. Whole-thread playback assigns voices per real
  participant and uses the shared buffered speech queue. A case can open in a
  normal Hermes investigation session or start the same handoff with microphone
  capture.
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
  open. The task now enters through Windows Script Host and starts PowerShell
  hidden from process creation, so idle recovery checks do not flash a terminal.
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

- The Support setup/parity slice passes 13 focused Support tests across two
  files. TypeScript typecheck, the Vite production build, Capacitor sync, and
  Android debug assembly pass from the authoritative AppData checkout.
- Current debug APK:
  `client/android/app/build/outputs/apk/debug/app-debug.apk` (127,206,378
  bytes, SHA-256
  `5A18BFB19C0B5CB14908DE1FC7B84067DB3CBDAB65D99BEA7B5244AA732D034B`).
- The current APK was replacement-installed with `-r` on the intended Samsung
  SM-S918U at the explicitly supplied ADB endpoint. The installed base APK hash
  exactly matches the AppData artifact, the application process launches, and
  its captured error tail contains no fatal exception or ANR. No uninstall or
  application-data reset occurred.
- Four focused client files pass 50 tests covering active-turn composer gating,
  speech-time microphone access, session continuity, and pet sidechat. TypeScript,
  Vite production build, Capacitor sync, Android unit tests, and debug assembly
  pass. Android grants result-notification permission on the installed package.
- The production build emits the existing large-chunk advisory for the 770 kB
  main bundle; it is non-fatal and no new Support-specific build failure is
  present.
- Physical-device feature acceptance remains separate from the successful
  build, sync, artifact verification, and replacement installation above.

## Next action

Verify active-turn microphone and Interrupt/Steer sends during playback,
restart/reconnect restoration, exact-session notification taps, and repeated
generic pet-sidechat turns on the physical phone. Then continue the outstanding
Support lifecycle, setup, reconnect, and session-handoff acceptance. No Support
action may gain automatic Discord posting authority.
