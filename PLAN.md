# Hermes Mobile Side Project Plan

Status: active

Last updated: 2026-07-30

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
- Provider credential setup, plugin administration, or billing.
- SSH tunneling.
- Full terminal emulation.
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

### Milestone 5E: Session workspace and mobile workspace parity

Current milestone: implementation complete, packaged acceptance pending

Acceptance:

- [x] Make the backend-owned session cwd visible and directly changeable from
      the Desktop status bar for both drafts and idle live sessions.
- [x] Keep the Desktop cwd selector on the same local/remote-aware project
      picker instead of adding another path authority.
- [x] Persist Mobile's preferred cwd per saved connection and pass it
      explicitly to `session.create`.
- [x] Adopt the authoritative cwd returned by `session.resume` and
      `session.cwd.set`.
- [x] Keep the Mobile cwd picker obvious in Chat and Control, with a
      touch-scrollable directory browser and editable absolute path.
- [x] Prevent Windows Scheduled Task and cross-platform host launches from
      supplying System32 or the plugin checkout as a detached session's
      accidental default cwd.
- [x] Add a schema-driven, searchable Mobile host-config surface backed by the
      authenticated deep-merge config API, while retaining the redacted raw
      diagnostic view.
- [x] Upgrade Mobile Files with a closeable document pane, Preview and Edit
      modes, explicit save/revert, use-current-folder-as-cwd, and Reader
      handoff.
- [x] Preserve one phone-owned vertical scroll path for large directories and
      independently scroll long preview/editor content.
- [x] Rebuild and verify the Windows Desktop shortcut target and Android debug
      APK.

### Milestone 5F: Android share routing and file downloads

Current milestone: implementation complete, physical-device acceptance pending

Acceptance:

- [x] Add a Download action to every file row and the open document pane.
- [x] Route browser downloads through the authenticated remote filesystem API.
- [x] Route Android downloads through the same authenticated endpoint and the
      system `ACTION_CREATE_DOCUMENT` picker, without exposing credentials to
      JavaScript or broad storage permissions.
- [x] Register Hermes Mobile as an Android share target for text, links, and
      individual images.
- [x] Copy a shared image immediately from its one-use content URI into bounded
      application cache, retain only non-secret metadata in JavaScript, and
      remove the temporary copy on cancel, success, replacement, or later
      orphan cleanup.
- [x] Keep shared content pending until the user explicitly confirms a
      destination and send action.
- [x] Let the user choose any saved remote target, then an existing session or
      a new conversation.
- [x] Give new shared conversations a remote directory picker for their exact
      session cwd without changing the connection's normal preferred cwd.
- [x] Send shared images through Hermes's existing `image.attach_bytes`
      gateway contract and ordinary prompt submission, with a synchronous
      double-send guard.
- [x] Add focused share-routing, sheet, workspace, and authenticated-download
      tests.
- [x] Validate the share sheet and stacked directory picker at 360 by 800 and
      rebuild the Android debug APK with packaged `ACTION_SEND` filters.

### Milestone 5G: Mobile Reader, preview, and media workspace

Current milestone: implementation complete, physical-device acceptance pending

Acceptance:

- [x] Remount Mobile Control on every tab entry and default every settings
      disclosure to collapsed without changing host configuration.
- [x] Reveal an opened Files preview immediately inside the existing
      touch-scroll viewport even when the file was selected from deep in a
      scrolled directory.
- [x] Turn Reader into a combined multivoice Reader and file Preview/Edit
      workspace with explicit surface tabs.
- [x] Support Markdown and plain-text preview, editing, save/revert, download,
      Open in Previewer, and Open in Reader from the shared document surface.
- [x] Add native image preview with a fit/actual-size full-screen viewer.
- [x] Add native audio and inline video playback for remote files and direct
      media links rendered from Markdown.
- [x] Resolve completed Hermes `MEDIA:` markers through the authenticated
      remote-safe filesystem route as inline image, audio, and video
      attachments; keep host paths out of the rendered transcript, clipboard,
      and TTS projection.
- [x] Add connection-scoped third-party rich-embed preferences matching
      Desktop's ask, always, and off modes without writing a host theme or
      config setting.
- [x] Reuse Reader's provider-aware synthesis and fallback chain to render the
      complete multivoice script into one mono WAV and save it through the
      browser download path or Android's system document picker.
- [x] Keep Reader controls, document actions, native media, rich-embed consent,
      and full-screen image viewing inside a 360 by 800 viewport.
- [x] Add focused preview, media, embed, Reader-render, settings-collapse, and
      file-reveal regression tests.
- [x] Rebuild and validate the Android debug APK.

### Milestone 5H: Mobile Alien Child pet companion

Current milestone: implementation complete, physical-device acceptance pending

Acceptance:

- [x] Bundle Alien Child's real animated spritesheet and full personality
      definition into the Mobile client so the default companion does not
      depend on the connected host's pet inventory.
