# Hermes Mobile Side Project Plan

Status: active

Last updated: 2026-07-29

Project root: `F:\Symlinks\hermes-data\hermes\hermes-mobile`

Hermes reference checkout: `F:\Symlinks\hermes-data\hermes\hermes-agent`

Initial Hermes reference revision: `3be565fbdee3115ab5b9338551768b8e5e655c56`

## Purpose

Build Hermes Mobile as an independent side project with two deliverables:

1. An installable Hermes server plugin.
2. A React client application distributed as an Android Capacitor app and a
   same-origin web application.

The server plugin is the compatibility boundary. The client speaks a versioned
mobile contract owned by this project and does not import Hermes backend code.

This project is not intended for inclusion in the upstream Hermes repository.
It must not require modifications to the user's Hermes checkout for its initial
release.

Milestone 5C is an explicitly local experiment that also widens Hermes's
generic TTS-provider seam and Desktop UI in the adjacent checkout. The provider
implementations and Qwen runtime remain owned by this standalone project.

## Compaction and Resume Procedure

After any context compaction, reconstruction, or new Codex session:

1. Read the applicable on-disk Hermes `AGENTS.md` files in full before inspecting
   or invoking anything in the Hermes checkout.
2. Read this `PLAN.md` from line 1 through EOF.
3. Read `STATUS.md` if it exists.
4. Run `git status --short --branch` in this project.
5. Inspect the "Current milestone" and "Next action" fields below.
6. Continue from the first unchecked acceptance item. Do not restart completed
   work or regenerate scaffolding unless validation proves it is broken.
7. Preserve unrelated local changes in both repositories.
8. Do not modify the Hermes checkout unless the user explicitly expands scope.

When a milestone materially changes, update this document and `STATUS.md` in the
same work session.

## Non-Goals for the Initial Release

- Upstreaming the project into `NousResearch/hermes-agent`.
- Modifying Hermes core.
- Reimplementing the Hermes agent, tools, model loop, or transcript database.
- Full Desktop settings parity.
- Provider credential setup, plugin administration, or billing.
- SSH tunneling.
- Full terminal emulation or remote file editing.
- Guaranteed live observation of sessions owned by unrelated Hermes processes.
- Push notifications after Android process death.
- Production device pairing in the first milestone.

## Architecture Decision

```text
Hermes host
  hermes serve
    Hermes Mobile server plugin
      /api/plugins/hermes-mobile/v1/*
      authenticated HTTP
      authenticated WebSocket
      mobile capability negotiation
      mobile event journal
      compatibility adapter
      optional same-origin web assets

Phone or browser
  Hermes Mobile client
    React + TypeScript
    browser transport
    Capacitor Android transport
    connection-scoped state
    local unsent drafts
```

The plugin owns the stable external contract. Hermes remains authoritative for
agent execution and durable conversation history.

Hermes Mobile supports two connection providers behind the same saved
connection model:

1. Direct HTTPS targets, including Tailnet endpoints. These prefer the mobile
   plugin contract and its compatibility report.
2. Hermes Cloud. The Android native layer owns the Nous portal session, org and
   agent discovery, silent per-agent sign-in, and the remote gateway cookie
   jars. Cloud agents use the existing Hermes core JSON-RPC gateway when the
   standalone mobile plugin is not installed on that agent.

Cloud authentication state and agent cookies stay in the native layer. The
React runtime receives only account status, trimmed org/agent discovery data,
opaque connection IDs, and short-lived request results.

## Existing Hermes Seams

The current Hermes checkout already provides:

- Dashboard plugin discovery through `dashboard/manifest.json`.
- Plugin Python API modules exposing a FastAPI `APIRouter`.
- Automatic mounting under `/api/plugins/<plugin-name>/`.
- Plugin static assets under `/dashboard-plugins/<plugin-name>/`.
- Dashboard authentication for plugin HTTP routes.
- Canonical WebSocket authentication through
  `hermes_cli.web_server._ws_auth_ok`.
- Canonical WebSocket host/origin validation through
  `hermes_cli.web_server._ws_request_is_allowed`.
- TUI gateway dispatch through `tui_gateway.server.dispatch`.
- Per-connection gateway output through `tui_gateway.ws.WSTransport`.
- Session, tool, LLM, subagent, gateway, and approval lifecycle plugin hooks.

The initial plugin may use the dispatcher and WebSocket transport through one
isolated compatibility adapter. It must not scatter private Hermes imports
through business logic.

## Supported-Interface Boundary

The current public plugin interface does not provide:

- `register_gateway_method`.
- A global gateway event subscription.
- A public live-session snapshot including pending input.
- Public clarify, sudo, or secret lifecycle hooks.
- A cross-process active-run registry.

