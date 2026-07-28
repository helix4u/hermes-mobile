"""Hermes Mobile server plugin registration."""

from __future__ import annotations

from .mobile_server.observers import (
    on_session_end,
    on_session_finalize,
    on_session_reset,
    on_session_start,
    post_approval_response,
    pre_approval_request,
)


def register(ctx) -> None:
    """Register observer hooks used by the mobile compatibility layer."""

    ctx.register_hook("on_session_start", on_session_start)
    ctx.register_hook("on_session_end", on_session_end)
    ctx.register_hook("on_session_finalize", on_session_finalize)
    ctx.register_hook("on_session_reset", on_session_reset)
    ctx.register_hook("pre_approval_request", pre_approval_request)
    ctx.register_hook("post_approval_response", post_approval_response)