- [x] Load every valid profile-scoped personality exposed by
      `pet.personality.list`, merge those local definitions with the built-in
      Alien Child entry, and hydrate the selected prompt and interaction lines
      through `pet.personality.get`.
- [x] Render the pet in a phone-sized walking lane above the composer using the
      real spritesheet geometry, directional walk rows, ragged frame counts,
      pixel-preserving canvas drawing, visibility-resume animation, and
      direction-owned travel legs. Non-locomotion poses remain stationary
      instead of gliding across the screen.
- [x] React to live busy, reasoning, tool, waiting-for-input, completion, and
      idle state without coupling the pet animation to the WebSocket lifecycle.
- [x] Add connection-scoped Mobile controls for visibility, roaming,
      personality, AI commentary, commentary speech, first-delay timing, and
      repeat cadence.
- [x] Expose the host-owned `auxiliary.pet_commentary` provider, model, and
      reasoning-effort assignment while keeping all visual pet preferences
      local to the phone.
- [x] Generate bounded context-aware comments through
      `pet.commentary.generate`, avoid recent repeats, show comments in a pet
      bubble, and optionally speak interactions, previews, and generated
      commentary during the turn through a dedicated pet speech profile.
- [x] Let Mobile either follow the active Desktop pet provider, voice, speed,
      pitch, and volume for that connection, or select an independent Mobile
      pet provider and voice without changing normal assistant TTS.
- [x] Add companion, progress, and tool observability lenses with bounded
      conversation turns, tool observations, recent-comment avoidance, and
      force-redacted tool evidence.
- [x] Record generated and click-interaction comments through
      `pet.commentary.record`, render live and durable commentary as distinct
      copyable/listenable transcript rows, and deduplicate repeated events.
- [x] Fail softly against hosts without the pet RPCs: keep the bundled Alien
      Child animation and click lines usable without surfacing reconnect
      errors or changing Hermes core.
- [x] Add focused pet preference, animation-state, context, durable-history,
      event-deduplication, settings-collapse, and transcript-rendering tests.
- [x] Validate the built-in sprite and Pet controls in a real 360 by 800 Chrome
      render, then rebuild the Android debug APK.

### Milestone 5I: Pet sidechat and reliable companion motion

Current milestone: implementation, Windows host refresh, Mobile send/observer
repair, and rest-window drag repair complete; replacement APK physical
acceptance pending

Acceptance:

- [x] Add one shared backend pet-sidechat contract used by Desktop and Mobile,
      with the selected personality and the active session supplied as bounded
      read-only context.
- [x] Keep sidechat messages outside the main Hermes transcript and model
      history, persist them against the durable session lineage, and clear them
      independently from ordinary pet commentary.
- [x] Give Desktop's in-window pet a full sidechat history/composer and explicit
      Send to Hermes action.
- [x] Give the popped-out Desktop pet a Hermes/Pet input target for both text and
      microphone input.
- [x] Give Mobile a pet-sidechat sheet with durable history, pet-targeted voice
      input, explicit Send to Hermes handoff, and pet-profile TTS playback.
- [x] Replace Mobile's fixed visible walking lane with a transparent draggable
      in-app overlay whose position is scoped to the saved connection.
- [x] Slow Mobile roaming, add short and long travel/rest variety, keep
      direction and running animation aligned, and preserve the rendered pixel
      when conversation state, visibility, tapping, or dragging interrupts a
      travel leg.
- [x] Resume roaming after app focus returns and after a tap or drag instead of
      leaving the pet frozen or snapping to a stale animation origin.
- [x] Keep commentary scheduling stable while transcript rows stream, and use a
      non-resetting tool/progress trigger so continuous events cannot starve the
      observer voice.
- [x] Make Windows host refresh retire only verified Mobile-owned backend and
      proxy listeners left behind by `Stop-ScheduledTask`, require both ports
      to be free, and require the replacement task plus both listeners to
      stabilize before reporting success.
- [x] Verify two consecutive Windows refreshes replace both process
      generations, register all pet sidechat methods, load durable sidechat
      history, generate Tool evidence commentary, and synthesize that comment
      through the configured Desktop-followed pet voice.
- [x] Track Mobile's active agent turn from prompt submission through the
      terminal `message.complete` event instead of reusing the short-lived
      request/setup busy flag, so auxiliary commentary timers remain alive
      throughout reasoning and tool execution.
- [x] Reattach the selected durable session when Mobile sidechat has lost its
      runtime identity, surface unavailable-session errors instead of silently
      returning, and give commentary and sidechat auxiliary requests bounded
      timeouts longer than the configured auxiliary-model window.
- [x] Hide Mobile's sidechat action by default, reveal it only after the user
      taps the pet, keep it available briefly, and isolate its pointer events
      from the draggable pet overlay.
- [x] Render Mobile pet commentary bubbles outside the transformed roaming
      overlay, clamp them to the live viewport with phone-safe margins, and
      wrap long text and unbroken tokens without clipping either screen edge,
      while leaving the pet itself touch-draggable and position-persistent.
