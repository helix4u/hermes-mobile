# Hermes Mobile Current Plan

Status: active

Last updated: 2026-08-01

Project root: current repository checkout

Hermes reference checkout: adjacent `hermes-agent` checkout

## Purpose

Hermes Mobile is an independent side project with two deliverables:

1. An installable Hermes server plugin that owns the versioned Mobile contract.
2. A React/TypeScript client distributed as an Android Capacitor app and a
   same-origin web app.

It is not an upstream Hermes feature branch. The plugin is the compatibility
boundary; Hermes remains authoritative for agent execution and durable session
history.

## Resume procedure

1. Read the applicable repository `AGENTS.md` files.
2. Read this file and `STATUS.md` completely. Both are intentionally bounded.
3. Run `git status --short --branch` and preserve unrelated work.
4. Continue from Current work and Next action below.

When either active document approaches 24,000 characters or contains more than
five dated/recent summaries, archive the oldest material and update the history
index in the same work session.

## Load-bearing boundaries

- Never persist long-lived credentials in browser local storage or logs.
- Scope client persistence by connection ID.
- Use Hermes's canonical HTTP and WebSocket authentication gates.
- Mutating operations fail closed when compatibility cannot be proved.
- Private Hermes imports stay in `server-plugin/mobile_server/compatibility.py`
  or a narrowly documented versioned adapter.
- The client uses the versioned Mobile contract and the generic core gateway;
  it does not import Hermes backend code.
- Host, Cloud, browser, Android, and Desktop state are separate authorities.
- Do not add plugin-specific branches to Hermes core. Widen a generic seam only
  when more than one real consumer needs it.

## Current architecture

- Direct/Tailnet targets prefer the authenticated Mobile plugin contract.
- Hermes Cloud can use the core JSON-RPC gateway when the plugin is absent.
- Android owns Nous portal sessions, per-agent cookie jars, native connection
  persistence, foreground connection service, wake word capture, file/share
  intents, and system save/open flows.
- React owns the connection-scoped transcript, Reader, file preview/editor,
  provider selection, pet presentation, and ordinary interaction state.
- The server plugin owns compatibility discovery, authenticated Mobile APIs,
  safe plugin installation/update, local provider adapters, and observer hooks.
- Windows desktop-bound hosting uses a plugin-owned recurring task trigger:
  Desktop presence starts the host, Desktop exit retires the server, proxy, and
  supervisor, and a later trigger revives them after Desktop reopens.

## Milestone map

- Milestones 0-5: scaffold, plugin skeleton, authenticated transport, event
  foundations, client slice, and Android host are implemented.
- Milestones 5B-5O: the broad mobile parity program is active. Chat, sessions,
  Reader, file preview/editor/download, Android sharing, provider setup, custom
  voices, pet/sidechat, Cloud onboarding, plugin upload/update, wake word, and
  lifecycle work have substantial implemented coverage.
- Milestone 3 remains partially open for a complete revisioned event journal,
  snapshot watermark, replay, and mutation receipts across process death.
- Milestones 6-8 remain the longer-term profiles/projects, same-origin PWA, and
  production-hardening program.

## Current work: Host plugin surfaces and pet-sidechat voice control

Acceptance contract:

- Support Ops is a connection-scoped host capability, not a hardcoded Mobile
  feature. Mobile probes the selected host's authenticated
  `/api/plugins/support-ops/health` route and exposes no Support navigation when
  that plugin is missing.
- A successful Support Ops probe adds a native Mobile tab without requiring the
  Hermes Mobile server plugin or any Hermes core change. The same authenticated
  request transport works for direct/Tailnet hosts and Cloud core-gateway
  fallback connections.
- The Mobile Support surface includes queue counts, search and filtering,
  per-thread sync and ticket actions, Markdown transcripts with copy controls,
  attachments, durable ticket/workspace/draft views, workflow actions, job
  state, private agent sidechat, and thread/default run settings. It preserves
  the backend invariant that no action posts automatically to Discord.
