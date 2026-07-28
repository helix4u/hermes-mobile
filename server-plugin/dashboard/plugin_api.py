"""Dashboard plugin entrypoint loaded by Hermes's FastAPI server."""

from __future__ import annotations

try:
    from hermes_plugins.hermes_mobile.mobile_server.api import router
except ImportError:
    # Standalone development and focused tests import the source package
    # directly. Production loads the root plugin first as
    # ``hermes_plugins.hermes_mobile``.
    from mobile_server.api import router


__all__ = ["router"]