- [x] Make the full pet hit area directly draggable without nested button
      semantics, recover cleanly from cancelled/lost pointer capture, persist
      every completed drag, and keep roaming above a seven-pixel-per-second
      movement floor.
- [x] Keep the pet overlay mounted above Chat, Sessions, Reader, Files, and
      Control instead of placing it inside Chat's hidden tab layout. Cancel and
      persist an active gesture on blur, page-hide, or backgrounding, then
      resume roaming from the rendered position when the app returns.
- [x] Route the revealed sidechat action through the pet's same tap-versus-drag
      gesture so the action cannot create a dead touch region after tab or app
      navigation.
- [x] Give sidechat its own full-conversation character prompt instead of the
      ambient one-line commentary prompt, preserve a cache-stable system and
      session-snapshot prefix, retain substantially more private history, and
      allow complete long-form replies.
- [x] Keep long sidechat replies intact in the private sheet while abbreviating
      only the temporary roaming bubble. Render durable pet remarks as small,
      muted, locally dismissible annotations instead of bright chat bubbles.
- [x] Replace Mobile's oversized modal sidechat sheet with a compact,
      non-blocking floating popout above the bottom navigation. Use a subdued
      scrollable conversation, theme-colored icon controls for microphone,
      send, clear, close, and Hermes handoff, and concise accessible labels
      without sacrificing full Markdown history or long replies.
- [x] Serialize distinct assistant, Reader, and pet speech requests above the
      existing chunk lookahead queue so newly queued audio waits without
      interrupting current playback. Keep explicit Stop and microphone capture
      authoritative by cancelling both current and waiting speech.
- [x] Probe the connected host's pet RPC bundle per saved connection. Keep the
      built-in Alien Child, tap lines, roaming, and host-default speech on
      vanilla/core-only hosts while hiding unsupported commentary, sidechat,
      host personality, and auxiliary-model controls without erasing the richer
      connection's saved preferences.
- [x] Portal the complete draggable pet stage into one fixed body-level overlay
      above every app tab, with the sidechat hit target capability-gated, so
      tab-specific stacking and scroll containers cannot make the sprite stop
      accepting direct touch drags.
- [x] Give Android finger dragging a native non-passive touch path with
      window-level move/end tracking instead of depending on React pointer
      capture. During roam rescheduling, freeze layout only when a real Web
      Animation is active so an effect cleanup cannot restore the pre-drag
      composited frame after the new coordinates were already persisted.
- [x] Commit every completed roam destination to the inline transform and
      remove its `fill: forwards` Web Animation before the rest window. A drag
      that begins while the pet is resting must update the rendered sprite as
      well as the saved connection-scoped coordinates.
- [x] Remount the complete pet overlay when the saved connection changes so a
      server swap cannot retain the prior host's animation, gesture listeners,
      or position refs. Preserve each connection's own persisted drop point.
- [x] Freeze interrupted roaming from the Web Animation timeline rather than a
      WebView-composited DOM rectangle, preventing reasoning/tool state changes
      from snapping the sprite to a stale frame during a turn.
- [x] Raise the roaming movement floor from seven to twelve pixels per second
      while retaining short walks, long walks, and varied rest windows.
- [x] Reject late pet commentary, sidechat, and Desktop speech-profile results
      from a previously selected server. Read the current pet speech profile
      when a response actually arrives and reapply the selected client playback
      rate through Android media readiness and playback events.
- [x] Fingerprint Mobile tool-observer evidence by lifecycle state plus bounded,
      redacted arguments and results instead of consuming a tool forever when
      its early name-only placeholder arrives. Wait for settled Tool-evidence
      rows and include concrete tool details in companion and sidechat context.
- [x] Pass focused and complete Mobile client tests, TypeScript typecheck, Vite
      production build, Capacitor sync, Android debug assembly, Desktop focused
      pet tests, Desktop typecheck, and Desktop packaging.

### Milestone 5J: Automatic Nous Cloud URL onboarding

Current milestone: implementation, APK installation, and physical Cloud
connection acceptance complete

Acceptance:

- [x] Recognize only secure subdomains of `agents.nousresearch.com` as Nous
      Cloud agent URLs, rejecting lookalike suffixes, HTTP, and user-info URLs.
- [x] Route a recognized URL through the existing native Nous Portal session
      instead of probing it as a Direct HTTPS Mobile-plugin host.
- [x] Open native Nous sign-in automatically when the Portal session is absent.
- [x] Discover the signed-in account's Cloud inventory and search each
      available organization for the exact agent hostname.
- [x] Trust and connect only the dashboard URL returned by authenticated
      account discovery, not the user-entered URL by itself.
- [x] Save the matched target as a stable Cloud connection and reuse the
      existing per-agent native cookie jar.
- [x] Use the standard Hermes core gateway when the Cloud agent does not have
      the Mobile server plugin installed.
