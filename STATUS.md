# Hermes Mobile Status

Last updated: 2026-07-29

Current milestone: Milestone 5G Mobile Reader, preview, and media workspace
implementation complete, physical-device acceptance pending

Current state:

- The Reader 22-of-24 failure was traced to the tailnet host proxy's global
  30-second `httpx` timeout. Later xAI chunks completed on the Hermes backend
  after that deadline, so the proxy emitted an opaque 500 and the client
  retried audio that was still finishing.
- `/api/audio/*` proxy requests now have a bounded 14-minute upstream window
  while ordinary routes retain their 30-second timeout. A real upstream
  timeout returns 504 with an explicit host-timeout detail instead of becoming
  an unhandled 500.
- Mobile speech synthesis now supplies an explicit 8-minute request timeout,
  overriding Android's former four-minute audio default so a slow but healthy
  provider response is not abandoned and duplicated.
- Completed assistant replies now resolve Hermes `MEDIA:` markers through the
  authenticated remote-safe filesystem route. Generated images render inline
  with the full-screen viewer, audio and video use native controls, and
  unsupported or oversized files retain Retry and Download actions.
- Raw host media paths no longer remain in the visible completed reply, copied
  response text, or TTS projection. Loading and failure cards expose only the
  generated filename, and media fetch failures cannot echo a private host path.
- Every Control settings disclosure now defaults to collapsed. Entering
  Control remounts the settings surface, so sections opened during a previous
  visit do not remain unexpectedly open.
- Files now scrolls a newly opened document preview into view inside its
  existing phone-owned viewport. The document heading gives the filename its
  own readable row and wraps Download, Open in Previewer, Open in Reader, and
  Close into full touch targets.
- Reader now has explicit Multi-voice Reader and File Preview surfaces. The
  shared preview supports Markdown/plain-text rendering, editing, save/revert,
  download, and handoff back into Reader.
- Remote images open in a native-feeling full-screen fit/actual-size viewer.
  Remote audio and video files use native media controls, and Markdown can
  render direct audio/video links without treating them as broken images.
- Supported YouTube, Vimeo, and Spotify links use a connection-scoped
  Desktop-style privacy gate with ask, always, and off modes. The setting is
  client-local and never writes host config or theme state.
- Multivoice Reader can render the entire parsed script through the existing
  provider/fallback chain into one 24 kHz mono WAV. Browser builds download the
  Blob directly; Android saves it through `ACTION_CREATE_DOCUMENT`.
- Reader's provider choices and buffering remain collapsed until requested.
  The main Read/Stop action now spans the control card, and preview/media
  actions remain inside a 360-pixel viewport.
- Mobile Files now exposes Download on every file row and in the open document
  pane. Browser downloads use the authenticated remote filesystem data route;
  Android downloads use the same route through the native credential/cookie
  boundary and let the user choose the destination with the system document
  picker.
- Hermes Mobile now appears in Android's share sheet for text, links, and
  individual images. Shared content opens a confirmation sheet instead of
  sending automatically.
- The share sheet can switch among saved direct, Tailnet, and Cloud targets,
  then route to an existing session or create a new one. New conversations have
  their own remote directory picker and explicit cwd without modifying the
  connection's normal preferred workspace.
- Android copies a shared image out of its temporary content URI immediately,
  caps it at 16 MiB, and keeps it only in application cache. JavaScript sees
  metadata until confirmation; cancel, successful send, replacement, and
  orphan cleanup remove the cached image.
- Confirmed image shares use the existing authenticated
  `image.attach_bytes` gateway method followed by ordinary prompt submission.
  A synchronous send guard prevents fast double taps from submitting twice,
  and selecting the current but disconnected target now performs a real
  reconnect.
- Desktop now exposes the current session cwd as an always-visible status item.
  The same remote-aware project picker can retarget a draft or idle live
  session through the backend's existing `session.cwd.set` authority.
- Mobile keeps a preferred cwd per connection, sends it on `session.create`,
  adopts resumed/runtime cwd, and exposes one shared directory picker from Chat
  and Control.
- Mobile host launchers now give detached Hermes servers a user-home working
  directory. Windows Scheduled Task startup can no longer leak System32 into
  newly created sessions, and cross-platform service startup no longer uses the
  plugin checkout as the implicit agent workspace.
- Mobile Control now includes a searchable schema-driven host-settings surface
  using the authenticated `/api/config` deep-merge contract. Secret-like keys
  stay hidden and the existing redacted raw config view remains available.
- Mobile Files now has a closeable document pane, Preview and Edit tabs,
  explicit save/revert controls, current-folder cwd selection, and direct
  Reader handoff.
- Durable plan and compaction-resume procedure created.
- Standalone Git repository and project scaffold created.
- Server plugin linked and enabled in the Windows/AppData Hermes install.
- A single cross-platform host manager now preserves the Windows Scheduled Task
  path and adds guarded macOS launchd and Linux user-systemd services with the
  same loopback-only backend, host-validating proxy, protected credential, and
  tailnet-only Tailscale Serve topology.
- Host installation, status, explicit credential display, and macOS/Linux
  service removal are available through `scripts/mobile_host.py`.
- The macOS launchd service is installed and running with protected loopback
  listeners on ports 9129 and 9130. Tailscale Serve publishes the validating
  proxy at the Mac's current MagicDNS hostname.
- Server plugin reports compatible with Hermes `0.19.0`.
- Authenticated REST health, capability, and observation routes are live.
- Authenticated WebSocket delegates to the real Hermes gateway.
- Browser client supports connection setup, sessions, streaming, tools, stop,
  and connection-scoped unsent drafts.
- Capacitor 8 Android project created.
- Android native bridge provides Keystore-backed credentials, authenticated
  HTTP, and OkHttp WebSockets.
- Debug APK produced.
- Persistent `Hermes_Mobile_Server` scheduled task installed and running.
- Dedicated authenticated backend is listening on `127.0.0.1:9129`.
- Host-validating loopback reverse proxy is listening on `127.0.0.1:9130`.
- Tailscale Serve publishes the proxy over tailnet-only HTTPS at the
  workstation's current MagicDNS name, discovered at runtime instead of stored
  in the repository.
