# Hermes Machine Map Design

Status: proposed

Last updated: 2026-07-30

## Purpose

Hermes needs a small, durable description of the machine behind a session:
what environment its tools actually operate in, how paths map between shells
and native programs, which capabilities are available, and which verified
quirks should influence future work.

This is not another general memory backend. It is structured operational
context with explicit provenance, revision history, and user control.

## Design Goals

- Give every new session a concise, correct environment snapshot.
- Keep automatically observed facts separate from user-authored guidance.
- Let one Hermes profile describe more than one machine or remote runtime.
- Preserve prompt-prefix caching for the full life of a session.
- Avoid modifying or contending with Hermes's main `state.db`.
- Never infer machine identity from private or globally unique hardware data.
- Make stale, conflicting, and unverified claims visible instead of silently
  treating them as truth.
- Let Desktop and Mobile inspect and edit the same host-owned map.

## Scope Model

Machine context is resolved from broadest to narrowest:

```text
machine
  profile
    workspace
      session binding
```

The machine record describes the host or remote execution target. Profile
overrides describe a profile-specific runtime. Workspace entries describe a
repository, project, or directory tree. A session binding points to an exact
machine-map revision and workspace at the moment the session starts.

More-specific entries may override broader entries, but they must retain the
source they replaced so the UI can explain the effective value.

## Identity

Each machine gets a generated random UUID and a user-editable display name.
Connection IDs may point to that UUID, but URLs and hostnames are attributes,
not identity.

The map must not derive identity from:

- MAC addresses
- Android ID
- serial numbers
- motherboard or disk identifiers
- account tokens
- public IP addresses

This lets a user rename or reconnect a host without creating an accidental
tracking identifier.

## Storage

The server plugin owns a separate profile-scoped database:

```text
<HERMES_HOME>/plugins/hermes-mobile/machine-map.db
```

It uses SQLite WAL mode, a bounded busy timeout, short transactions, and one
process-local write lock. It never participates in a transaction with
`state.db`, Kanban, cron, or another plugin database.

Core session rows remain untouched. The plugin stores the relationship in its
own table:

```text
session_bindings(
  session_id,
  machine_id,
  machine_revision,
  workspace_id,
  bound_at,
  refresh_mode
)
```

Every mutation creates a new immutable machine revision. The current machine
record only points at the latest revision. Old session bindings therefore
remain explainable after the map evolves.

## Record Shape

The persisted model is structured rather than a free-form blob:

```json
{
  "machine_id": "random UUID",
  "display_name": "Workstation",
  "revision": 12,
  "updated_at": "ISO timestamp",
  "facts": [
    {
      "key": "runtime.os",
      "value": "windows",
      "source": "probe",
      "state": "observed",
      "confidence": "high",
      "observed_at": "ISO timestamp",
      "expires_at": null
    }
  ],
  "paths": [
    {
      "name": "hermes_home",
      "native": "C:/Users/name/AppData/Local/hermes",
      "terminal": "/c/Users/name/AppData/Local/hermes",
      "container": null,
      "tools": "C:/Users/name/AppData/Local/hermes",
      "scope": "machine",
      "verified_at": "ISO timestamp"
    }
  ],
  "capabilities": [
    {
      "key": "tts.qwen.voice_cloning",
      "status": "available",
      "source": "capability_probe",
      "details": "provider-owned catalog",
      "observed_at": "ISO timestamp"
    }
  ],
  "quirks": [
    {
      "id": "random UUID",
      "title": "Native ripgrep needs native drive paths",
      "guidance": "Resolve /c/... before dispatching to rg.exe.",
      "source": "user",
      "state": "confirmed",
      "scope": "machine",
      "evidence": "optional bounded note",
      "enabled": true
    }
  ],
  "notes": [
    {
      "id": "random UUID",
      "text": "Treat the AppData install as authoritative.",
      "source": "user",
      "state": "confirmed",
      "scope": "profile",
      "locked": true
    }
  ]
}
```

## Automatic Observation

The first probe is read-only and deliberately small:

- operating system, release, and architecture
- Hermes version and active profile
- terminal backend and actual shell dialect
- resolved tool cwd and safe home/workspace roots
- path spellings used by terminal, file tools, and native executables
- enabled Hermes capability families and Mobile contract features
- available runtimes already exposed by Hermes, such as Python and Git

Volatile facts carry an expiry. Stable facts do not. A later probe records a
new observation and marks a contradiction for review; it does not silently
overwrite a locked user note.

Tool failures may create a proposed quirk, but only confirmed user guidance or
a repeatable probe becomes prompt context. Raw command output, secrets, full
environment variables, installed-application inventories, network addresses,
and credentials are never stored.

## Prompt and Cache Contract

Hermes builds and stores one byte-stable system prompt per session. The machine
map must not rebuild it during a conversation.

The plugin uses the existing lifecycle hooks:

1. `on_session_start` binds the session to the current machine revision.
2. The first `pre_llm_call` returns one concise, deterministic map snapshot.
3. Hermes appends that snapshot to the API copy of the first user message and
   persists the exact `api_content` sidecar.
4. Later turns replay the same bytes, preserving the provider cache prefix.
5. Ordinary map edits apply to new sessions by default.

An explicit Refresh session context action may append one bounded revision
delta to the next user turn. It never edits prior messages or the stored system
prompt. The UI must disclose that this creates a new prompt-cache boundary at
the tail of the existing conversation.

Compression children inherit the parent's binding unless the user explicitly
selects the latest revision. The plugin uses the `parent_session_id` passed to
`pre_llm_call` to preserve that lineage.

The prompt projection is capped and deterministic. It includes effective facts,
verified path mappings, available capability families, and enabled confirmed
quirks. Full evidence and history remain available in the inspector rather than
being repeated to the model.

## Server Interface

No new core model tool is required. The server plugin exposes authenticated,
versioned HTTP routes:

```text
GET   /v1/machine-map
PATCH /v1/machine-map
POST  /v1/machine-map/probe
GET   /v1/machine-map/sessions/{session_id}
POST  /v1/machine-map/sessions/{session_id}/refresh
```

Mutations use the current revision as an optimistic-concurrency precondition.
A stale editor receives a conflict containing the newer revision and must
reconcile rather than overwrite it.

The plugin also registers a `hermes machine-map` CLI tree for inspect, probe,
note, quirk, history, and forget operations. This is a CLI plus plugin feature,
not a permanent model-tool schema.

## Desktop and Mobile Presentation

Each saved Mobile connection shows a collapsed Machine map section containing:

- machine name and last verified time
- effective OS, shell, backend, cwd, and path dialect
- capability summary
- confirmed quirks and notes
- stale or conflicting facts that need review
- Probe, Edit, History, and Refresh session context actions

Session cards show the bound machine name and revision. The current session
status can show when a newer map exists without silently applying it.

Desktop uses the same server routes and presentation contract. Client-local
connection labels remain separate from the host-owned machine identity.

Vanilla Cloud hosts without the plugin simply report that Machine map is
unavailable. Mobile must not infer a map for them from its own Android device
or from another saved server.

## Privacy and Safety

- All state is profile-scoped through `get_hermes_home()`.
- HTTP routes use Hermes's canonical authenticated plugin route.
- Returned paths are visible only in the explicit inspector, never in public
  capability or unauthenticated health responses.
- Secrets and secret-like keys are rejected at the write boundary.
- Probe commands are fixed and read-only, not user-composed shell strings.
- Forget removes the machine map and session bindings from the plugin database
  without modifying Hermes sessions.
- Export is explicit and redacts path usernames and hostnames by default.

## Delivery Slices

1. Add the versioned store, schema, revision binding, and deterministic prompt
   projection with focused concurrency and cache-stability tests.
2. Add the conservative probe and conflict review.
3. Add authenticated server routes and CLI management.
4. Add Mobile inspection/editing and session revision badges.
5. Add the matching Desktop inspector.
6. Add proposed quirks from repeated, redacted tool failures only after the
   manual map workflow is proven.