- [x] Hide the irrelevant session-token field, label the automatic Nous path,
      and state directly that the Mobile plugin is not required.
- [x] Add focused URL, authentication, organization-discovery, account-match,
      and connection-sheet tests.
- [x] Pass the complete Mobile client suite, TypeScript typecheck, Vite
      production build, Capacitor sync, and Android debug assembly.
- [x] Recognize both `/api/health` and `/api/status` as standard core-gateway
      metadata so a Cloud deployment without the health route does not stop
      after successful Nous discovery with a misleading plugin 404.
- [x] Add explicit Edit and Delete actions for every saved connection. Keep
      authenticated Cloud endpoints read-only while editing their local name
      and profile, and remove Android Keystore credentials with deleted hosts.

### Milestone 5K: In-app remote server-plugin installation

Current milestone: implementation, APK installation, and Cloud upload complete;
Cloud host restart and plugin-route acceptance pending

Acceptance:

- [x] Bundle the standalone `server-plugin` source inside the Mobile client
      without build caches, credentials, local service tokens, or Git metadata.
- [x] Resolve the remote plugin directory only from the authenticated managed
      files policy, requiring a locked Hermes data root instead of guessing
      from a session cwd or user home.
- [x] Show the exact remote target, bundled byte count, source-file count, and
      host per-file limit before any mutation.
- [x] Require a separate explicit confirmation before upload and enablement.
- [x] Reject absolute, traversal, oversized, empty, or non-plugin target paths
      before sending bytes.
- [x] Upload through `/api/files/upload`, verify the exact returned path for
      every file, and keep discovery files last so an interrupted upload is
      not treated as a complete plugin.
- [x] Enable `hermes-mobile` only after every uploaded file is verified.
- [x] State that plugin API routes mount at host startup and require a host
      restart, without guessing at or invoking an unverified Cloud lifecycle
      control.
- [x] Keep standalone-plugin installation separate from Reader, speech, and
      filesystem routes owned by Hermes core, so an older host cannot present
      a plugin upload as a core-version upgrade.
- [x] Treat a missing generic TTS catalog as an explicit host capability gap:
      keep Listen, auto-speak, Reader playback, and podcast export on the
      host-default speech path without empty voice selectors or a 404 banner,
      while restoring full provider, voice, cloning, and multivoice controls
      automatically on connections whose host exposes the catalog.
- [x] Clear Reader-local failures when entering Reader or changing connections,
      accept native and browser missing-route error shapes including the core
      gateway's `No such API endpoint` response, and reconcile selected
      providers against the active host so a successful host-default fallback
      cannot retain a stale red catalog error.
- [x] Pass focused and complete Mobile client tests, TypeScript typecheck, Vite
      production build, Capacitor sync, Android debug assembly, and physical
      phone layout/remote-upload acceptance.
- [x] Upload and verify all bundled files at
      `/opt/data/plugins/hermes-mobile` on the authenticated `mr mid tier`
      Cloud host, then enable the plugin without exposing account cookies or
      credentials to JavaScript or captured output.
- [x] Treat an already-active compatible Mobile plugin as the terminal healthy
      state even when a local workstation intentionally exposes an unlocked
      file-browser policy. Skip the remote-upload preflight and never render
      its missing locked-root guard as an active-plugin error.

### Milestone 5L: Mobile Companion device foundation

Current milestone: implementation, build, installation, and physical Android
acceptance complete

This milestone turns the useful parts of the Burner Phone concept into a
privacy-bounded Hermes Mobile companion layer. Android remains authoritative
for protected device settings. Hermes adds visibility, explicit entry points,
and safe host-side discovery without copying prototype transport, security, or
automation shortcuts.

Phase 1, safe device foundation:

- [x] Add a native Android status contract for manufacturer/model, Android
      version and API level, battery/charging source, screen interactivity,
      network transport, connectivity, and validation.
- [x] Keep unique identifiers, serials, Android ID, MAC, SSID, IP addresses,
      installed applications, notification content, and location out of the
      status contract.
- [x] Add a collapsed Mobile companion section to Control that remains useful
      while disconnected and never writes host configuration.
- [x] Open Android's Wireless debugging screen when the device exposes it,
      falling back to Developer options or Settings without toggling protected
      state.
- [x] Add a checked-in PowerShell helper that discovers paired
      `_adb-tls-connect._tcp` services, refuses ambiguous devices, connects
      only the selected target, and verifies ADB's ready state.
- [x] Document that mDNS discovery is local-link only, that a Tailnet address
      does not make the rotating ADB port discoverable, and that the helper
      does not pair, scan ports, or bypass Android power policy.
- [x] Add focused presentation and disclosure tests, complete Mobile client
      tests, TypeScript typecheck, Vite production build, Capacitor sync, Java
      compilation, and Android debug assembly.