- Android now includes native Nous portal login, Cloud organization and agent
  discovery, silent per-agent OAuth, and core-gateway fallback.
- Android direct and Tailnet setup now probes the canonical public gateway
  health metadata before authentication. Gated Docker/remote hosts open their
  own password/OAuth sign-in and validate native sessions with a one-use core
  WebSocket ticket; ungated hosts retain Keystore-backed token mode.
- Direct/Tailnet hosts with no Mobile plugin now fall back to the standard core
  gateway on an explicit capability-route 404. Other plugin failures remain
  fail-closed so an installed incompatible plugin is not silently bypassed.
- The initial Mobile connection path remains plugin-owned. Milestone 5C adds a
  narrow generic TTS provider/catalog seam and Desktop UI to the adjacent local
  Hermes checkout, while every concrete Kokoro, F5-TTS, and Qwen implementation
  remains in this standalone repository.
- Gateway inventory confirms the side project can use existing Hermes RPCs for
  session history, reasoning and tool events, slash commands, model switching,
  config, toolsets, and cron management without core changes.
- The client now has the phone-first Chat, Sessions, and Control shell, rich
  reasoning/tool/request rendering, slash commands, model/config/toolset
  controls, and cron management.
- User and assistant messages now render safe GitHub-flavored Markdown,
  including responsive tables, task lists, links, images, blockquotes, and
  copyable fenced code. Raw HTML and active-scheme links remain disabled.
- TTS receives a plain-text projection of Markdown so formatting punctuation
  and link destinations are not spoken aloud.
- Android now records from the phone microphone, sends ephemeral audio through
  authenticated Hermes STT, and deletes the native temporary recording after
  transfer.
- Assistant replies have per-message Listen/Stop controls plus a
  connection-scoped auto-speak preference backed by authenticated Hermes TTS.
- Android foreground events now trigger an application-level gateway probe.
  A stale or closed socket is replaced, the same durable Hermes session is
  resumed, history is rehydrated, and retries remain bounded while the app is
  active.
- Disconnect events received while the app is active also enter the same
  reconciliation path. Intentional disconnects and connection switches do not
  auto-reconnect.
- Direct, Tailnet, and Cloud targets now live in a saved-connection registry
  with stable connection IDs and separate Android Keystore credential
  associations. Long-lived credentials remain outside JavaScript persistence.
- The Android bridge can enumerate existing Keystore credential IDs so a single
  orphan left by the older singleton connection store can be recovered and
  re-associated without revealing the token to JavaScript.
- Cloud cards now ignore literal `unknown` metadata and fall back to useful
  dashboard/gateway availability state.
- Tool rows remain readable before detail payloads arrive and consume Hermes's
  canonical `args_text` and `result_text` fields. Complete reasoning Markdown
  chunks are separated instead of being concatenated into malformed emphasis.
- Tool activity now seals the current live reasoning segment. Reasoning that
  resumes after a tool is inserted as a second inline block instead of editing
  the pre-tool block in place.
- Sessions can be searched and browsed by Hermes project, repository lane, cwd,
  branch, source, and model using the authoritative project gateway RPCs, with
  a flat-session fallback when project data is unavailable.
- The mobile palette can follow the connected Hermes host's active skin and
  live `skin.changed` events through an explicit read-only Follow host choice.
- The composer textarea grows from one line through multiline drafts with a
  bounded height and internal scrolling, using a phone-sized font and complete
  line box so text is not vertically clipped.
- The exact support-site Nous girl asset replaces the in-app H lettermark,
  empty-state mark, favicon, and Android legacy, round, and adaptive launcher
  icons.
- The polished dark Hermes Mobile palette is now the default. Host skin
  projection is an explicit connection-scoped option, so a host using `mono`
  no longer silently turns the app into a washed-out grayscale interface.
- Appearance is now fully client-local. Each saved connection can select Hermes
  Mobile or the Desktop-matched Nous, Midnight, Ember, Mono, Cyberpunk, and
  Slate palettes without sending `config.set skin` or modifying `display.skin`
  on the host. Appearance remains available while disconnected.
- Cached host skin data is tagged with the connection that emitted it. A
  connection change cannot clear a newly arrived skin or reuse the previous
  host's palette, and invalid empty skin events are ignored.
- Foreground history rehydration now merges with richer live transcript rows,
  preserving tool inputs and outputs already received by the phone. Durable
  summary-only tool rows are labeled static content instead of empty bordered
  disclosures.
- Every Android WebSocket dial now has a unique socket generation ID. Delayed
  state events from a backgrounded socket are ignored after its replacement is
  created, and expected background failures no longer raise a red gateway
  banner.
- Active Android WebSockets now retain a non-exported foreground
  `remoteMessaging` service before asynchronous ticket minting begins. The
  service posts an ongoing low-priority connection notification and holds a
  partial wake lock until the final native socket closes, keeping the CPU and
  socket alive while the screen is off or the app is backgrounded.
- Transient `thinking.delta` spinner/status events are no longer inserted into
  the transcript. Live reasoning opens with its actual Markdown, completed
  reasoning replaces its preview, tool generation plus argument/output aliases
  are consumed, and Markdown presentation separators no longer render as rows
  of empty lines.
- Summary-only durable tool history now states that the payload was not
  retained instead of presenting an empty disclosure.
- Normal TTS splits replies into provider-safe chunks no longer than 1,800
  characters and plays them sequentially.
- Each saved connection now has normal TTS provider, voice, and speed settings
  used by both per-response Listen and connection-scoped auto-speak.
- A multivoice Reader can parse named-speaker scripts, request Hermes smart
  voice assignment, override provider and voice per speaker, and read the
  resulting blocks in sequence.
- Reader cards now use a strict single-column, viewport-contained layout.
  Speaker names, voice selectors, normal prose, and unbroken URLs wrap or
  truncate inside the card instead of expanding the whole Reader horizontally.
- Reader playback now has a connection-scoped buffer-ahead preference matching
  Desktop's default of 3 and range of 0 through 6. It prepares the current
  block plus the configured number ahead while preserving script order, and a
  failed speculative request is retried once when that block becomes active.
