# Hermes Mobile Current Plan

Status: active

Last updated: 2026-07-31

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

## Current work: Mobile pet personality catalog and host lifecycle

Acceptance contract:

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
- Rapid pet pokes use a replaceable speech lane: stale pending pokes collapse,
  a newer poke may supersede active poke speech, and ordinary reply, Reader,
  commentary, and sidechat speech remains serial and cannot be interrupted by
  a poke.
- Every adapted Hermes personality has multiple state reactions and at least
  four distinct poke lines instead of a single canned response.

## Near-term backlog

1. Complete physical-device acceptance for the personality picker/editor and
   Desktop-bound host lifecycle.
2. Continue ordinary-device acceptance for foreground lifecycle, long TTS,
   wake-word capture, and provider-specific behavior.
3. Finish the revisioned event journal and durable replay contract.
4. Continue server capability negotiation so vanilla Cloud hosts degrade
   cleanly without showing unsupported-endpoint errors.
5. Evaluate plugin offloading only when the generic seam preserves identical
   Desktop, Mobile, local, remote, and Cloud behavior.

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

Verify the newly replacement-installed Mobile debug APK on the physical
Samsung: rapid pokes should speak only the newest relevant reaction without
interrupting ordinary speech. Spot-check the expanded adapted presets, the
grouped personality picker, a custom edit and reset on Workstation, isolation
from a Cloud connection, and automatic Workstation recovery after Desktop
closes and reopens.