- [x] Install the replacement APK in place on the explicitly authorized
      Samsung device, open only Hermes Mobile and Android's debugging settings,
      verify the safe status fields and settings destination, then return to
      Hermes without changing a system toggle.

Phase 2, permissioned device events:

- [ ] Add a connection-independent device event journal for battery thresholds,
      charging changes, connectivity transitions, and foreground/background
      state with bounded retention and no unique identifiers.
- [ ] Feed user-selected device events into pet commentary and sidechat through
      a separate local capability lens, never into the main agent transcript by
      default.
- [ ] Evaluate an optional Android notification listener only behind a separate
      system-granted permission, source allowlist, on-device redaction, visible
      revocation, and content-off metadata mode.

Phase 3, stable plugin and action bridge:

- [ ] Expose device state through a service-gated `mobile_device` plugin tool
      or MCP surface so its schema is absent when no enrolled phone exists.
- [ ] Add an explicit device registry with separately revocable credentials,
      capability grants, last-seen state, and fail-closed mutation approval.
- [ ] Add user-triggered actions such as ring, speak, open a Hermes surface, or
      request a capture only after a per-action confirmation and audit record.

Phase 4, assistant and accessibility:

- [ ] Implement the existing lightweight `ACTION_ASSIST` plan so the Android
      assistant shortcut opens a voice-ready Hermes composer on the selected
      connection.
- [ ] Evaluate a lightweight `VoiceInteractionService` only after ACTION_ASSIST
      is reliable and keep it isolated from the heavy WebView process.
- [ ] Add AccessibilityService or MediaProjection only for a concrete
      user-triggered assistive workflow with separate Android consent, visible
      active state, bounded capture, and no ambient window observation.

Phase 5, presence and experimental interaction:

- [ ] Add explicit multi-device audio/presence routing on top of the existing
      serialized speech queue, with one active output owner and no surprise
      microphone capture.
- [ ] Add opt-in local journal and goal suggestions derived from redacted
      device events, with review before anything reaches Hermes memory.
- [ ] Keep gaze, face tracking, or camera-driven pet reactions experimental,
      foreground-only, and fully on-device until battery, privacy, and utility
      are proven.

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

The active-plugin-state replacement APK is installed in place on the authorized
Samsung SM-S918U. Android reports `lastUpdateTime=2026-07-30 14:12:09`;
`adb install -r` preserved the existing application data and Android Keystore
state. Open Control, Mobile server plugin and tap Check host on Workstation.
The card should report Mobile plugin 0.1.0 active and compatible without the
locked-root upload warning. Missing-plugin hosts still require an authoritative
locked managed root before Mobile offers upload.

Latest active-plugin-state replacement debug APK:

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `6,259,697` bytes

SHA-256:
`40CD687F2E57707828BC03EA31B7D61E47B1A7960D9B6A66A619E1397252061F`

Milestone 5L physical acceptance is complete. The replacement APK was installed
in place on the authorized Samsung SM-S918U with app data and Keystore state
preserved. Mobile companion reported Android 16/API 36, battery and wireless
charging state, validated VPN connectivity, and interactive screen state. Its
button opened Samsung's `DevelopmentSettingsActivity`; no setting was changed,
Back returned to the same Hermes Mobile process, Refresh completed, and the
foreground connection service remained active.

Next implementation work begins with Phase 2's bounded device-event journal for
battery, charging, connectivity, and app lifecycle changes. Keep notification
access separate and opt-in, and do not widen into assistant, accessibility,
MediaProjection, multi-device audio, journal, or gaze work until their explicit
phase and permission boundary is implemented.

Latest Mobile Companion foundation debug APK:

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `6,259,690` bytes

SHA-256:
`C2921DBC54D6305079FC981EBC2134B58ECF1F79AC5681604673755D500631FA`

The latest tool-evidence replacement APK is installed in place on the physical
Samsung SM-S918U with app data and Android Keystore state preserved. Run a turn
containing `terminal` and at least one other tool with Tool evidence selected.
Confirm Alien Child waits for completed or failed evidence, then comments from
the bounded, redacted command arguments and useful result instead of describing
a name-only `terminal` call or complaining that arguments are missing. Repeat
with Companion selected and in sidechat to confirm recent tool context also
carries its concrete details.

Then move Alien Child, switch between Workstation and another saved server, and
drag him immediately on each host to confirm each connection restores its own
position. During one long reasoning/tool turn, confirm state changes no longer
teleport him and every walking leg stays at or above the new
twelve-pixel-per-second floor. Set pet speech to 1.50x, allow a generated comment
or sidechat reply to finish after a server or speech-setting change, and confirm
playback remains at 1.50x instead of reverting to 1.00x.

Latest tool-evidence, server-swap, stable-motion, and pet-speed debug APK:

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `6,258,583` bytes

SHA-256:
`0B51134548282FF829D8E7004496855CD9343E15F827D89C0448CC49AC93F06F`