Version 0 therefore guarantees complete live behavior only for sessions created
or attached through the mobile plugin.

Other Hermes sessions may be shown from durable history. They become
plugin-owned for live synchronization only after an explicit attach or resume
through the mobile server.

## Security Invariants

1. Long-lived credentials must not appear in URLs, application logs, crash
   reports, local analytics, or transcript storage.
2. WebSocket connections must use the canonical Hermes authentication gate.
3. WebSocket connections must use the canonical Hermes request/origin guard.
4. Browser clients use fresh single-use WebSocket tickets where required.
5. Android long-lived credentials remain behind the native bridge.
6. Every persisted client value is scoped by connection ID.
7. Every live run carries connection, profile, runtime session, and stored
   session identity.
8. A client-generated mutation ID is idempotent. Reuse with different semantics
   is a conflict.
9. Secret and sudo values are never journaled or replayed.
10. Offline prompts remain drafts and are never automatically sent when an
    arbitrary connection returns.
11. Unsupported Hermes versions fail closed for mutating operations.
12. Static plugin assets may be public, but all state-bearing API routes remain
    authenticated.

## Version 1 Contract Shape

HTTP:

```text
GET  /api/plugins/hermes-mobile/v1/capabilities
GET  /api/plugins/hermes-mobile/v1/health
GET  /api/plugins/hermes-mobile/v1/snapshot
GET  /api/plugins/hermes-mobile/v1/profiles
GET  /api/plugins/hermes-mobile/v1/sessions
POST /api/plugins/hermes-mobile/v1/ws-ticket
```

WebSocket:

```text
WS /api/plugins/hermes-mobile/v1/gateway
```

The gateway accepts ordinary Hermes JSON-RPC requests and emits ordinary Hermes
responses/events, augmented with a versioned mobile envelope where required for
replay and reconciliation.

Initial capability response:

```json
{
  "contract_version": 1,
  "plugin_version": "0.1.0",
  "hermes_version": "unknown",
  "status": "compatible",
  "features": {
    "profiles": true,
    "stored_sessions": true,
    "live_sessions": true,
    "projects": false,
    "revisioned_events": true,
    "recoverable_approval": false,
    "recoverable_clarification": false,
    "recoverable_sudo": false,
    "recoverable_secret": false,
    "attachments": false,
    "device_pairing": false,
    "push_notifications": false
  }
}
```

## Identity Model

The project must not collapse these identities:

```text
connection_id
profile_name
project_id
runtime_session_id
stored_session_id
turn_id
pending_input_id
client_request_id
event_sequence
```

Durable navigation uses stored session identity. Live streaming uses runtime
session identity. All persisted UI state includes connection ID and profile.

## Repository Layout

```text
hermes-mobile/
  PLAN.md
  STATUS.md
  README.md
  LICENSE
  package.json
  package-lock.json

  server-plugin/
    plugin.yaml
    __init__.py
    mobile_server/
      __init__.py
      contract.py
      compatibility.py
      auth.py
      gateway.py
      journal.py
      sessions.py
      storage.py
    dashboard/
      manifest.json
      plugin_api.py
      dist/

  client/
    index.html
    package.json
    tsconfig.json
    vite.config.ts
    capacitor.config.ts
    src/
      main.tsx
      app/
      components/
      screens/
      state/
      transport/
      protocol/
      styles/
    android/

  tests/
    server/
    contract/
```

## Milestones

### Milestone 0: Durable project scaffold

Current milestone: complete

Acceptance:

- [x] Create this durable plan.
- [x] Create `STATUS.md`.
- [x] Initialize the standalone Git repository.
- [x] Add root package metadata and ignore rules.
- [x] Add README with project boundary and development instructions.
- [x] Record the initial Hermes compatibility target.
- [x] Prepare the private `helix4u/hermes-mobile` repository with a
      credential-safe agent install contract, Windows host onboarding, and
      focused client/server CI.

### Milestone 1: Server plugin skeleton

Acceptance:

- [x] Add `plugin.yaml`.
- [x] Add hidden dashboard manifest.
- [x] Add FastAPI router under `dashboard/plugin_api.py`.
- [x] Add authenticated health endpoint.
- [x] Add versioned capabilities endpoint.
- [x] Add compatibility probe for required Hermes symbols.
- [x] Add focused Python tests without the Hermes test suite.
- [x] Prove installation from a user plugin directory.
- [x] Prove the plugin loads under `hermes serve`.

### Milestone 2: Authenticated mobile WebSocket

Acceptance:

- [x] Add `/v1/gateway` WebSocket route.
- [x] Delegate authentication to the canonical Hermes WebSocket gate.
- [x] Delegate request/origin validation to the canonical Hermes guard.
- [x] Add a transport adapter around the Hermes WebSocket transport.
- [x] Dispatch ordinary Hermes JSON-RPC requests through the real dispatcher.
- [x] Emit gateway readiness and separate mobile capability metadata.
- [x] Reject malformed requests without terminating unrelated sessions.
- [x] Close unauthorized clients with a policy/auth close code.
- [ ] Add remaining behavior tests for request validation and disconnect.

### Milestone 3: Revisioned event journal

Acceptance:

- [ ] Add plugin-owned SQLite storage.
- [ ] Allocate monotonically increasing event sequences.
- [ ] Persist replayable non-secret events.
- [ ] Never persist sudo or secret values.
- [ ] Add snapshot watermark.
- [ ] Add replay from a client cursor.
- [ ] Return explicit `complete`, `gap`, or `reset` recovery outcomes.
- [ ] Add idempotent mutation receipts.
- [ ] Add bounded retention and cleanup.
- [ ] Add restart recovery tests.

### Milestone 4: Browser client vertical slice

Acceptance:

- [x] Create React/Vite application.
- [x] Add connection configuration stored by connection ID.
- [ ] Add separate HTTP and WebSocket health state.
- [x] Load server capabilities.
- [x] Connect to the plugin WebSocket.
- [x] List durable sessions.
- [x] Hold new-session content as a local draft.
- [x] Call `session.create` only on first send.
- [x] Resume an existing session.
- [x] Render streamed assistant text.
- [x] Render basic tool activity.
- [x] Stop an active turn.
- [x] Reconnect without creating a duplicate live runtime.
- [x] Restore unsent local drafts.
- [ ] Add client unit tests for identity and reconciliation.

### Milestone 5: Capacitor Android host

Acceptance:

- [x] Add Capacitor configuration and Android project.
- [x] Define native HTTP bridge interface.
- [x] Define native WebSocket bridge interface.
- [x] Keep long-lived credentials out of JavaScript persistence.
- [x] Add Android Keystore-backed credential storage.
- [x] Add direct HTTPS connection setup.
- [x] Add Tailnet-labelled connection setup.
- [x] Prove REST and WebSocket legs independently.
- [x] Add native Nous portal authentication.
- [x] Add organization and Cloud agent discovery.
- [x] Add silent per-agent sign-in with an isolated native cookie jar.
- [x] Connect Cloud agents through the existing core Hermes gateway when the
      mobile plugin is unavailable.
- [x] Keep portal and per-agent credentials outside JavaScript persistence.
- [x] Add Android foreground lifecycle detection, an application-level
      connection probe, bounded foreground retry, and durable-session
      reattachment.
- [x] Keep active native WebSockets owned by a non-exported Android foreground
      `remoteMessaging` service with an ongoing connection notification and a
      partial wake lock, so the CPU and socket stay active while the screen is
      off or the app is backgrounded.
- [ ] Test background and foreground reconciliation.
- [x] Produce a locally installable debug APK.

### Milestone 5B: Usable mobile control surface

Current milestone: implementation complete, physical-device acceptance pending

This milestone turns the proven connection vertical slice into the daily-use
client. It uses the existing Hermes gateway contract and remains entirely in
this side project.

Acceptance:

- [x] Replace the always-visible setup form with a compact connection status
      control and an on-demand connection sheet.
- [x] Add phone-first Chat, Sessions, and Control navigation.
- [x] Hydrate resumed sessions through `session.history`.
- [x] Render user and assistant messages as safe GitHub-flavored Markdown with
      headings, lists, task lists, tables, links, images, blockquotes, inline
      code, and copyable fenced code blocks.
- [x] Render assistant reasoning in a collapsed disclosure.
- [x] Render full normal tool arguments, progress, result, summary, duration,
      risk notices, and inline diffs.
- [x] Redact secret-like keys in client-rendered tool payloads and never retain
      sudo or secret responses in transcript state.
- [x] Add approval, clarification, sudo, and secret response cards for live
      requests.
- [x] Load the slash-command catalog and typed completions.
- [x] Route slash commands through `slash.exec` with
      `command.dispatch` fallback and submit send/skill directives as prompts.
- [x] Add a model picker backed by `model.options` and `config.set`.
- [x] Add common reasoning, fast-mode, approval-mode, and detail controls
      through the gateway config RPCs.
- [x] Put the full config view and dotpath editor behind an Advanced
      disclosure.
- [x] Add cron list, create, pause, resume, and remove controls through
      `cron.manage`.
- [x] Add toolset visibility and enable/disable controls through
      `tools.list` and `tools.configure`.