- Archived Support attachments use a Support Ops-owned authenticated media
  route constrained to the configured DiscordSync archive and a 16 MiB inline
  preview ceiling. They do not pass through the generic session-workspace file
  route or gain access to unrelated host paths.
- Support availability is re-probed after reconnect and periodically while the
  host is connected. A transient network or authentication failure does not
  falsely erase a previously discovered plugin; a confirmed missing route does.
- A transport interruption keeps the last successful Support queue or thread
  mounted as read-only cached content, marks it reconnecting, and resumes
  polling after recovery instead of replacing the page with an empty state.
- Support thread detail loading is single-flight and polls conservatively; a
  reconnect never creates overlapping expensive controller loads or clears a
  successfully rendered thread merely because transport callbacks changed.
- Every Support Ops prose composer has native voice dictation: operator notes,
  draft guidance, private sidechat, suggested-response editing, and rejection
  feedback. The selected field receives exactly one transcript before normal
  chat and pet command routing resumes; search, numeric, credential, and model
  configuration controls remain deliberate typed inputs.
- Support detail is a hard-contained mobile surface. Long Discord URLs,
  inline code, thread titles, message metadata, Markdown, and action rows wrap
  within the device viewport instead of widening the page or creating a
  horizontally clipped desktop canvas.
- On short landscape viewports, the app becomes a three-zone shell: a fixed
  identity/navigation rail on the left, the active scroll surface in the
  center, and Chat voice/composer controls in a bounded right lane. Sheets use
  the right lane as a drawer, and Support/Reader/file content remains width
  constrained rather than being scaled or squashed.
- Android system-bar and cutout insets are bridged from the native window into
  CSS on initial load and every configuration change. Landscape reserves the
  real status/navigation area around the complete shell, including three-button
  navigation on either side, instead of relying on WebView safe-area values
  that can incorrectly remain zero.
- Connection surfaces use theme tokens. In particular, Nous Blue uses its blue
  surface instead of a hardcoded near-black connection-sheet background.

- Mobile bundles the seven real local pet definitions: Alien Child, Dr. House,
  Fight Club Narrator, Gremlin, Noir Build Detective, Ponytail Principal, and
  Shipbreaker QA.
- Alien Child's existing Mobile asset remains the authoritative unchanged
  default.
- Hermes's 13 ordinary personality presets are adapted into complete pet
  personalities with state lines, tap behavior, ambient commentary, and
  full-conversation sidechat prompts.
- The grouped picker works while disconnected and against vanilla Cloud hosts;
  future host-only definitions merge without replacing bundled presets.
- A structured editor changes name, description, tap lines, commentary prompt,
  and sidechat prompt as a connection-scoped phone-local override. Reset
  restores the immutable bundled or host definition.
- Desktop-bound Windows hosting retires all Mobile-owned processes after
  Desktop exits and a recurring native trigger revives them after Desktop
  reopens without leaving an orphan supervisor.
- Existing pet movement, speech, sidechat, capability degradation, Reader,
  provider, session, and file behavior must not regress.
- Completed inline file attachments remain mounted through unrelated transcript
  updates and keep their last successful preview through transport replacement
  or temporary disconnect. Preview bytes and in-flight requests are cached only
  in memory, scoped by connection ID and path, and bounded by entry count and
  byte budget; explicit Retry still refreshes the host copy.
- Chat media markers and bare media links render in place with native Android
  audio/video controls. The shared format catalog covers MP4/WebM/MOV/MKV/AVI,
  phone 3GP/3G2, MPEG transport/video variants, and common MP3/AAC/M4A/M4B,
  WAV/FLAC/Ogg/Opus/AIFF/AMR/Caf audio while retaining Download as the codec or
  host-size fallback.
- Reader's sticky transport remains available without occupying a tall card.
  Play/Resume, Pause, Stop, and a visible pressed-state Follow toggle share one
  compact row; manual touch/wheel scrolling disables Follow and re-enabling it
  recenters the currently spoken block.
- The top host control reports `Degraded`, `Connecting`, `Reconnecting`, and
  `Connection failed` directly instead of collapsing every non-connected state
  to `Connect`. Degraded core-gateway compatibility uses a warning-colored dot
  while preserving the selected host name.
