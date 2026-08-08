# Archived Mobile status recap through 2026-08-02

This file preserves the five former active-status summaries that were moved out
to keep `STATUS.md` under its 24,000-character bound.

## Mobile personality catalog and editor

The app owns a safe offline catalog containing Alien Child, Dr. House, Fight
Club Narrator, Gremlin, Noir Build Detective, Ponytail Principal, Shipbreaker
QA, and thirteen adapted Hermes defaults. Host-only definitions merge after
capability discovery. Structured connection-scoped edits never overwrite a
host or bundled file.

## Explicit Windows host lifecycle

The Mobile host exposes start, stop, restart, status, and uninstall. Startup is
selectable as Desktop-bound, persistent, or manual. Desktop-bound mode retires
the backend, proxy, and supervisor when packaged Desktop exits. A plugin-owned
one-minute task trigger restores all three after Desktop reopens, including
recovery when the prior supervisor was externally killed.

## Forced connected-server plugin update

Control can force-replace an active `hermes-mobile` plugin even when the
hardcoded semantic version is unchanged. The target comes from the authenticated
plugin registry and remains guarded by path, size, upload, enablement, and
restart checks.

## Mobile voice and wake path

Mobile has connection-scoped provider/voice selection, adaptive buffered TTS,
openWakeWord capture with review/auto-send modes, explicit capture cues, and
host transcription. Long-output and device-power acceptance continues during
ordinary use.

## Pet companion and streamed speech reliability

Pet movement was full-viewport and border-aware, with two-axis destinations,
faster minimum travel, resize reconciliation, and direct user-owned drag.
Automatic commentary had turn-scoped cancellation so Stop and terminal turn
events cleared pending generation and queued speech. Poke speech had a prepared
replacement path so slow TTS could not create stale tap queues or silence the
current poke while replacement audio rendered. Mobile prepared final-response
audio before the final event, using natural segmentation, bounded synthesis
overlap, and serial playback. Desktop used its native streaming endpoint when
available and the same prepared-segment fallback for other providers.