- Reader playback follows the active speaker block by default. A manual touch
  scroll or mouse wheel releases follow mode, Resume follow reattaches it, and
  each block exposes Start here or Restart here playback.
- A failed Reader voice falls through distinct alternate selected providers
  first, then remaining selected voices, then the host default. Normal
  per-response Listen and auto-speak also fall back to the host default when a
  selected voice fails.
- Normal long-form Listen and auto-speak now default to a three-chunk lookahead,
  so later chunks synthesize while the current chunk is playing. Reader keeps
  honoring its explicit connection-scoped 0 through 6 buffer setting.
- Every completed chat message now has a Copy control that copies the full
  source text and briefly changes to Copied. Assistant messages retain the
  adjacent Listen or Stop control.
- The Files tab uses Hermes's authenticated remote-safe filesystem endpoints to
  browse directories, preview text files, and save explicit spot edits.
- The Files heading and path bar remain fixed while one explicit,
  touch-enabled directory/editor viewport owns vertical scrolling. Directory
  rows no longer shrink into a clipped container.
- Chat, Sessions, Reader, Files, and Control use an evenly aligned five-item
  bottom bar, with a fixed three-column composer above it.
- Streamed assistant rows are now sealed as explicit interim boundaries.
  Matching, prefix-continuing, and gateway-previewed final answers settle onto
  that row instead of rendering a second answer, while genuinely different
  pre-tool commentary remains visible.
- Id-less `tool.generating` notices now fold into the stable tool call instead
  of leaving orphan presentation rows. Rich completed tool inputs, outputs,
  progress, diffs, and findings survive foreground/history hydration and
  same-session reselection.
- Tool cards now follow Hermes `details_mode`: expanded opens the full detail
  region, collapsed starts closed but remains tappable, and hidden keeps a
  labeled tool-status card without exposing payloads. Long expanded bodies own
  a bounded touch-scroll region instead of trapping content in an unscrollable
  small bubble.
- Collapsed tool mode now retains a substantial readable card with the tool
  name, running/completed/failed state, and bounded progress, input, and output
  previews. It no longer reduces completed tools to anonymous horizontal bars.
  Id-less `tool.complete` events are now authoritative and survive final-answer
  settlement instead of being removed as provisional generation notices.
- Android now treats Capacitor's `appStateChange` as the sole native lifecycle
  authority and schedules a foreground probe only for a real
  inactive-to-active edge. The WebView visibility event remains the browser
  fallback and no longer duplicates native probes.
- A single slow foreground probe no longer tears down a healthy-looking
  socket. The app requires a second failed application-level probe before
  redialing, while an already-closed socket still reconnects immediately.
- JSON-RPC connect attempts and reconnect tasks are bound to their exact socket
  and connection generations. Late open, close, or failure events from a
  replaced attempt cannot change the current gateway state.
- Closing a native socket while its listeners or ticket are still being
  prepared now cancels the Java dial. Native cancellation tombstones,
  idempotent foreground-service leases, and terminated-socket cleanup prevent
  orphan OkHttp sockets, leaked Capacitor listeners, and duplicate service
  release/start cycles.
- Foreground-service promotion and wake-lock runtime failures are caught inside
  the service, logged without credentials, and stopped cleanly instead of
  escaping as an activity-closing process exception.
- Physical-device ADB exit history and the Android crash buffer confirmed three
  tab-return crashes in `HermesConnectionService`. A fast socket release could
  bring down a service while Android was still waiting for its foreground
  promotion, producing `ForegroundServiceDidNotStartInTimeException`.
- `HermesConnectionService` now promotes immediately in `onCreate()` and uses
  process-wide requested socket state to prevent a release from overtaking a
  pending retain. The replacement APK was installed in place on the physical
  phone, preserving app data and Android Keystore credentials.
- A separate post-fix process exit was traced to Android WebView renderer
  eviction under memory pressure during long audio and large session/project
  callbacks. Capacitor's debug bridge was stringifying and logging complete
  native gateway payloads, and its default `BridgeWebViewClient` did not handle
  `onRenderProcessGone()`, so WebView killed the application process.
- Android packaging now disables Capacitor native callback payload logging. The
  primary renderer remains important while the app is backgrounded, and both
  the application WebView and the native sign-in WebView clean up a terminated
  renderer. The activity recreates and reconnects instead of allowing renderer
  eviction to terminate the foreground-service process.
- Transcript children now use non-shrinking flex sizing. Growing live
  reasoning, messages, or later tool events increase the transcript's scroll
  height without compressing earlier expanded tool cards into horizontal
  slivers.
- Streaming transcript follow now runs as an immediate layout correction only
  while the user is near the bottom. Manual upward scrolling releases follow,
  avoiding the long-answer rubberband caused by restarting CSS smooth
  scrolling for every streamed chunk.
- Late completed reasoning and tool lifecycle events are inserted before the
  current turn's final assistant response. Network arrival order no longer
  places thinking or tools below an already-rendered final answer.
- Live transcript reduction now also canonicalizes already-present reasoning and
  tool rows on completion and lifecycle updates. A row that has already landed
  below the final answer is repaired immediately instead of waiting for session
  history rehydration after navigation.
- The private `helix4u/hermes-mobile` repository now has a credential-safe
  install guide, explicit agent handoff contract, host verification script,
  runtime MagicDNS discovery, and focused client/server GitHub CI. The repo
  contains no session token, Tailnet hostname, or long-lived credential.
- Android exit history captured the overnight failure at 08:59:48 as
  `ForegroundServiceDidNotStartInTimeException` in
  `HermesConnectionService`, not a Reader or WebView exception. A reconnect
  reached an existing service object after it had removed foreground state, so
  `onCreate()` did not rerun and Android's five-second promotion deadline
  expired.
- Every retain now reasserts foreground state before lease reconciliation.
  Idle teardown keeps the notification until `onDestroy()`, uses
  `stopSelfResult(startId)` so an older release cannot stop a newer retain, and
  enters through `startForegroundService()` without relying on a racy
  `serviceCreated` snapshot.
- The standalone plugin now registers real local Kokoro, F5-TTS, and Qwen3-TTS
  providers through Hermes's generic TTS provider registry.