- [x] Add phone microphone capture and transcribe recordings through the
      authenticated Hermes `/api/audio/transcribe` path.
- [x] Add per-response read-aloud, stop playback, and optional auto-speak
      through the authenticated Hermes `/api/audio/speak` path.
- [x] Keep captured audio ephemeral and remove temporary native recordings
      immediately after transfer.
- [x] Add focused reducer, command-routing, and control-surface tests.
- [x] Produce and validate a replacement Android debug APK.
- [x] Keep each direct, Tailnet, and Cloud host as a separate saved connection
      with its own stable Android Keystore credential association.
- [x] Render useful Cloud availability state when the Portal omits or returns
      `unknown` gateway metadata.
- [x] Keep live tool rows readable before details arrive and consume Hermes's
      canonical `args_text` and `result_text` event fields.
- [x] Preserve complete reasoning Markdown chunks as separate blocks.
- [x] Browse and search sessions by Hermes project, repository lane, cwd,
      branch, source, and model.
- [x] Apply the connected Hermes host's active skin and live skin changes only
      through an explicit read-only Follow host choice.
- [x] Auto-size the composer textarea so multiline drafts remain fully visible
      without oversized or vertically clipped text.
- [x] Replace the in-app lettermark, empty-state branding, favicon, and Android
      legacy, round, and adaptive launcher icons with the exact Nous girl asset
      used by the support website.
- [x] Keep the polished Hermes Mobile palette as the default and make host-skin
      projection an explicit per-connection opt-in.
- [x] Add connection-scoped mobile-only Nous, Midnight, Ember, Mono, Cyberpunk,
      and Slate palettes matching Hermes Desktop without writing `display.skin`
      or any other theme setting to the host.
- [x] Keep mobile appearance available while disconnected, reject empty host
      skin payloads, and bind cached host skin data to the connection that
      emitted it so a switch cannot repaint from stale connection state.
- [x] Preserve live tool arguments and results across foreground rehydration,
      and render durable summary-only tool rows as labeled content instead of
      empty disclosure bars.
- [x] Give each native WebSocket dial a unique generation identity so delayed
      close/failure events from a backgrounded socket cannot terminate its
      replacement.
- [x] Carry socket identity through the JSON-RPC connection lifecycle, cancel
      native dials closed during asynchronous listener/ticket setup, and make
      native foreground-service leases idempotent so delayed callbacks cannot
      create orphan sockets or service start/stop churn.
- [x] Use the Android app lifecycle as the sole native foreground authority,
      probe only on a real inactive-to-active transition, require two failed
      probes before replacing an open-looking socket, and isolate reconnect
      work by connection generation.
- [x] Contain foreground-service promotion and wake-lock failures inside the
      service instead of allowing a runtime exception to close the activity.
- [x] Suppress expected background WebSocket failure banners while retaining
      bounded foreground recovery and actionable foreground errors.
- [x] Align the composer and five-item bottom navigation at phone breakpoints.
- [x] Split normal TTS into bounded sequential chunks so long replies do not
      exceed provider request limits.
- [x] Add connection-scoped normal TTS provider, voice, and speed selection for
      per-response Listen and automatic reply playback.
- [x] Add a multivoice Reader with script parsing, smart speaker assignment,
      per-speaker provider/voice selection, and active-block playback.
- [x] Add an authenticated remote file browser for directory navigation,
      text-file preview, and explicit spot edits through Hermes's existing
      remote-safe filesystem API.
- [x] Give the remote file browser one explicit touch-enabled vertical scroll
      container below the fixed heading and path bar, including contained
      scrolling for long text-file editors.
- [x] Constrain Reader cards, speaker labels, voice selectors, prose, and
      unbroken tokens to the phone viewport with readable wrapping.
- [x] Add a connection-scoped Reader buffer-ahead control matching Desktop's
      default of 3 and supported range of 0 through 6, with ordered speculative
      synthesis and one active retry after a failed prefetch.
- [x] Fall back from a failed Reader voice through alternate selected
      providers and voices, then the host default. Fall back from a failed
      normal Listen voice to the host default.
- [x] Add Copy controls with visible copied feedback to every completed chat
      message while retaining the assistant Listen control.
- [x] Ignore transient `thinking.delta` spinner presentation, open real live
      reasoning content, consume tool-generation and common payload aliases,
      suppress Markdown presentation rules, and show an explicit explanation
      when durable history did not retain a tool payload.
- [x] Auto-scroll Reader to the active speaker block, release follow mode when
      the user manually scrolls, expose Resume follow, and allow playback to
      start or restart from any selected block.
- [x] Buffer normal long-form Listen and auto-speak chunks with the same
      lookahead queue used by Reader so the next chunk synthesizes while the
      current chunk plays.
