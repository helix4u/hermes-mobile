"""Short-lived one-use tickets for loopback mobile WebSocket authentication."""

from __future__ import annotations

import secrets
import threading
import time
from dataclasses import dataclass


TTL_SECONDS = 30


@dataclass(frozen=True)
class _Ticket:
    credential: str
    expires_at: float


_lock = threading.Lock()
_tickets: dict[str, _Ticket] = {}


def _purge_expired(now: float) -> None:
    expired = [
        token
        for token, ticket in _tickets.items()
        if ticket.expires_at <= now
    ]
    for token in expired:
        _tickets.pop(token, None)


def mint_ticket(credential: str, *, now: float | None = None) -> str:
    """Store a verified credential behind an opaque, one-use ticket."""

    if not credential:
        raise ValueError("credential is required")

    issued_at = time.monotonic() if now is None else now
    token = secrets.token_urlsafe(32)
    with _lock:
        _purge_expired(issued_at)
        _tickets[token] = _Ticket(
            credential=credential,
            expires_at=issued_at + TTL_SECONDS,
        )
    return token


def consume_ticket(token: str, *, now: float | None = None) -> str | None:
    """Consume a ticket once and return its verified credential."""

    if not token:
        return None

    consumed_at = time.monotonic() if now is None else now
    with _lock:
        _purge_expired(consumed_at)
        ticket = _tickets.pop(token, None)
    if ticket is None or ticket.expires_at <= consumed_at:
        return None
    return ticket.credential
