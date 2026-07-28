"""Contain every dependency on Hermes implementation details in one module."""

from __future__ import annotations

from dataclasses import dataclass
from importlib import import_module, metadata
from typing import Any


@dataclass(frozen=True)
class CompatibilityReport:
    status: str
    hermes_version: str
    details: tuple[str, ...]
    dispatcher: Any = None
    websocket_handler: Any = None
    websocket_auth: Any = None
    websocket_request_guard: Any = None
    http_auth: Any = None

    @property
    def gateway_available(self) -> bool:
        return (
            self.status != "incompatible"
            and callable(self.dispatcher)
            and callable(self.websocket_handler)
            and callable(self.websocket_auth)
            and callable(self.websocket_request_guard)
            and callable(self.http_auth)
        )


def _hermes_version() -> str:
    for distribution in ("hermes-agent", "hermes_agent"):
        try:
            return metadata.version(distribution)
        except metadata.PackageNotFoundError:
            continue

    try:
        constants = import_module("hermes_constants")
        return str(getattr(constants, "__version__", "source-checkout"))
    except Exception:
        return "unknown"


def probe_hermes() -> CompatibilityReport:
    """Probe the narrow private seam required by the mobile gateway.

    No mutating feature should call Hermes internals without first obtaining a
    report whose ``gateway_available`` property is true.
    """

    details: list[str] = []
    dispatcher = None
    websocket_handler = None
    websocket_auth = None
    websocket_request_guard = None
    http_auth = None

    try:
        server = import_module("tui_gateway.server")
        dispatcher = getattr(server, "dispatch", None)
        if not callable(dispatcher):
            details.append("tui_gateway.server.dispatch is unavailable")
    except Exception as exc:
        details.append(f"could not import tui_gateway.server: {type(exc).__name__}")

    try:
        ws_module = import_module("tui_gateway.ws")
        websocket_handler = getattr(ws_module, "handle_ws", None)
        if not callable(websocket_handler):
            details.append("tui_gateway.ws.handle_ws is unavailable")
    except Exception as exc:
        details.append(f"could not import tui_gateway.ws: {type(exc).__name__}")

    try:
        web_server = import_module("hermes_cli.web_server")
        websocket_auth = getattr(web_server, "_ws_auth_ok", None)
        websocket_request_guard = getattr(
            web_server,
            "_ws_request_is_allowed",
            None,
        )
        http_auth = getattr(web_server, "_require_token", None)
        if not callable(websocket_auth):
            details.append("Hermes WebSocket authentication gate is unavailable")
        if not callable(websocket_request_guard):
            details.append("Hermes WebSocket request guard is unavailable")
        if not callable(http_auth):
            details.append("Hermes HTTP authentication gate is unavailable")
    except Exception as exc:
        details.append(f"could not import hermes_cli.web_server: {type(exc).__name__}")

    status = "compatible" if not details else "incompatible"
    return CompatibilityReport(
        status=status,
        hermes_version=_hermes_version(),
        details=tuple(details),
        dispatcher=dispatcher,
        websocket_handler=websocket_handler,
        websocket_auth=websocket_auth,
        websocket_request_guard=websocket_request_guard,
        http_auth=http_auth,
    )
