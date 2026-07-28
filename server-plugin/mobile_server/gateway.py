"""Authenticated WebSocket facade for the Hermes gateway dispatcher."""

from __future__ import annotations

import logging
from typing import Any

from .compatibility import probe_hermes
from .tickets import consume_ticket

log = logging.getLogger(__name__)


class _CanonicalTokenView:
    """Expose a consumed mobile credential to Hermes's canonical WS gate."""

    def __init__(self, websocket: Any, credential: str) -> None:
        self._websocket = websocket
        self.query_params = {"token": credential}

    def __getattr__(self, name: str) -> Any:
        return getattr(self._websocket, name)


async def handle_mobile_gateway(ws: Any) -> None:
    """Validate the mobile connection and delegate to Hermes's real gateway."""

    report = probe_hermes()
    if not report.gateway_available:
        log.error(
            "Hermes Mobile gateway unavailable: %s",
            "; ".join(report.details),
        )
        await ws.close(code=1011, reason="Hermes Mobile plugin is incompatible")
        return

    auth_websocket = ws
    mobile_ticket = ws.query_params.get("mobile_ticket", "")
    if mobile_ticket:
        credential = consume_ticket(mobile_ticket)
        if credential is None:
            await ws.close(code=4401, reason="Authentication required")
            return
        auth_websocket = _CanonicalTokenView(ws, credential)

    if not report.websocket_auth(auth_websocket):
        await ws.close(code=4401, reason="Authentication required")
        return

    if not report.websocket_request_guard(ws):
        await ws.close(code=4403, reason="WebSocket request rejected")
        return

    await report.websocket_handler(ws)