- [x] Reconcile `message.interim` with `message.complete` by sealing streamed
      interim rows and settling matching, prefix-continuing, or explicitly
      previewed finals in place, while retaining genuinely distinct pre-tool
      commentary.
- [x] Fold id-less tool-generation notices into their stable tool lifecycle,
      preserve rich completed live tool payloads through foreground/history
      hydration, and keep same-session selection from replacing those payloads
      with summary-only durable rows.
- [x] Bind tool-card presentation to Hermes `details_mode`: expanded opens full
      scrollable detail regions, collapsed keeps tap-to-expand inspection, and
      hidden retains a labeled status card without exposing input or output.
- [x] Keep collapsed tool cards as readable status plus progress/input/output
      previews instead of reducing them to anonymous bars, and retain id-less
      completed tool rows after final-answer settlement.
- [x] Keep every transcript row at its intrinsic height so growing live
      reasoning cannot flex-shrink expanded tool cards into clipped slivers;
      the transcript viewport owns vertical overflow and scrolling.
- [x] Promote the Android connection service immediately when it is created and
      reconcile socket leases against process-wide requested state, so a fast
      release cannot overtake a pending retain and crash the app with
      `ForegroundServiceDidNotStartInTimeException`.
- [x] Re-promote the Android connection service on every retain, keep it
      foreground until actual destruction, and make idle stops start-ID-safe so
      a reconnect cannot land on a live-but-demoted service instance and miss
      Android's foreground-service deadline.
- [x] Disable Capacitor native callback payload logging, keep the primary
      WebView renderer at important priority while backgrounded, and recover
      both the application and sign-in WebViews through
      `onRenderProcessGone()` instead of allowing renderer eviction to kill the
      application process.
- [x] Replace per-chunk smooth transcript scrolling with layout-phase instant
      follow that releases when the user scrolls up and resumes near the
      bottom or on an explicit new send.
- [x] Order late reasoning and tool lifecycle events before the current turn's
      final assistant response instead of appending them below the answer.
- [x] Canonicalize already-present live reasoning and tool rows on completion and
      lifecycle updates so a misplaced row is repaired immediately rather than
      only after navigation-triggered history rehydration.
- [x] Seal a live reasoning segment when tool activity begins so thinking that
      resumes after the tool renders as a new inline block instead of mutating
      the earlier pre-tool block.
- [x] Probe direct/Tailnet Android hosts for canonical gateway authentication,
      open the host's protected sign-in flow when `auth_required` is advertised,
      and validate saved sessions with one-use WebSocket tickets.
- [x] Fall back from a missing Mobile capability route to the standard core
      gateway for direct Docker hosts while keeping installed plugin errors
      fail-closed.

### Milestone 5C: Local custom TTS lab

Current milestone: implementation complete, Desktop acceptance pending

This milestone keeps experimental speech providers in the standalone Mobile
plugin while widening the generic Hermes TTS provider contract just enough for
every client surface to discover provider capabilities, voices, and reusable
voice operations.

Acceptance:

- [x] Add local Kokoro and F5-TTS adapters using their existing loopback
      services and real voice catalogs.
- [x] Add an isolated Qwen3-TTS service with its own Python 3.12 environment,
      CUDA PyTorch runtime, loopback-only authenticated API, scheduled task,
      and provider-owned voice store.
- [x] Support reusable Qwen voice clones from reference audio and optional
      transcripts.
- [x] Support instruction-driven Qwen VoiceDesign references that become
      reusable clone prompts for normal synthesis.
- [x] Add generic provider capability, voice, model, voice-create, and
      voice-delete endpoints without Qwen-specific branches in Hermes core.
- [x] Expose custom providers and their dynamic voices in Desktop Voice
      settings, Reader, Pet speech, Mobile normal TTS, and Mobile Reader.
- [x] Render Mobile provider voices in a native select control rather than an
      Android WebView datalist, merging partial built-in live catalogs with the
      complete bundled choices while keeping custom catalogs provider-owned.
- [x] Add a generic Mobile custom-voice library for reference-audio cloning,
      instruction-based design, language, transcript/sample text, immediate
      selection of a created voice, and deletion where the provider allows it.
- [x] Keep reference audio ephemeral in Mobile and give long-running native
      voice-creation requests a bounded 15-minute timeout.
- [x] Keep plugin-provider voice, model, language, and instruction overrides
      provider-scoped so a stale root voice from another provider cannot leak
      into F5-TTS or Qwen preview and playback requests.
- [x] Add Desktop clone/design controls for reference audio, transcript,
      language, instruction, reusable voice selection, and deletion.
