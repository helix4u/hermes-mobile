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
    profile: str | None = None


class TicketStore:
    """One issuer's bounded, in-memory tickets. Never shared across bridge apps."""

    def __init__(self, scope: tuple = (), *, max_pending: int | None = 128) -> None:
        self.scope = scope
        self.max_pending = max_pending
        self._lock = threading.Lock()
        self._tickets: dict[str, _Ticket] = {}

    def mint(self, credential: str, *, now: float | None = None, profile: str | None = None) -> str:
        if not credential:
            raise ValueError("credential is required")
        issued = time.monotonic() if now is None else now
        with self._lock:
            self._tickets = {k: v for k, v in self._tickets.items() if v.expires_at > issued}
            if self.max_pending is not None and len(self._tickets) >= self.max_pending:
                raise ValueError("Ticket capacity reached")
            token = secrets.token_urlsafe(32)
            self._tickets[token] = _Ticket(credential, issued + TTL_SECONDS, profile)
        return token

    def consume(self, token: str, *, now: float | None = None) -> str | None:
        result = self.consume_binding(token, now=now)
        return result[0] if result else None

    def consume_binding(self, token: str, *, now: float | None = None) -> tuple[str, str | None] | None:
        consumed = time.monotonic() if now is None else now
        with self._lock:
            self._tickets = {k: v for k, v in self._tickets.items() if v.expires_at > consumed}
            ticket = self._tickets.pop(token, None)
        return (ticket.credential, ticket.profile) if ticket and ticket.expires_at > consumed else None

    def dispose(self) -> None:
        with self._lock:
            self._tickets.clear()


_default_store = TicketStore(max_pending=None)


def mint_ticket(credential: str, *, now: float | None = None) -> str:
    """Store a verified credential behind an opaque, one-use ticket."""

    return _default_store.mint(credential, now=now)


def consume_ticket(token: str, *, now: float | None = None) -> str | None:
    """Consume a ticket once and return its verified credential."""

    return _default_store.consume(token, now=now)