Android reports package `dev.hermes.mobile`, versionName 1.0, versionCode 1,
and `lastUpdateTime=2026-07-30 12:28:30` after the successful in-place install.

The newest pet-capability and cross-tab drag APK is installed in place on the
physical Samsung SM-S918U with saved connection and Keystore state preserved.
On `mr mid tier`, open Control, Pet companion and confirm it reports Alien Child
as visual-only on that host, does not show commentary, sidechat, host
personality, or auxiliary-model controls, and does not emit unknown-method
errors. Tap Alien Child and confirm his built-in line still appears; with pet
speech enabled, confirm it uses the same host-default TTS path as ordinary
Listen and Reader. Switch back to Workstation and confirm the full stored pet
personality, commentary, sidechat, auxiliary-model, Desktop-followed voice, and
custom voice controls return.

Drag Alien Child in Chat, Sessions, Reader, Files, and Control. Android finger
dragging now uses native touchstart plus window-level touchmove/touchend
tracking, and roam cleanup no longer restores a stale pre-drag composited
frame. The complete pet stage remains in one fixed body-level overlay above all
five views, so every visible part of the 72-pixel hit area should follow the
finger and remain draggable after tab changes. Sheets, toasts, sidechat, and
the image viewer remain above the pet while they are open.

Physical Android finger-drag acceptance passed on the installed Samsung build
after the native-touch and stale-composited-frame correction.

Latest native-touch pet drag and pet-capability debug APK:

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `6,257,869` bytes

SHA-256:
`7DE3818DDB382627B455E6279C818106907A5112141481AC9ED57ECB2EFCF16C`

The replacement APK is installed on the physical phone with saved Cloud state
preserved. Control, Mobile server plugin successfully authenticated to the
selected `mr mid tier` Cloud host, resolved its locked managed root, uploaded
and verified all 12 bundled source files at
`/opt/data/plugins/hermes-mobile`, and enabled `hermes-mobile`. No GitHub
credential, repository clone, session token, or account cookie was exposed.

Restart the Cloud Hermes host through its owning Cloud lifecycle control, then
reconnect and tap Check host. The section should report plugin `0.1.0` instead
of `core-gateway`. Reader, speech, or filesystem endpoints that still return
404 after that are core-version gaps and require a host Hermes update; the
standalone plugin does not pretend to replace those core routes.

The latest TTS-capability fallback APK is installed in place on the physical
Samsung SM-S918U with app data preserved. On the older `mr mid tier` Cloud
host, confirm Voice and Reader show Host default without a catalog 404, Reader
playback and Render & save use the host's configured speech provider, and
Smart assign is unavailable instead of silently doing nothing. Switch back to
the Windows workstation and confirm its full provider, voice, cloning, and
per-speaker controls return immediately.

Latest Reader stale-error cleanup debug APK:

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `6,256,579` bytes

SHA-256:
`38D68F10D1DCCF6EBC5EB7A60C8A831EC8873F8D875A0EAA74E73BF0DB8FE901`

Latest TTS-capability fallback debug APK:

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `6,256,467` bytes

SHA-256:
`FB1FB9BD46ED89CCC9A49EA06FE013A62A1F11BDB9E8C8E04AE97B94ED2EF493`

Latest in-app plugin-installer debug APK:

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `6,255,919` bytes

SHA-256:
`B92FB6DDA333DE85678FC3A34733B4AB24DB1B7F2A9C93327981FA95A772525C`

The Cloud core-gateway replacement APK is installed in place with app data
preserved. It relaunched, selected the already saved `mr mid tier` host, and
connected through the standard gateway after the Mobile capability 404. The
live UI reports `Connected to mr mid tier` and the Cloud session cwd `/opt/data`.

In Saved hosts, use Edit on a direct/Tailnet host and confirm its name, URL,
profile, and type can be changed before Save changes. Edit a Cloud host and
confirm its discovered URL and Cloud type stay read-only while name and profile
remain editable. Delete a disposable saved host, confirm the warning, and
verify the row, its local draft, and protected Android credential are removed
without affecting other saved hosts.

Latest automatic Nous Cloud onboarding debug APK:

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `6,243,953` bytes

SHA-256:
`FB0FDFB09215039187DD4E232E3E709850C104618EF82A58FA9A1E2F25FA5B24`

Latest Cloud core-gateway and saved-connection-management debug APK:

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `6,244,503` bytes

SHA-256:
`5694023CD5F416793FC6079904E7F343E271A1A3FA7981B3907D5CAB4F58C264`

Install the latest Mobile pet replacement APK in place with app data preserved.
Drag Alien Child directly from any visible part of his sprite in Chat, switch
to Sessions, Reader, Files, and Control, then return and drag him again. Switch
apps during another drag and confirm the cancelled gesture persists its last
position, the next drag starts normally, and roaming resumes without freezing
or teleporting. Reveal the sidechat star and confirm both tapping it and
starting a drag from it work. Let him roam after the drag and confirm short
legs no longer slow into a barely moving glide.

