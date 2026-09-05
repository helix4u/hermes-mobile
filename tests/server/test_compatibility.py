from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server-plugin"))
from mobile_server import compatibility


class CompatibilityTests(unittest.TestCase):
    def probe(self, *, modern=True, missing=False, broken_import=False):
        self.auth = lambda ws: False
        self.guard = lambda ws: False
        legacy = SimpleNamespace(_require_token=lambda request: None)
        chat = SimpleNamespace(_ws_auth_ok=self.auth, _ws_request_is_allowed=self.guard)
        if not modern:
            legacy._ws_auth_ok = self.auth
            legacy._ws_request_is_allowed = self.guard
        if missing:
            del chat._ws_auth_ok
        modules = {
            "tui_gateway.server": SimpleNamespace(dispatch=lambda *args: None),
            "tui_gateway.ws": SimpleNamespace(handle_ws=lambda *args: None),
            "hermes_cli.web_server": legacy,
            "hermes_cli.web_server_chat": chat,
        }

        def load(name):
            if name == "hermes_cli.web_server_chat" and (not modern or broken_import):
                raise ModuleNotFoundError(name="dependency" if broken_import else name)
            return modules[name]

        with patch.object(compatibility, "import_module", side_effect=load), patch.object(
            compatibility, "_hermes_version", return_value="test"
        ):
            return compatibility.probe_hermes()

    def test_decomposed_owner_retains_actual_authentication_functions(self):
        result = self.probe()
        self.assertTrue(result.gateway_available)
        self.assertIs(result.websocket_auth, self.auth)
        self.assertIs(result.websocket_request_guard, self.guard)
        self.assertFalse(result.websocket_auth(object()))

    def test_old_host_uses_its_canonical_guards(self):
        self.assertTrue(self.probe(modern=False).gateway_available)

    def test_missing_authentication_fails_closed(self):
        self.assertFalse(self.probe(missing=True).gateway_available)

    def test_broken_new_owner_does_not_fall_back(self):
        self.assertFalse(self.probe(broken_import=True).gateway_available)


if __name__ == "__main__":
    unittest.main()