- Provider discovery now exposes dynamic voices, models, and capabilities to
  Desktop and Mobile without provider-specific UI fetches.
- Qwen3-TTS runs as an isolated authenticated loopback service on port 9140
  with its own Python 3.12 environment, CUDA 12.8 PyTorch runtime, scheduled
  task, and reusable voice store under the Windows Hermes home.
- Qwen clone mode accepts reference audio plus an optional transcript.
  VoiceDesign mode accepts a natural-language voice instruction, creates a
  reusable reference, then uses the smaller Base model for ordinary clone
  synthesis.
- Desktop Settings now includes a capability-driven Voice library for clone,
  design, language, transcript, instruction, reusable voice selection, and
  deletion.
- Desktop Voice settings, Reader, Pet speech, Mobile normal TTS, and Mobile
  Reader all consume the same live custom-provider catalogs.
- Mobile now renders the selected provider's voices in a real `select`
  control instead of relying on an Android WebView `datalist`. Partial
  built-in live catalogs are merged with the complete bundled choices, while
  provider-owned custom catalogs remain authoritative.
- Mobile Voice now exposes the generic custom-provider capabilities: Qwen
  clone from phone reference audio, instruction-based design, language,
  transcript/sample text, automatic selection after creation, and deletion of
  provider-owned voices. The client contains no Qwen-specific endpoint branch.
- Reference audio remains only in component memory during the authenticated
  request and is cleared after creation. Android voice creation can use a
  bounded 15-minute native HTTP timeout so first model download or VoiceDesign
  is not cut off by the ordinary audio-request timeout.
- A partial live catalog for a built-in provider is merged with Desktop's
  complete built-in voice list instead of replacing it with only the currently
  configured voice. Dynamic plugin catalogs and account-owned ElevenLabs
  catalogs remain provider-authoritative.
- Plugin TTS dispatch now resolves voice, model, language, and instruction from
  the selected provider's own configuration before considering generic root
  values. A root Kokoro voice can no longer be sent to F5-TTS or Qwen when
  previewing or playing those providers.
- The regular Desktop shortcut target has been repackaged and launched with
  the new TTS UI. The exact shortcut executable emitted
  `HERMES_BACKEND_READY` and completed Desktop startup.
- Local Mobile `main` now contains private fix branch
  `origin/codex/fix-live-transcript-order` at
  `acc940c58a1605b04312d1acfdedc9ab6277e691`, four commits ahead of private
  `origin/main` at `f58d77e0424f25262ca7c9fa75fd86a5e4dd31c7`.
- The cross-platform host follow-up no longer evaluates `os.getuid()` on
  Windows during injected launchd command tests; the focused server suite
  passes on Windows with only the expected platform-specific skips.

Next action:

Install the newest APK in place with app data preserved and rerun the exact
multivoice Render & save that failed at 22 of 24. Confirm it completes all
chunks and opens Android's document picker without a 500 from
`/api/audio/speak`.

Install the rebuilt debug APK in place with app data preserved. Confirm Control
returns with every settings section collapsed. First reopen the reported image
generation session or create another generated image. Confirm the completed
reply renders the image inline instead of showing `MEDIA:`, the full-screen
viewer opens on tap, Copy hides the host path, and Listen does not speak it.

In a deeply scrolled Files directory, open Markdown, plain text, image, audio,
and video files. Confirm the preview is immediately visible;
Preview/Edit/save/revert/download, Previewer/Reader handoff, image full-screen
Fit/Actual size, and native media playback work on the phone.

Use a supported third-party media link to confirm ask/always/off embed
behavior, then render a multivoice script to one WAV and save it with Android's
document picker. Confirm the saved WAV contains every speaker block in order.

Then share a link, text, and an image from other Android apps. Confirm each
waits for explicit approval, can switch remote targets, can select an existing
session, and can create a new session with a chosen remote cwd. Cancel one
image share and confirm it does not reopen. Download files from both a row and
the document pane and verify the Android-selected copies.

Then confirm the
Session cwd strip, remote folder picker, connection-scoped persistence, live
idle-session retargeting, Files close/Preview/Edit/save flow, and Open in Reader
handoff. The regular Desktop shortcut is already running the rebuilt package;
confirm its workspace status item changes both a draft and an idle live
session.

Then connect the physical Android tailnet peer through the verified Mac HTTPS
MagicDNS endpoint and open Control, Voice. Select Qwen3-TTS,
F5-TTS, and Kokoro and confirm each real Voice picker is populated. With Qwen
selected, create a clone from phone audio and a design from instructions,
confirm each new voice is selected after creation, and verify it remains
available in normal Voice and Reader. Continue the Desktop preview checks from
the regular shortcut as well.

Validation completed:

- The Windows/AppData Mobile host was refreshed again at
  `2026-07-29 19:37 -06:00` after the adjacent Hermes core performance pass.
  The scheduled service is running, loopback backend 9129 and validating proxy
  9130 are listening, authenticated health is `ok`, compatibility is
  `compatible`, contract version is 1, and Tailscale Serve remains configured.
  The checked-in installer and status workflows did not print the credential.
- Current local-tree Android rebuild: the checked-in client build, Capacitor
  sync, and a forced `assembleDebug --rerun-tasks` all passed with Android
  Studio JDK 21. The matched refresh after the adjacent Hermes session/database
  hardening produced an APK of 5,240,774 bytes, modified at
  `2026-07-30T00:01:49.8005446Z`, with SHA-256
  `7A8C90DAB74A333D6114777E9911AB8902E93804C280A2393C287D2D9F0D2D57`.
- Mobile proxy timeout unittest: 3 tests passed.
- Focused speech queue/render Vitest: 2 files and 10 tests passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed.
- The refreshed Windows Mobile host reports a running service, both loopback
  listeners, authenticated health `ok`, compatibility `compatible`, contract
  version 1, and configured Tailscale Serve.
- Two authenticated xAI syntheses through the actual validating proxy returned
  HTTP 200 with 2,335,322-byte and 3,550,298-byte responses near the former
  30-second cutoff; no new `/api/audio/speak` 500 appeared.