- [x] Prove Qwen clone creation, instruction-driven voice design, synthesis,
      and deletion through the authenticated Hermes API on the local RTX
      3080 Ti.
- [x] Package the regular Desktop shortcut target with the custom-provider UI
      and verify a backend-ready launch from `Hermes.lnk`.

### Milestone 5D: Cross-platform mobile host deployment

Current milestone: implementation and macOS host verification complete,
physical Android acceptance pending

Acceptance:

- [x] Preserve the Windows Scheduled Task deployment and its protected
      credential contract.
- [x] Add a guarded macOS launchd user-agent deployment.
- [x] Add a guarded Linux user-systemd deployment.
- [x] Use the same loopback-only Hermes backend, host-validating proxy, and
      tailnet-only Tailscale Serve topology on every platform.
- [x] Refuse to replace unrelated plugin links, native services, or Tailscale
      Serve configuration.
- [x] Add cross-platform status and explicit credential-display commands.
- [x] Add focused tests for token permissions, Tailscale identity, and native
      service definitions.
- [x] Install the macOS launchd service and verify authenticated HTTPS and WSS
      through its real Tailscale MagicDNS endpoint.
- [ ] Connect through the physical Android tailnet peer.

### Milestone 6: Profiles, projects, and recoverable attention

Acceptance:

- [ ] Add explicit profile selection.
- [ ] Resolve profile-scoped session databases.
- [ ] Implement profile-correct project browsing in the plugin.
- [ ] Add active-run snapshot for plugin-owned sessions.
- [ ] Add stable approval request identities.
- [ ] Add approval replay and idempotent response.
- [ ] Add clarification recovery.
- [ ] Add sudo request recovery without persisting values.
- [ ] Add secret request recovery without persisting values.
- [ ] Keep external live sessions visibly best-effort until attached.

### Milestone 7: Same-origin PWA

Acceptance:

- [ ] Produce a web manifest and installable build.
- [ ] Copy the web build into the server plugin assets.
- [ ] Use same-origin browser authentication.
- [ ] Use hash routing or an explicit plugin asset fallback.
- [ ] Validate service-worker scope beneath the plugin asset path.
- [ ] Validate phone and tablet layouts.
- [ ] Validate the client through both `hermes dashboard` and `hermes serve`.

### Milestone 8: Production extensions

Acceptance:

- [ ] Add an explicit Android assistant-role request and a lightweight
      `ACTION_ASSIST` entry that opens Hermes Mobile into a voice-ready composer
      on the current saved connection.
- [ ] Evaluate a full `VoiceInteractionService` only after the lightweight
      assistant entry is proven, keeping the always-running service isolated
      from the heavy WebView and agent UI.
- [ ] Add AccessibilityService integration only for a concrete assistive,
      user-triggered workflow with separately disclosed window-content access;
      do not use broad always-on accessibility observation as a generic
      automation shortcut.
- [ ] Device pairing.
- [ ] Separately revocable device credentials.
- [ ] Server-derived authorization grants.
- [ ] Device inventory and revocation.
- [ ] Push registration.
- [ ] FCM or relay delivery.
- [ ] Deep links.
- [ ] Notification content redaction.
- [ ] Compatibility migration.
- [ ] Accessibility audit.
- [ ] Android process-death testing.

## Validation Policy

- Do not run the Hermes Python test suite from the dirty primary checkout.
- Do not run broad or full pytest.
- Server-plugin tests should run in this independent project and use narrow,
  explicit test paths.
- Client tests should use Vitest with explicit files or the project test script.
- TypeScript must pass `tsc --noEmit`.
- Production client builds must pass Vite.
- Python files must compile.
- Run `git diff --check` before milestone handoff.
- Real Hermes integration tests must use the Windows/AppData Hermes checkout and
  runtime when operational verification is requested.
- Never overwrite or reset the dirty Hermes checkout.

## Compatibility Strategy

The server plugin owns a compatibility report:

```text
compatible
degraded
incompatible
```

Private Hermes imports are allowed only inside `mobile_server/compatibility.py`
or versioned adapter modules. Every required private symbol is probed at startup.

Safe read-only features may remain available in degraded mode. Mutating features
must fail closed if their required contract cannot be proved.

The first supported target is the Hermes revision recorded at the top of this
document. New Hermes versions are added by compatibility probes and focused
integration tests, not by optimistic version ranges.

## Current Risks

1. The Hermes gateway dispatcher and WebSocket transport are not formal public
   plugin APIs.