- Rapid pet pokes use a replaceable speech lane: stale pending pokes collapse,
  a newer poke renders without silencing the current poke and hands off only
  after replacement audio exists, and ordinary reply, Reader, commentary, and
  sidechat speech remains serial and cannot be interrupted by a poke.
- The transparent pet overlay spans the usable visual viewport rather than a
  middle-page box. Automatic movement is genuinely two-dimensional, turns
  inward before edges, maintains at least 40 px/s, and re-clamps after
  rotation, split-screen, or keyboard-driven viewport changes.
- The pet canvas and speech bubble remain above the pet-sidechat popout so the
  companion stays visible, draggable, and visually attached to its private
  conversation; deliberate full-screen media surfaces remain above both.
- Every adapted Hermes personality has multiple state reactions and at least
  four distinct poke lines instead of a single canned response.
- The pet overlay is portaled to the document body and uses the Android visual
  viewport as its coordinate authority, so neither the chat workspace row nor
  an inner scrolling surface can restrict drag or roaming.
- Auto-speak begins synthesizing complete natural segments while the assistant
  reply is still streaming. It grows from one sentence to three, then five,
  honors paragraph and bounded word transitions, and always plays prepared
  audio in transcript order.
- Streamed speech input is turn-idempotent. Replayed terminal completion frames
  cannot enqueue a second response, cumulative snapshots contribute only their
  new suffix, and substantial reconnect overlap is removed without suppressing
  intentional short repetitions in model speech.
- The first segment is useful runway rather than a token opener: an opening
  sentence shorter than 96 characters waits for and joins sentence two, while
  a substantial first sentence can still begin playback immediately.
- Provider requests use a conservative bounded concurrency lane. Reader
  exposes a connection-scoped one-to-three parallel-render setting; ordinary
  Mobile auto-speak combines that cap with connection-scoped provider timing,
  voice speed, synthesis latency, and playback duration estimates.
- Every pet speech surface, including transcript Listen and full sidechat
  replies, uses the effective independent pet provider/voice and the same
  adaptive startup segmentation, bounded synthesis overlap, timing history,
  and client playback-rate enforcement as ordinary Mobile response speech.
- Pet sidechat emits auxiliary-model text deltas through the generic gateway,
  starts its serial playback consumer immediately, and plays the first complete
  natural segment as soon as synthesis finishes instead of waiting for the full
  sidechat response. Later segments keep preparing concurrently and remain in
  transcript order.
- Starting the sidechat playback consumer early never steals finalization from
  the producer. The final response closes the prepared-speech input exactly
  once even when the playback promise already exists, so the consumer settles
  after the last segment instead of remaining in `preparing reply audio`.
- Normal and custom-pet xAI selectors expose native synthesis speed, latency
  optimization, language, sample rate, MP3 bit rate, automatic expressive tags,
  and spoken-text normalization. Native xAI speed remains distinct from the
  phone's final playback-rate control.
- Pet generation and playback form one priority barrier: no new automatic
  observation is generated while pet work is pending, accepted end-of-turn
  commentary finishes instead of being discarded, and pending pet audio plays
  before final-response auto-speech without interrupting active audio.
- The roaming bubble appears when pet audio actually begins, animates only
  while a segment is playing, and clears with the completed sequence.
- The acoustic wake detector remains the real bundled `Hey Hermes` model.
  After wake or ordinary microphone capture, a recognized follow-up beginning
  with any connection-scoped command alias (default `Pet`) routes the remainder
  to private sidechat. Comma-separated aliases cover pet names and likely STT
  spellings; an escaped, longest-first start matcher prevents partial or later
  mentions from stealing ordinary Hermes prompts.
- Wake activation words are never submitted as request text. The post-wake
  cleanup consumes `Hey Hermes`, bare `Hermes`, and the common host-STT
  normalizations `Okay Hermes` and `OK Hermes`, while preserving a trailing
  command such as `Pet, ...` for the sidechat router.
