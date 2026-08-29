"""Dashboard plugin entrypoint loaded by Hermes's FastAPI server."""

from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path
import sys


_PLUGIN_ROOT = Path(__file__).resolve().parents[1]
_COMPATIBILITY_PATH = _PLUGIN_ROOT / "mobile_server" / "compatibility.py"
_COMPATIBILITY_MODULE = (
    "hermes_mobile_dashboard_compat_"
    + hashlib.sha256(str(_PLUGIN_ROOT).encode("utf-8")).hexdigest()[:12]
)
_SPEC = importlib.util.spec_from_file_location(
    _COMPATIBILITY_MODULE,
    _COMPATIBILITY_PATH,
)
if _SPEC is None or _SPEC.loader is None:
    raise ImportError(f"Cannot load Mobile compatibility boundary: {_COMPATIBILITY_PATH}")

_compatibility = importlib.util.module_from_spec(_SPEC)
sys.modules[_COMPATIBILITY_MODULE] = _compatibility
try:
    _SPEC.loader.exec_module(_compatibility)
except BaseException:
    sys.modules.pop(_COMPATIBILITY_MODULE, None)
    raise

router = _compatibility.load_dashboard_router(_PLUGIN_ROOT)


__all__ = ["router"]
