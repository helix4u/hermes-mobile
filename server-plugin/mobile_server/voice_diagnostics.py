"""Content-free, bounded Mobile voice evidence. Never pass raw events here."""

from __future__ import annotations

from collections import deque
import json
import math
import os
from pathlib import Path
import re
import tempfile
import threading
import time

from fastapi import HTTPException, Request

MAX_BODY_BYTES = 16_384
MAX_ENTRIES = 32
MAX_SPOOL_BYTES = 512 * 1024
MAX_SPOOL_ROWS = 4096
RETENTION_SECONDS = 7 * 86400
MAX_REQUESTS_PER_MINUTE = 12
_lock = threading.Lock()
_requests: deque[float] = deque()

_BASIC_PHASES = """
output.muted output.unmuted review.cancelled review.approved review.reread
review.unverified microphone_muted microphone_unmuted provider_failure
review.state.idle review.state.interrupted review.state.awaiting_transcript
review.state.content_mismatch review.state.ready review.state.awaiting_audio
start.microphone start.credentials playback_failed microphone_ended
capture_suspended capture_resumed microphone_acquired event_handler_failed
start.connection_failed start.context_capacity start.requested start.permission
start.failed start.session_failed probe.signal probe.quiet input.suspended
input.signal input.quiet session.created input_audio_buffer.speech_started
input_audio_buffer.speech_stopped conversation.item.input_audio_transcription.completed
conversation.item.input_audio_transcription.failed response.created response.done error
output.unexpected_pause output.media_playing output.media_waiting output.media_unobservable
output.media_recovered output.media_progress output.media_stalled
response_waiting_for_playback response_requested playback_interrupted quiet barge_in
playback_started playback_cleared playback_stopped
""".split()
_REASONS = """context_capacity cancel_already_complete response_busy empty_input
rate_limited authentication session_expired session_missing context_backend_error
disconnected timeout interrupted unknown""".split()
_TOOLS = """wait_for_user read_attached_context propose_attached_action draft_hermes_request
get_ui_context get_session_workers read_worker_activity draft_worker_steer
read_voice_conversation read_voice_memory recall_voice_memory save_voice_memory
forget_voice_memory search_voice_web read_voice_webpage get_context_snapshot
get_session_context get_pet_sidechat_history get_session_activity read_session_context
search_session_context unknown""".split()
PHASES = frozenset(_BASIC_PHASES) | {
    f"{prefix}.{reason}"
    for prefix in ("provider.error", "provider.response_failed", "tool.failure")
    for reason in _REASONS
} | {
    f"tool.{tool}.{stage}" for tool in _TOOLS for stage in ("started", "completed", "failed")
} | {f"peer.{state}" for state in ("new", "connecting", "connected", "disconnected", "failed", "closed")} | {
    f"start.microphone_{reason}" for reason in ("unavailable", "permission", "busy", "failed")
}


async def read_payload(request: Request) -> dict:
    """Bound chunked requests too, before JSON parsing or buffering the full body."""
    length = request.headers.get("content-length")
    if length is not None:
        try:
            size = int(length)
        except ValueError:
            raise HTTPException(400, "Invalid diagnostics length") from None
        if size < 0 or size > MAX_BODY_BYTES:
            raise HTTPException(413, "Diagnostics batch too large")
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_BODY_BYTES:
            raise HTTPException(413, "Diagnostics batch too large")
        data.extend(chunk)
    try:
        return json.loads(data)
    except (ValueError, UnicodeError, RecursionError):
        raise HTTPException(400, "Invalid diagnostics JSON") from None


def validate_payload(payload: object) -> list[dict]:
    def invalid() -> None:
        raise HTTPException(400, "Invalid content-free diagnostics batch")

    if not isinstance(payload, dict) or set(payload) - {"schema", "optIn", "transport", "build", "entries"}:
        invalid()
    if type(payload.get("schema")) is not int or payload["schema"] != 1 or payload.get("optIn") is not True:
        invalid()
    if payload.get("transport") not in ("native", "browser"):
        invalid()
    build = payload.get("build")
    # Version/hash only. Never accept connection labels, host URLs or free-form error text.
    if build is not None and (not isinstance(build, str) or not re.fullmatch(r"[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}(?:\+[a-f0-9]{7,40})?", build)):
        invalid()
    entries = payload.get("entries")
    if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_ENTRIES:
        invalid()
    clean = []
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != {"phase", "elapsedMs", "epoch", "muted", "tracks"}:
            invalid()
        if not isinstance(entry["phase"], str) or entry["phase"] not in PHASES or type(entry["muted"]) is not bool:
            invalid()
        for key, ceiling in (("elapsedMs", 120_000), ("epoch", 2_147_483_647), ("tracks", 32)):
            value = entry[key]
            if type(value) is not int or not 0 <= value <= ceiling:
                invalid()
        clean.append({"schema": 1, "transport": payload["transport"], **({"build": build} if build else {}), **entry})
    return clean


def append_entries(home: Path, entries: list[dict]) -> int:
    """Atomic bounded ring, serialized across profiles with an aggregate write limit."""
    with _lock:
        tick = time.monotonic()
        while _requests and _requests[0] <= tick - 60:
            _requests.popleft()
        if len(_requests) >= MAX_REQUESTS_PER_MINUTE:
            raise HTTPException(429, "Diagnostics upload rate limited", headers={"Retry-After": "60"})
        _requests.append(tick)
        now = time.time()
        logs = home / "logs"
        logs.mkdir(mode=0o700, parents=True, exist_ok=True)
        path = logs / "mobile-voice-diagnostics.jsonl"
        retained: deque[bytes] = deque()
        if path.exists():
            # Never read an unbounded local file, even if it was replaced externally.
            with path.open("rb") as handle:
                size = handle.seek(0, os.SEEK_END)
                handle.seek(max(0, size - MAX_SPOOL_BYTES))
                if size > MAX_SPOOL_BYTES:
                    handle.readline()
                for line in handle:
                    try:
                        row = json.loads(line)
                        received = row["receivedAt"]
                        if type(received) not in (int, float) or not math.isfinite(received) or not now - RETENTION_SECONDS <= received <= now:
                            continue
                        # Re-validate disk contents so an unexpected old schema cannot survive.
                        candidate = {key: row[key] for key in ("phase", "elapsedMs", "epoch", "muted", "tracks")}
                        checked = validate_payload({"schema": 1, "optIn": True, "transport": row["transport"],
                                                    **({"build": row["build"]} if "build" in row else {}), "entries": [candidate]})[0]
                        retained.append(_encode({"receivedAt": received, **checked}))
                    except (ValueError, KeyError, TypeError, HTTPException):
                        continue
        retained.extend(_encode({"receivedAt": now, **entry}) for entry in entries)
        total = sum(map(len, retained))
        while retained and (total > MAX_SPOOL_BYTES or len(retained) > MAX_SPOOL_ROWS):
            total -= len(retained.popleft())
        fd, temporary = tempfile.mkstemp(prefix=".mobile-voice-", dir=logs)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.writelines(retained)
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        return len(entries)


def _encode(row: dict) -> bytes:
    return (json.dumps(row, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")