2. The public hooks do not cover clarification, sudo, and secret lifecycle.
3. Cross-process live-run observation is incomplete.
4. Project RPCs in current Hermes are not consistently parameterized by profile.
5. Native OAuth handoff is more complex than browser same-origin auth.
6. Android native WebSocket support requires a custom bridge.
7. A service worker hosted beneath a plugin asset route needs careful scope and
   fallback handling.

## Current Next Action

Install the newly rebuilt Windows debug APK in place with app data preserved,
then confirm that thinking renders in separate inline blocks around an
intervening tool call. Also confirm that an already-streaming thinking or tool
block moves above the final assistant response without navigating away.

The Windows consolidation used private branch
`origin/codex/fix-live-transcript-order` at
`acc940c58a1605b04312d1acfdedc9ab6277e691`, four commits ahead of private
`origin/main` at `f58d77e0424f25262ca7c9fa75fd86a5e4dd31c7`. The consolidated
tree passed 100 client tests, 19 focused server tests (14 passed and 5
platform-specific skips on Windows), TypeScript typecheck, Python compile, and
Android `assembleDebug` with Android Studio JDK 21.

When a Docker cloud instance is available, add its trusted HTTPS dashboard URL
as Direct HTTPS. Confirm `/api/health` discovery opens the host's password/OAuth
sign-in, the core gateway connects without the Mobile plugin, and an installed
but incompatible plugin still surfaces its compatibility error.

Then use the physical Android tailnet peer to connect through the verified macOS
HTTPS MagicDNS address. Open Control, then Voice, and select Qwen3-TTS,
F5-TTS, or Kokoro. The Voice field should be a real picker populated by the
provider catalog. With Qwen selected, use Custom voice library to create a
clone from phone reference audio or a design from written instructions. The
created voice should become selected immediately and remain available in
normal Voice and Reader.

Continue the Desktop acceptance pass from the regular `Hermes.lnk` shortcut:
preview the existing saved Qwen voice and an F5-TTS voice, and confirm the
saved voice remains available in normal Voice, Reader, and Pet selectors.

No immediate phone action is required. The foreground-service reconnect crash
captured after the overnight idle period remains fixed in the repository, and
the previous replacement mobile build remains installed without requiring an
interactive phone pass right now.

Latest rebuilt repository debug APK (contains the transcript interleaving,
late-event reconciliation, direct-auth, and core-gateway fallback changes):

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `5,496,505` bytes

SHA-256:
`6B35AA0544DF91D13ED2C8FB377A5FE0A762C071257DC0A3579BE89D458DBE3C`

The saved-connection, Cloud status, tool/reasoning, project/cwd, theme,
multiline composer, Nous girl branding, focus-loss recovery, long TTS, normal
voice selection, multivoice Reader, Reader wrapping and buffering, automatic
voice fallbacks, per-message Copy controls, and remote file browser work is
implemented. Native connections now remain under an Android foreground service
and partial wake lock. Interim/final answers now reconcile without duplicate
bubbles, and live tool details remain rich across completion and rehydration.
Expanded, collapsed, and hidden tool modes now control full scrollable cards
instead of degrading them into presentation lines. Collapsed mode now retains a
substantial readable card with tool identity, status, and bounded
progress/input/output previews before tap-to-expand. An id-less
`tool.complete` is also authoritative, so final-answer settlement cannot
discard its payload as a provisional generation notice. Reconnects now use one
native lifecycle signal, one connection-generation-scoped coordinator, and two
failed application probes before replacing an open-looking socket. Replaced or
cancelled dials cannot publish late state, finish opening, leak listener
handles, or churn foreground-service leases. Foreground-service runtime
failures are contained instead of escaping through the activity process.
Transcript rows now retain their intrinsic height while live reasoning grows,
so tool cards remain readable and the transcript scrolls instead of compressing
them. Transcript follow now uses an immediate layout correction instead of
restarting a smooth animation for every streamed chunk, releases when the user
scrolls upward, and resumes when the user returns near the bottom or submits a
new prompt. Late reasoning and tool events are inserted before the turn's final
assistant response, so network arrival order cannot place thinking beneath the
answer. Mobile appearance is now entirely client-local: the picker offers the
polished mobile palette and the six built-in Desktop palettes, while Follow host
only consumes host skin events. The old host-mutating skin selector and its
`config.set skin` call are gone. The focused client suite, typecheck, Vite build,
Capacitor sync, Android debug build, APK manifest inspection, and 360 by 800
visual checks pass.

Exercise the lifecycle path first:

1. Connect through the direct/Tailnet target, select an existing session,
   switch to another Android app for at least 30 seconds, and return. Confirm
   the ongoing Hermes connection notification remains visible.
2. Turn the screen off for at least 60 seconds during a tool-heavy turn, turn
   it back on, and confirm the same socket/session continued streaming without
   a Gateway WebSocket error.