- Proxy-timeout replacement APK size: 5,496,505 bytes.
- Proxy-timeout replacement APK SHA-256:
  `76C1F9BEBD274DA6642C27214C2B442739D8E4555B3CCFC7B499E4E18FB9B2AA`.
- Generated-media focused Vitest: 5 files and 21 tests passed.
- Complete Mobile client Vitest suite: 31 files and 127 tests passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  Android `compileDebugJavaWithJavac`, and `assembleDebug` with Android Studio
  JDK 21: passed.
- A real 360 by 800 Chrome render loaded a completed Windows-path `MEDIA:`
  marker through a fake authenticated transport, kept the document exactly
  360 pixels wide, rendered the image card at 308.3 pixels wide, opened the
  full-screen viewer, omitted the host path from rendered HTML, and produced no
  browser or React console errors.
- Generated-media debug APK size: 5,496,505 bytes.
- Generated-media debug APK SHA-256:
  `125350D161CBA41765A31CD9E94987975076E41B1A5A0B699C7B82725E8171B4`.
- Reader/preview/media focused Vitest: 10 files and 33 tests passed.
- Complete Mobile client Vitest suite: 30 files and 122 tests passed.
- Mobile TypeScript typecheck, Vite production build, and Capacitor Android
  sync: passed.
- Android `compileDebugJavaWithJavac` and final `assembleDebug` with Android
  Studio JDK 21: passed.
- A real 360 by 800 Chrome pass confirmed every Control disclosure starts
  closed and returns to zero open sections after leaving and re-entering the
  tab.
- The same phone-width pass scrolled a 26-file directory to the bottom, opened
  the final file, and confirmed the document preview was moved to viewport
  position 200 px with its Markdown content and all actions visible. The
  document remained exactly 360 px wide.
- The combined Reader/Preview surface remained exactly 360 px wide. File
  Preview rendered Markdown and its actions; Multi-voice Reader kept Voices &
  buffering closed and gave its Read action the full 311.6-pixel control width.
- Image, audio, video, and embed surfaces remained within the 360-pixel
  document. The image preview rendered at 310 px wide, opened the full-screen
  viewer, both media elements exposed native controls, and YouTube remained
  behind the default consent façade.
- `git diff --check`: passed with only existing line-ending warnings.
- Reader/preview/media debug APK size: 5,496,505 bytes.
- Reader/preview/media debug APK SHA-256:
  `AE0B035216771FF13234E1E01A9EB11CFD5F5661E4C201AD38528B6284D3980D`.
- Android share/download focused Vitest: 4 files and 13 tests passed.
- Complete Mobile client Vitest suite: 24 files and 111 tests passed.
- Mobile TypeScript typecheck, Vite production build, and Capacitor Android
  sync: passed.
- Android `compileDebugJavaWithJavac` and `assembleDebug` with Android Studio
  JDK 21: passed.
- Packaged manifest inspection confirms exported `ACTION_SEND` handling for
  both `text/*` and `image/*`.
- A real 360 by 800 Chrome render kept the share sheet, long shared filename,
  message editor, destination controls, and action row inside the exact
  360-pixel document width. The sheet owned vertical overflow.
- The stacked new-session directory picker also stayed exactly 360 pixels wide,
  rendered above the share sheet at z-index 110 over 105, and kept its remote
  directory list and actions visible.
- Share/download debug APK size: 5,496,505 bytes.
- Share/download debug APK SHA-256:
  `D96E082BA52A1AF39152AD12B8B7BC3ECF8DECA86CC706441D165A87B6C4272D`.
- Session workspace and host-config focused Mobile tests: 3 files and 10 tests
  passed.
- Complete Mobile client Vitest suite: 22 files and 106 tests passed.
- Mobile TypeScript typecheck, Vite production build, and Capacitor Android
  sync: passed.
- Focused Mobile server-plugin suite: 19 tests run, 14 passed, and 5 expected
  Windows platform skips.
- Every checked-in Mobile PowerShell script passed the PowerShell parser.
- Android `assembleDebug` with Android Studio JDK 21: passed.
- Session-workspace debug APK size: 5,496,505 bytes.
- Session-workspace debug APK SHA-256:
  `0F65E4BDFA1E99121FE0A46BDF91CC02D2C5D5AFC0D718B9AA057DC5B5AF1CB9`.
- The refreshed Windows Mobile service is running, both loopback listeners are
  live, authenticated health is `ok`, compatibility is `compatible`, contract
  version is 1, and Tailscale Serve remains configured. The credential was not
  printed.
- Desktop cwd/dropdown focused Vitest: 3 files and 17 tests passed.
- Desktop TypeScript typecheck and `npm run pack`: passed.
- The regular shortcut target is 214,281,216 bytes with SHA-256
  `86646F9CF2D10205547BBE1B9172E7A2F8ACFBDA72345B39F72601268E844917`.
- Launching `C:\Users\btgil\Desktop\Hermes.lnk` started the exact packaged
  AppData executable, emitted `HERMES_BACKEND_READY port=54888`, and returned
  HTTP 200 from `/api/status` and `/api/health`.
- A real 360 by 800 browser render kept the new Session cwd strip readable,
  full-width, and aligned above the existing composer and five-item bottom
  navigation.
- The adjacent Windows/AppData Hermes checkout was pinned to upstream Nous
  `main` at `bff22069727ae7b7f8ede8d7da110ab0f1558d69`, the latest fetched tip
  selected for this reconciliation. Upstream advanced by six commits during
  the run and was intentionally not chased after the replay/build baseline was
  pinned.
- Upstream TTS behavior was preserved during conflict reconciliation:
  provider priority, MiniMax endpoint and credential resolution, scrubbed
  subprocess credentials, streaming speech dispatch, and expanded built-in
  voice/model catalogs remain present alongside plugin streaming and custom
  provider support.
- The exact reconciled Hermes/Desktop layer is recoverable from
  `backup/final-latest-nous-reconciled-20260729-014153` at
  `e0abf3b5e64b29a2db4535fda8428e5d805fe053`. Visible `main` remains on the
  pinned upstream commit with 156 ordinary local changes, nothing staged, and
  no unmerged paths.