While one reply or pet comment is playing, queue another Listen, auto-speak,
Reader, or pet speech request. Confirm the current audio finishes normally and
the waiting request begins afterward. The existing lookahead should still
prepare later chunks inside each long response. Stop audio should immediately
end the current playback and discard everything waiting.

Open sidechat and hold a multi-turn conversation that asks for one substantial
answer. Confirm Alien Child stays in character, uses earlier sidechat turns and
the attached session as read-only background, and returns the complete answer
in the compact floating Markdown popout. Confirm the app behind the popout is
not covered by a full-screen dimmer, every icon control fits above the bottom
navigation, the mic changes to a stop-square while recording, thinking and
transcription status remain readable, and the full reply can still be handed
to Hermes. Only the temporary roaming bubble should be abbreviated.

Generate a few pet remarks in Chat. Confirm they appear as narrow, dim secondary
annotations rather than full assistant bubbles; Dismiss should hide an
individual remark for that saved connection without deleting the host's durable
record. Confirm the temporary roaming bubble is also smaller and muted while
remaining inside both screen edges.

Run a long tool-using turn with AI commentary enabled and Tool evidence or
Progress selected. Confirm commentary is generated and optionally spoken while
reasoning/tools are still running, then stops scheduling after the terminal
assistant response. This client repair does not require another host refresh;
the current Windows host already exposes and passes the sidechat, commentary,
custom auxiliary-model, and pet-speech paths.

Use the already relaunched Desktop shortcut and reopen Alien Child sidechat.
Confirm history loads without the `pet_sidechat_payload` error. Submit a
sidechat turn and run a tool-using turn with Tool evidence or Progress enabled.
Confirm both sidechat replies and observer commentary play audibly through the
configured pet provider, voice, pitch, and volume. The corrected renderer now
plays authenticated synthesized audio in Electron instead of asking the
headless backend process to find a host audio player.

Install the latest pet-sidechat replacement APK in place with app data
preserved. In Chat, drag Alien Child to a new position and confirm it persists
for that saved connection. Let him roam through short and long legs, tap or drag
him mid-walk, switch apps, and return. Confirm he continues from the rendered
position without teleporting, resumes roaming, and uses a directionally correct
running animation at the slower varied pace.

Open Alien Child's sidechat button, ask about the attached session by text and
pet mic, then leave and reopen the sheet. Confirm the private history remains,
the response can use the pet's independent/followed voice, and Send to Hermes
places the chosen response into the main composer without silently submitting
it. Run a long tool-using turn with Tool evidence or Progress commentary and
confirm the pet speaks during active work without needing a poke or Test button.

From the rebuilt Desktop shortcut, open the in-window pet sidechat and exercise
the popped-out pet's Hermes/Pet target toggle with both text and mic. Confirm
sidechat history follows the durable session, stays out of the main transcript,
and crosses into Hermes only through Send to Hermes.

Connect to the Windows host and open Control, Pet companion. Enable speech and
select Follow Desktop pet voice for this connection. Confirm the summary shows
the Desktop pet's xAI `orion` voice with speed 1, pitch +8.5, and volume 0.45.
Tap the pet and run a long tool-using turn. Confirm both click lines and
generated commentary use that pitch-bent voice while ordinary assistant Listen
keeps its own voice settings. Switch to Independent Mobile pet voice, choose a
different provider/voice, preview it, and confirm only pet speech changes.

Exercise Companion, Progress, and Tool evidence commentary lenses. Confirm
commentary can speak while generation is still active, Progress does not repeat
without a new observed lifecycle event, Tool evidence includes bounded useful
arguments/results without secret-like values, and Tool observations set to None
emits no tool evidence. Confirm the comments remain visible as transcript rows
after session resume and Copy/Listen work. Change the commentary
provider/model/reasoning effort and confirm the assignment is reflected by the
connected profile's `auxiliary.pet_commentary` configuration without changing
Mobile appearance settings on the host.

Latest pet sidechat, observer, and roam-fix debug APK:

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `6,240,222` bytes

SHA-256:
`825BAA03AD2BFD614C6D14BB90DD5781B467156CDB997647740A6C5C756F5F73`

Latest Mobile sidechat-send and active-turn observer replacement APK:

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `6,240,690` bytes

SHA-256:
`96A44F4E3306EB0E83DDDE145702C25A55AD398269E3AE6D10EB7E476EF3C7DE`

Latest Mobile viewport-safe pet-bubble replacement APK:

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `6,241,007` bytes

SHA-256:
`564AC4A6223A91F8055E03A4DE95C2E6E22A9FEA185A77D6C3D2DE3876AA8640`

Latest Mobile direct-drag, full-sidechat, and subdued-pet-dialogue replacement
APK:

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `6,242,183` bytes

SHA-256:
`C54ADCE422B10FA3AB5735E353320E4EB4E0B9C7DF1E60F2D40766A2FB1048C8`

