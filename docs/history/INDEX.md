# Hermes Mobile History Index

Historical ledgers are preserved for evidence, not read on every session.
Current authority lives in `../../PLAN.md` and `../../STATUS.md`.

## Reading rule

- Search this index by the active subsystem.
- Read only the listed bounded range or a narrow `rg -n -C 20` match.
- Load no more than two history slices during ordinary recovery.
- Never read an entire archive by default.

## `PLAN-through-2026-07-31.md`

Verbatim former `PLAN.md` (2,245 lines, 117,653 bytes).

- Purpose, architecture, compatibility boundary: lines 1-276; keywords
  `Purpose`, `Architecture Decision`, `Existing Hermes Seams`, `Security`.
- Milestone definitions: lines 277-1294. Read only the milestone matching the
  task: `5B` UI, `5C` TTS, `5D` deployment, `5E` workspace, `5F` sharing,
  `5G` Reader/files/media, `5H` pet, `5I` sidechat/motion, `5J` Cloud onboarding,
  `5K` plugin install, `5L` companion, `5M` machine map, `5N` providers/wake,
  `5O` continuity/handoffs.
- Validation, compatibility, and risks: lines 1295-1341.
- Former current-action and chronological acceptance ledger: lines 1342-2245.
  Search exact subsystem/date first and read at most 120 surrounding lines.
- Backend lifecycle acceptance: lines 2228-2245.

## `STATUS-through-2026-07-31.md`

Verbatim former `STATUS.md` (2,202 lines, 146,292 bytes).

- Consolidated historical state: lines 1-2148. This is intentionally not a
  startup read. Use `rg -n` for exact terms such as `Reader`, `xAI`, `Qwen`,
  `wake`, `pet`, `foreground`, `Cloud`, `sessions`, `files`, `share`, or `APK`,
  then read at most 80 surrounding lines.
- Backend lifecycle and replacement builds: lines 2149-2177.
- Forced connected-server plugin update: lines 2178-2202.

## `STATUS-2026-08-02-companion-voice-lifecycle.md`

- Mobile personalities/editor, Windows host lifecycle, forced plugin update,
  wake/voice, pet movement, and streamed speech recap: lines 1-47; keywords
  `personality`, `Desktop-bound`, `force-replace`, `openWakeWord`, `pet`, `TTS`.

## `STATUS-2026-08-08-pre-jump-validation.md`

- Prior Desktop, speech, Reader, Mobile artifact, and replacement-install
  validation: lines 1-51; keywords `Desktop`, `speech`, `Reader`, `APK`,
  `deduplication`, `cold launch`.

## Adding history

Archive the oldest active summary before either current file exceeds 24,000
characters or five dated/recent summaries. Use a dated, topic-specific filename
when possible, retain exact evidence, and add keywords plus precise line ranges
here.