- Consolidated Desktop TypeScript typecheck passed. All 31 changed Desktop
  Vitest files passed, 398 tests total, with four workers.
- Changed Python source compiled through the Windows/AppData venv. A focused
  import smoke confirmed the upstream provider-priority and MiniMax runtime
  contracts plus the local plugin streamer and enhanced `speak_text` surface.
- Desktop `npm run pack` passed and replaced the exact regular shortcut target.
  `Hermes.exe` is 214,281,216 bytes with SHA-256
  `988697015FF83469A9C394B3EBE2FC42D80668593EF4D5741F16FF7F1836925A`.
- Launching `C:\Users\btgil\Desktop\Hermes.lnk` produced a visible packaged
  process, emitted `HERMES_BACKEND_READY port=63214`, and returned HTTP 200
  from both `/api/status` and `/api/health`. Dashboard and storage are healthy;
  the overall degraded label only reflects the separately stopped messaging
  gateway.
- The exact Mobile follow-up layer is recoverable from
  `backup/mobile-final-reconciled-20260729-014135` at
  `d83382e97186b5d526a3bc27c250bd365526753a`. Visible Mobile `main` remains on
  the private fix-branch tip with its four follow-up files left as ordinary
  local changes.
- Windows consolidation of private branch
  `origin/codex/fix-live-transcript-order` at `acc940c58a1605b04312d1acfdedc9ab6277e691`:
  fast-forwarded locally without pushing private `origin/main`.
- Consolidated full Mobile client Vitest suite: 20 files and 100 tests passed.
- Consolidated Mobile TypeScript typecheck: passed.
- Consolidated focused server-plugin unittest suite on Windows: 19 tests run,
  14 passed, and 5 platform-specific tests skipped.
- Consolidated Python compile over `server-plugin`, `tests/server`,
  `scripts/mobile_host.py`, and `qwen-service/src`: passed.
- Consolidated Android `assembleDebug` with Android Studio JDK 21: passed.
- Consolidated debug APK size: 5,496,505 bytes.
- Consolidated debug APK SHA-256:
  `6B35AA0544DF91D13ED2C8FB377A5FE0A762C071257DC0A3579BE89D458DBE3C`.
- Transcript-order regression tests prove both prior failures: late activity
  could remain below the final response, and resumed thinking mutated the
  pre-tool reasoning block. The corrected focused suite passes 27 tests.
- Direct-auth and core-gateway tests cover unlocked token mode, saved gated
  sessions, native host sign-in, direct plugin-404 fallback, and fail-closed
  plugin errors.
- Full Mobile client Vitest suite: 20 files and 100 tests passed.
- Mobile TypeScript typecheck and Vite production build: passed.
- Capacitor Android sync: passed and copied the corrected web bundle into the
  native project.
- Focused server-plugin unittest suite: 19 tests passed.
- Android native source passed a Java syntax parse after normalizing the file's
  existing Java 9 try-with-resources shorthand for the Java 8 parser.
- Android `compileDebugJavaWithJavac` could not start on this Mac because neither
  a system Java runtime nor Android Studio's bundled JDK is installed; the
  existing APK was not replaced and does not contain these latest changes.
- macOS cross-platform host focused tests: 9 passed.
- macOS launchd agent `dev.hermes.mobile-server`: running.
- Loopback backend `127.0.0.1:9129` and validating proxy
  `127.0.0.1:9130`: listening.
- Authenticated tailnet HTTPS health: `ok`; compatibility: `compatible`;
  contract version: 1.
- Authenticated one-use-ticket WSS probe emitted `gateway.ready` and returned
  `session.list` successfully through the real MagicDNS endpoint.
- The authenticated live Mobile host catalog returned six usable providers.
  F5-TTS reported 12 voices, Kokoro reported 68 voices, and Qwen reported the
  user's existing saved voice; the earlier empty Mobile picker was therefore
  isolated to the Android WebView datalist presentation.
- Mobile voice-picker/custom-library focused tests: 3 files and 9 tests passed.
- Full Mobile client Vitest suite: 19 files and 90 tests passed.
- Mobile TypeScript typecheck and Vite production build: passed.
- Capacitor Android sync: passed with the new voice library bundle.
- Android `assembleDebug` with Android Studio JDK 21: passed, including the
  native per-request timeout support.
- Voice-library debug APK size: 5,496,505 bytes.
- Voice-library debug APK SHA-256:
  `996ECD835E0FE70403AC6E780AA58E5EEC7BDE0C6254EA400D81495FDD41024E`.
- Live generic catalog on the dedicated authenticated host returned 68 Kokoro
  voices, 12 F5-TTS voices, and Qwen clone/design/delete capabilities.
- Qwen clone smoke: created a reusable clone through Hermes from a 152,810-byte
  Kokoro reference WAV, synthesized a 135,576-byte RIFF/WAV through
  `/api/audio/speak`, and deleted the test voice.
- Qwen VoiceDesign smoke: created a reusable designed voice from an instruction,
  synthesized a 133,006-byte RIFF/WAV through `/api/audio/speak`, and deleted
  the test voice.
- Provider-scoped dispatch regression proof: with the stale Kokoro root voice
  deliberately present, the configured F5-TTS `blitz` voice synthesized a
  116,618-byte RIFF/WAV through `/api/audio/speak`.
- Saved Qwen preview regression proof: with the same stale Kokoro root voice
  deliberately present, the user's existing saved Qwen voice synthesized a
  107,948-byte RIFF/WAV through `/api/audio/speak`. The saved voice remained in
  the Qwen catalog and was not recreated or modified.
- AppData logs contain no new F5-TTS 500 or Qwen 404 after those regression
  requests. Both providers emitted successful `TTS audio saved` entries.
- The exact regular `Hermes.lnk` target was restarted after the dispatch fix.
  Its new packaged process spawned one Desktop backend and emitted a fresh
  `HERMES_BACKEND_READY` marker.
- Qwen runtime reports PyTorch 2.11.0+cu128, torchaudio 2.11.0+cu128, CUDA
  available, and NVIDIA GeForce RTX 3080 Ti.