3. Repeat after remaining away for more than the Hermes orphan grace window.
   The app must reconnect and reattach the same durable session rather than
   create a new chat.
4. Repeat with a Hermes Cloud agent.
5. Confirm the app can send the next prompt after each return without manually
   opening the connection sheet.

Then finish the remaining Milestone 5B physical checks:

1. Switch between a saved Tailnet host and a Cloud agent, confirming that each
   host retains its own identity and credential. A connection first saved by
   the older singleton build may require its URL to be entered once; when there
   is one orphaned Android Keystore credential, the new app recovers and
   re-associates it without exposing the token to JavaScript.
2. Confirm Cloud cards show useful availability text rather than `unknown`.
3. Confirm live tool arguments, progress, results, and reasoning Markdown are
   readable without placeholder lines before and after the final answer.
   Confirm expanded mode opens full independently scrollable details, collapsed
   mode keeps a readable status plus progress/input/output preview and opens
   full details on tap, hidden mode keeps a labeled card without payload, and a
   historical summary-only tool row clearly explains that its payload was not
   retained. Confirm an id-less completed tool remains after the final answer.
4. Browse and search sessions by project, cwd, branch, source, and model.
5. Change Mobile appearance among Hermes Mobile, Nous, Midnight, Ember, Mono,
   Cyberpunk, and Slate. Confirm each choice is retained separately for saved
   connections and does not change the theme on the Hermes host or any other
   surface. Select Follow host, then change the host skin elsewhere and confirm
   the phone follows the live event without writing host configuration.
6. Enter a multiline draft and confirm the composer grows without clipping.
7. Confirm the Nous girl appears in the app header and Android launcher.
8. Microphone permission, record/stop, and transcript insertion.
9. Select a normal TTS provider, voice, and speed, then confirm per-response
   Listen/Stop, automatic reply playback, and a reply longer than 1,800
   characters all play through.
10. Paste or import a multivoice script, assign speakers, and confirm Reader
    playback moves through the speaker blocks. Confirm long text and voice
    names remain inside the screen, buffer ahead defaults to 3, and a bad voice
    advances through fallbacks without reordering the script. Confirm playback
    follows the active block, a manual scroll pauses following, Resume follow
    reattaches it, and Start here begins at the selected block.
11. Play a regular response longer than one TTS chunk and confirm the next
    chunk is prepared during current playback without a synthesis pause between
    chunks.
12. Browse a remote project directory, preview a text file, make an explicit
    edit, and save it. Confirm long directories and long editor contents scroll
    without moving the path bar or bottom navigation.
13. Model/config/toolset/cron controls and rich live tool rendering.
14. Copy completed user, assistant, and event messages, confirming the full
    message lands on the Android clipboard and the button briefly says Copied.
15. Run a tool-using answer that emits interim text, and confirm an identical or
    continuing final answer settles into one response bubble while genuinely
    different pre-tool commentary remains separate.

The authenticated live host already passed a synthetic TTS-to-STT provider loop.
ADB confirmed that the reported tab-return exits were native
`ForegroundServiceDidNotStartInTimeException` crashes in
`HermesConnectionService`. The first replacement promoted the service in
`onCreate()` before lease reconciliation and was installed on the physical
phone. A subsequent device exit was traced separately to Android WebView
renderer eviction during long audio and large gateway callbacks. That
replacement avoids full callback logging, retains important renderer priority,
and recreates a terminated WebView.

The final scroll and event-order build installed at 2026-07-28 02:22:36 later
crashed at 08:59:48 after the app resumed from the overnight idle period. Android
recorded `ForegroundServiceDidNotStartInTimeException` for PID 17819. The old
socket had stopped foreground presentation while its service object still
existed; a reconnect reached `onStartCommand()` without rerunning `onCreate()`,
and the service never re-promoted before Android's five-second deadline. Reader
Play occurred during that deadline but did not throw the exception.

The service now promotes for every retain, retains foreground state until
`onDestroy()`, uses `stopSelfResult(startId)` so an older idle release cannot
stop a newer retain, and always enters through `startForegroundService()` to
avoid a teardown-time `serviceCreated` race. The first corrected APK installed
in place and remained alive beyond the deadline as PID 26645 with Android
reporting `isForeground=true`, notification ID 2201, and service type
`remoteMessaging`; no new crash entry appeared in that initial interval. The
repository build includes the final entry-point tightening above. Repeated
overnight/background and long-TTS acceptance remains useful during ordinary
future use, but is intentionally not blocking on an immediate user-driven test.
After the APK is proven on-device, resume Milestone 3's revisioned event journal,
snapshot watermark, replay, and idempotent mutation receipts.
