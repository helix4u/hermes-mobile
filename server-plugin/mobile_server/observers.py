"""Low-risk lifecycle observations exposed by Hermes's public plugin hooks."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, replace
from typing import Any


@dataclass(frozen=True)
class ObservedSession:
    session_id: str
    status: str
    platform: str
    updated_at: float
    attention: str | None = None


_lock = threading.RLock()
_sessions: dict[str, ObservedSession] = {}


def _session_id(kwargs: dict[str, Any]) -> str:
    return str(kwargs.get("session_id") or kwargs.get("session_key") or "")


def on_session_start(**kwargs: Any) -> None:
    session_id = _session_id(kwargs)
    if not session_id:
        return
    with _lock:
        _sessions[session_id] = ObservedSession(
            session_id=session_id,
            status="active",
            platform=str(kwargs.get("platform") or "unknown"),
            updated_at=time.time(),
        )


def on_session_end(**kwargs: Any) -> None:
    _mark_closed(kwargs, "ended")


def on_session_finalize(**kwargs: Any) -> None:
    _mark_closed(kwargs, "finalized")


def on_session_reset(**kwargs: Any) -> None:
    _mark_closed(kwargs, "reset")


def _mark_closed(kwargs: dict[str, Any], status: str) -> None:
    session_id = _session_id(kwargs)
    if not session_id:
        return
    with _lock:
        current = _sessions.get(session_id)
        if current is None:
            _sessions[session_id] = ObservedSession(
                session_id=session_id,
                status=status,
                platform=str(kwargs.get("platform") or "unknown"),
                updated_at=time.time(),
            )
            return
        _sessions[session_id] = replace(
            current,
            status=status,
            attention=None,
            updated_at=time.time(),
        )


def pre_approval_request(**kwargs: Any) -> None:
    """Record only that attention is required, never the command payload."""

    session_id = _session_id(kwargs)
    if not session_id:
        return
    with _lock:
        current = _sessions.get(session_id)
        _sessions[session_id] = ObservedSession(
            session_id=session_id,
            status="waiting_for_input",
            platform=(
                current.platform
                if current is not None
                else str(kwargs.get("surface") or "unknown")
            ),
            updated_at=time.time(),
            attention="approval",
        )


def post_approval_response(**kwargs: Any) -> None:
    session_id = _session_id(kwargs)
    if not session_id:
        return
    with _lock:
        current = _sessions.get(session_id)
        if current is None:
            return
        _sessions[session_id] = replace(
            current,
            status="active",
            attention=None,
            updated_at=time.time(),
        )


def snapshot() -> list[dict[str, Any]]:
    with _lock:
        rows = sorted(
            _sessions.values(),
            key=lambda row: row.updated_at,
            reverse=True,
        )
    return [
        {
            "session_id": row.session_id,
            "status": row.status,
            "platform": row.platform,
            "updated_at": row.updated_at,
            "attention": row.attention,
        }
        for row in rows
    ]


def reset_for_tests() -> None:
    with _lock:
        _sessions.clear()