- Desktop focused Vitest: 4 files and 76 tests passed.
- Desktop built-in/custom voice-catalog regression suite: 4 files and 77 tests
  passed after adding the partial-live-catalog merge case.
- Desktop TypeScript typecheck: passed.
- Focused Desktop TTS files lint with zero errors. The broader dirty tree still
  has an unrelated pre-existing import-order lint error in
  `pet-commentary-event.test.tsx`.
- Desktop `npm run pack`: passed and produced the exact regular shortcut
  target.
- Desktop shortcut and packaged executable SHA-256 matched:
  `C57AF906B4DE6D814103B50B1A09CED868C7E3E5E73867874F4306C685E49C9F`.
- Shortcut launch resolved to
  `C:\Users\btgil\AppData\Local\hermes\hermes-agent\apps\desktop\release\win-unpacked\Hermes.exe`
  and the backend reported ready on loopback.
- The launched Desktop backend's custom-provider catalog route returned the
  expected unauthenticated 401 rather than a missing-route 404, confirming the
  packaged runtime exposes the new authenticated API.
- `python -m unittest discover -s tests/server -v`: 10 passed.
- `python -m compileall -q server-plugin tests/server`: passed.
- `npm run typecheck`: passed.
- `npm test`: 18 files and 88 tests passed.
- `npm run build`: passed.
- `npm audit`: 0 vulnerabilities.
- `cap sync android`: passed.
- Android `assembleDebug` with Android Studio JDK 21: passed.
- Private-repository CI run `30372499457` passed both the client and
  server-plugin jobs for reconnect-fix commit `a786873`.
- Capacitor sync registered `@capacitor/app` 8.1.1, and APK inspection confirms
  `com.capacitorjs.plugins.app.AppPlugin` plus the foreground-reconnect bundle.
- Debug APK size: 5,496,505 bytes.
- Debug APK SHA-256:
  `996ECD835E0FE70403AC6E780AA58E5EEC7BDE0C6254EA400D81495FDD41024E`.
- Physical-device ADB identified three
  `ForegroundServiceDidNotStartInTimeException` crashes at 22:38, 01:34, and
  01:38, all naming `dev.hermes.mobile/.HermesConnectionService`.
- The replacement APK installed successfully in place at 01:52:59. Its first
  launch stayed alive as PID 12811, and Android reported the connection service
  as `isForeground=true`, notification ID 2201, service type
  `remoteMessaging`.
- PID 12811 later exited at 01:55:57 after WebView logged that renderer PID
  12839 was killed by OOM or update and that the unhandled renderer loss was
  killing the application. The process ended through `SIGKILL`, not a new
  foreground-service exception.
- The renderer-recovery replacement APK installed successfully in place at
  02:04:24. Its SHA-256 is the current debug APK hash above. It launched as PID
  30164 with a correctly promoted `remoteMessaging` foreground service, no full
  gateway payloads in Logcat, and no new Android exit record during the initial
  live interval.
- The final scroll and event-order APK installed successfully in place at
  02:22:36 and launched as PID 17819. Android reports
  `HermesConnectionService` as `isForeground=true`, notification ID 2201, and
  service type `remoteMessaging`.
- PID 17819 crashed at 08:59:48 after the overnight idle/resume path. Android's
  exact exception was `ForegroundServiceDidNotStartInTimeException` naming
  `dev.hermes.mobile/.HermesConnectionService`. The WebView renderer ended only
  after the application process and was not the cause.
- The first reconnect-corrected APK installed in place and launched as PID
  26645. Android reported the service as `isForeground=true`, notification ID
  2201, and service type `remoteMessaging`; it remained alive beyond the
  five-second deadline with no new crash entry during the initial interval.
- The final repository variant uses the foreground-service entry point for
  every retain and passes Android `assembleDebug`. It has not been pushed onto
  the phone because no further phone interaction is requested right now.
- `scripts/test-mobile-server.ps1` verified the running scheduled task,
  loopback backend and proxy, authenticated `ok` health, `compatible` contract
  version 1, and configured Tailscale Serve without printing the credential.
- Every checked-in PowerShell script passes the PowerShell parser.
- Packaged manifest inspection confirms `WAKE_LOCK`, `FOREGROUND_SERVICE`, and
  `FOREGROUND_SERVICE_REMOTE_MESSAGING`, plus the non-exported
  `HermesConnectionService` with the `remoteMessaging` service type.
- APK inspection confirms the support-site `nous-sidecar-128.png` asset and
  every mdpi through xxxhdpi legacy, round, and adaptive launcher resource are
  packaged.
- Fresh 360 by 800 browser renders confirm the polished default theme, fixed
  composer, aligned five-item bottom navigation, Reader, and Files layouts.
  A hard reload produced no console errors or React hook-order warning.
- A real 360 by 800 Chrome appearance pass selected all eight local choices.
  Hermes Mobile and the six Desktop-matched presets produced their expected
  computed background, surface, and accent tokens; Follow host safely used the
  mobile fallback while disconnected. Every choice persisted under the current
  connection ID, the document stayed 360 px wide, and Chrome logged no errors.
- A 360 by 800 long-directory fixture produced a 512 px file viewport with
  1,730 px of scroll content. A real scroll gesture advanced the viewport from
  position 0 to 480 while the heading, path bar, and bottom navigation remained
  fixed.
- A 360 by 800 Reader stress fixture kept the 360 px document scroll width,
  the Reader card at right edge 333 px, its prose at right edge 320.5 px, and
  its long voice selector at right edge 320.5 px. Long speaker names, prose,
  and an unbroken URL rendered inside the card.
- A 360 by 800 Chat fixture kept both message bubbles and the Copy plus Listen
  action rows inside the viewport with a 360 px document scroll width.
- A 360 by 800 live-activity fixture rendered actual reasoning, tool progress,
  input, and output with zero `<hr>` rows, two visible tool detail bodies, and
  a 360 px document scroll width.
- A 360 by 800 long-tool fixture verified that collapsed mode opens on click,
  hidden mode retains the labeled tool card without payload text, and expanded
  mode restores the full detail region. The detail viewport measured 480 px
  high against 3,103 px of content and scrolled independently from position 0
  to 420 with `overflow-y: auto` and `touch-action: pan-y`.