Latest Mobile tab-stable pet drag and non-interrupting speech-queue replacement
APK:

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `6,242,429` bytes

SHA-256:
`879B0F677A53FDBECBC7732CC9C18536B0B7A3612A9F16B3AD7E1F7138F0FC82`

Latest Mobile compact pet-sidechat popout replacement APK:

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `6,243,115` bytes

SHA-256:
`4913A44D35BE23A1B611BCA52F87D5E1051054D52A7110ABD8002AA6C528935C`

The regular Desktop shortcut target was rebuilt with pet sidechat and the
Hermes/Pet popped-overlay input target. The packaged executable is
`214,281,216` bytes with SHA-256
`BF80330FC68B72AAC6A05F5E4A4A34E7E4B500F194B55C0E1EF7FD2554CD9AAF`.

Install the TTS-speed replacement APK in place with app data preserved. Under
Control, Voice, compare 0.70x, 1.00x, and 1.50x with an ordinary assistant
Listen button, auto-speak, and Reader. Confirm all three change playback speed
even with Host default, F5-TTS, or Qwen selected, and that pitch remains
natural. Interactive playback now applies speed in the client and removes it
from the matching synthesis request so a provider cannot ignore or double
apply the setting.

Install the proxy-timeout replacement APK in place with app data preserved,
then rerun the multivoice Render & save that previously stopped at 22 of 24.
The Windows Mobile host has already been refreshed with a 14-minute
route-specific upstream timeout for `/api/audio/*`; the Android/web speech
request now waits up to 8 minutes. Confirm the render advances past the former
30-second boundary and saves one complete WAV without a 500 from
`/api/audio/speak`.

Install the newly rebuilt Android debug APK in place with app data preserved.
Open the session from the reported screenshot or generate another image.
Confirm the completed assistant reply shows the image inline instead of a
literal `MEDIA:` path, tapping it opens the full-screen Fit/Actual-size viewer,
Copy includes only the generated filename, and Listen does not read the host
path aloud.

Open Control, expand any section, switch tabs, and return to Control. Confirm
every section is collapsed again. In Files, scroll deep into a directory and
open a Markdown or text file. Confirm the preview is brought into view
immediately, its filename and action buttons remain readable, Preview renders
the document, Edit can save and revert, Download opens Android's document
picker, and Open in Previewer/Open in Reader land on the correct Reader
surface.

Preview an image, audio file, and video file from Files. Confirm the image
opens a full-screen viewer with Fit/Actual size, and the native audio/video
controls play. Render a message containing a supported YouTube, Vimeo, or
Spotify link and confirm the default consent card waits for a tap. Change Rich
link embeds under Control, Appearance and confirm the choice is local to that
saved connection and does not modify the host.

Paste a multivoice script, assign speakers, tap Render & save, choose a
destination, and confirm the result is one playable WAV containing the full
script in order. Repeat ordinary Reader playback and confirm the collapsed
Voices & buffering section, voice fallbacks, active-block following, manual
scroll takeover, and Start here behavior still work.

Then continue the share/download acceptance pass. From a browser or another
Android app, share a link, a block of text, and one image to Hermes Mobile. For
each, confirm that nothing sends before the final button, switch between two
saved remote targets, choose an existing session, then repeat with New
conversation and its remote directory picker. Cancel one image share and
confirm returning to the app does not reopen it. In Files, download a text file
from its row and an open document, choose an Android save location, and confirm
the downloaded bytes match the host file.

Latest rebuilt repository debug APK:

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `5,241,609` bytes

SHA-256:
`63A3B391681F30A5CAF5BC8AA7675E3C37E5A33BB31AD79D4EF8FDF786E67241`

Then continue the existing workspace acceptance pass. Install the APK in place
with app data preserved.
Confirm that the Session cwd strip opens the remote directory picker, the
selection survives a new conversation and connection switch, and an idle live
session immediately adopts the selected path. In Files, open and close a text
document, switch Preview/Edit, save an explicit edit, use the current folder as
the session cwd, and open the document in Reader.

On Desktop, use the workspace status item from the regular shortcut to change a
draft and an idle live session. Confirm the item remains visible as Choose
workspace before a path is selected and keeps copy/reveal actions after the
backend returns the cwd.

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

The Mobile Companion replacement is now installed and physically accepted.
The foreground-service reconnect crash captured after the overnight idle
period remains fixed in the repository. Longer screen-off, long-output, and
provider-specific acceptance checks continue during ordinary use instead of
blocking this device-foundation milestone.

Previous repository debug APK (contained the transcript interleaving,
late-event reconciliation, direct-auth, core-gateway fallback, and workspace
changes before Milestone 5F):

`client\android\app\build\outputs\apk\debug\app-debug.apk`

Size: `5,496,505` bytes

SHA-256:
`0F65E4BDFA1E99121FE0A46BDF91CC02D2C5D5AFC0D718B9AA057DC5B5AF1CB9`

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