- Wake capture and ordinary voice input remain available while a Hermes turn is
  active. Pet-prefixed transcripts continue to route directly to sidechat;
  ordinary active-turn messages use a connection-scoped `Interrupt` or `Steer`
  preference sent per request, without changing the selected host's config.

## Near-term backlog

1. Complete physical-device acceptance for full-viewport pet drag/roaming,
   prepared-audio poke handoff, incremental final-response speech, inline
   audio/video playback, and Reader Follow/parallel rendering without provider
   throttling, audible segment gaps, or transport-bar crowding.
2. Continue ordinary-device acceptance for foreground lifecycle, long TTS,
   wake-word capture, and provider-specific behavior.
3. Finish the revisioned event journal and durable replay contract.
4. Continue server capability negotiation so vanilla Cloud hosts degrade
   cleanly without showing unsupported-endpoint errors.
5. Evaluate plugin offloading only when the generic seam preserves identical
   Desktop, Mobile, local, remote, and Cloud behavior.
6. After Mobile landscape acceptance, discuss a separate Desktop resource
   monitor plugin: a compact theme-aware information deck with configurable
   metrics and sizing, without adding monitor-specific behavior to core.

## Plugin refactor decision rule

Good plugin ownership:

- Mobile contract routes and compatibility probes.
- Local provider implementations and model runtimes.
- Safe connected-host plugin deployment/update.
- Mobile-only observer state and transport adapters.

Keep in generic Hermes/local experiments when shared authority is required:

- Generic TTS catalog and per-request synthesis override semantics.
- Cache-stable session platform guidance.
- Shared session/file/media contracts consumed by Desktop and Mobile.

Do not replace a cache-stable platform hint with a repeated pre-LLM hook, and do
not register a fake gateway adapter only to obtain a prompt hint. A future
generic hint-only plugin registration seam could move the Mobile platform text
without compromising behavior; that seam does not exist today.

## Validation policy

- Use focused Mobile Vitest/unit checks, TypeScript typecheck, Vite build, and
  Android debug assembly as appropriate.
- Do not run the Hermes Python test suite from this project.
- Separate automated verification, packaged-artifact verification, and physical
  device acceptance in reports.
- Never install to or inspect a physical phone unless the user explicitly asks.

## Next action

On the replacement-installed responsive Support build, rotate the physical
device while Chat, Support, Reader, and a connection sheet are open. Confirm
the left rail remains fixed, the active center surface scrolls normally, Chat's
voice/composer lane remains usable, and no content creates horizontal overflow.
Connect to the workstation host and verify that archived screenshots render
inline, cached content remains visible across a brief reconnect, and Support
appears only there (and not on a vanilla Cloud host). Exercise queue filtering,
open a thread, render its Discord/ticket Markdown, and start only a safe
operator-owned sync or agent job while confirming no external Discord post is
possible. Dictate into each Support prose field and confirm the transcript
appends only to the selected field, including a microphone-permission failure
followed by ordinary Chat voice input. Then verify that long auto-spoken replies
never replay a completed segment or terminal response. Then verify that MP4 and representative local
audio attachments play inline in Chat, and that Reader's compact transport
keeps Play/Pause/Stop/Follow reachable while manual scrolling disables Follow
until explicitly re-enabled. Also verify that a completed
inline image or document does not flash back to Loading or refetch repeatedly
during later transcript updates, and that it remains visible through a brief
connection interruption. Verify the host pill shows Degraded for a connected
core-gateway fallback and Reconnecting during automatic recovery. Then verify both
`Hey Hermes, <request>` and the observed STT normalization
`Okay Hermes, <request>` submit only the request, and that a trailing
`Pet, ...` reaches private sidechat. Confirm that the pet begins playing its
first prepared sidechat segment, joins a tiny opening sentence to sentence two,
and returns to idle after the last segment rather than remaining on
`preparing reply audio`. Confirm the pet and bubble render above the open
sidechat. Then continue the independent pet voice/speed, Interrupt/Steer, and
xAI-control device acceptance already described above.