- A fresh 360 by 800 collapsed-tool fixture rendered running, completed, and
  summary-only tools as 117 to 182 px readable cards at 328 px wide. The cards
  retained status plus progress/input/output previews, the document remained
  exactly 360 px wide, tapping the completed terminal card opened a 327 px full
  detail region, and the browser logged no warnings or errors.
- A 360 px real-Chrome overflow fixture reproduced the live shrink before the
  fix: four 63 px expanded tool cards collapsed to 2 px each as reasoning
  grew. With non-shrinking transcript rows, all four remain 63 px while the
  transcript scroll height grows to 1,008 px inside its unchanged 560 px
  viewport.
- A 360 by 800 Reader fixture centered a selected Start here block, kept the
  document at 360 px wide, and confirmed a manual scroll held its position
  while playback advanced and exposed Resume follow.
- `git diff --check`: passed.
- Live AppData `hermes serve` REST probe: authenticated endpoints returned 200.
- Live WebSocket probe: unauthenticated connection rejected, authenticated
  connection emitted `gateway.ready`, and `session.list` returned successfully.
- Live mobile ticket probe: 30-second ticket accepted once and replay rejected.
- Live tailnet HTTPS probe: unauthenticated request returned 401 and an
  authenticated capability request returned `compatible`.
- Live tailnet WSS probe: connected through Tailscale Serve, emitted
  `gateway.ready`, and returned `session.list` successfully.
- Live authenticated voice loop: `/api/audio/speak` synthesized an MPEG reply
  through xAI and `/api/audio/transcribe` transcribed that audio through OpenAI
  as `Hermes Mobile Voice Test`.
- APK inspection confirms the packaged app requests
  `android.permission.RECORD_AUDIO`.
- Session credential ACL grants full control only to the current Windows user.

Known constraints:

- The initial mobile gateway delegates to Hermes's current dispatcher and
  transport implementation through a compatibility adapter.
- Complete cross-process run observation is outside the first milestone.
- The browser client does not persist authentication tokens.
- Native connections currently require HTTPS/WSS.
- The physical phone's currently installed APK predates the newest transcript
  interleaving, live late-event reconciliation, and Docker direct-auth changes.
  The current branch still needs to be pulled and built on the Android-capable
  host, then installed in place with app data preserved. Long-output, long-TTS,
  screen-off, and repeated app-switch acceptance also remain user-driven.
- If the older singleton build already overwrote a Tailnet connection's stored
  URL, the URL cannot be reconstructed and must be entered once. The new build
  can recover a single orphaned Keystore credential association, and future
  hosts retain separate registry entries.
- Native microphone capture and Cloud sign-in require interactive phone state,
  so those remain user-driven physical-device acceptance paths even though ADB
  is connected for crash and lifecycle observation.
- Android foreground recovery and foreground-service retention are covered by
  focused client tests, manifest inspection, and a successful native build,
  but real screen-off timing, device-specific power management, and physical
  app switching still require the phone check.
- The prior tab-return foreground-service crash, the separate unhandled WebView
  renderer exit, and the overnight reconnect promotion race are all fixed in
  the repository. Repeated background, screen-off, and long-TTS evidence is
  still required before final physical-device acceptance, but no immediate
  user-driven test is requested.
- Core `cron.manage` currently exposes structured list, add, pause, resume, and
  remove actions. Edit and run-now are not part of that RPC and are not claimed
  by the Milestone 5B client.
- Hermes's durable `session.history` intentionally omits full historical tool
  payloads. The app preserves details it received live across completion,
  rehydration, and same-session selection, and renders a useful labeled summary
  for older or fully missed tool rows, but true post-process replay of every
  tool payload still requires Milestone 3's mobile event journal.
- The mobile file browser mirrors Desktop's remote-safe list, read, and
  write-text path, and now downloads through the authenticated data route plus
  Android's system save picker. Electron-local rename, delete, reveal, and
  other operating-system file actions are not exposed by the remote API and
  are not claimed.
- Inline remote image/audio/video preview currently uses Hermes's authenticated
  data-URL route and inherits its 16 MiB response limit. Larger media remains
  downloadable but needs a future authenticated streaming seam for inline
  playback.
- Full podcast export currently assembles a mono WAV in client memory before
  opening the save picker. That keeps provider ordering and fallbacks
  deterministic, but very long renders still need physical-device memory and
  cancellation acceptance before this is treated as an unbounded export path.
- Android share routing is covered by focused client behavior tests, native
  Java compilation, packaged-manifest inspection, and phone-width Chrome
  rendering. Actual source-app content-URI grants, Android chooser behavior,
  Cloud target switching, system document destinations, and byte-for-byte
  downloaded-file acceptance remain physical-device checks.
- Long TTS chunking and lookahead, provider selection, buffered multivoice
  playback, Reader auto-scroll/manual takeover/section restart, voice
  fallbacks, Android clipboard behavior, and remote file saves are covered by
  focused client behavior tests, phone-width browser rendering, and successful
  production builds, but still require the physical-phone and configured-
  provider acceptance pass.
- A foreground service and partial wake lock substantially improve connection
  survival, but Android force-stop, process termination, and some device power
  policies can still end the process. Full recovery after process death remains
  Milestone 3 and Milestone 8 work.
- Android assistant-role integration is now planned through an explicit
  `ACTION_ASSIST` entry first, with a full lightweight
  `VoiceInteractionService` deferred until that path is proven. Broad
  AccessibilityService observation is not part of the current app; any future
  accessibility integration must be tied to a concrete user-triggered
  assistive workflow and disclose window-content access separately.
- Qwen's first use downloads and warms the selected model. VoiceDesign uses the
  larger 1.7B model to create a reusable reference, then unloads it; normal
  playback uses the 0.6B Base clone model. The first request is therefore much
  slower than later playback.
- The Qwen service and provider adapters are local experiments. They are
  intentionally owned by this standalone repository and are not an upstream
  Hermes product claim.
- The machine default Java 25 is too new for Gradle 8.14.3; Android builds use
  Android Studio's bundled JDK 21.
