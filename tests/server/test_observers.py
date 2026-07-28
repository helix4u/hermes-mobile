from __future__ import annotations

import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
PLUGIN_ROOT = PROJECT_ROOT / "server-plugin"
sys.path.insert(0, str(PLUGIN_ROOT))

from mobile_server import observers


class ObserverTests(unittest.TestCase):
    def setUp(self) -> None:
        observers.reset_for_tests()

    def tearDown(self) -> None:
        observers.reset_for_tests()

    def test_approval_observation_never_copies_command_payload(self) -> None:
        observers.on_session_start(session_id="s1", platform="tui")
        observers.pre_approval_request(
            session_key="s1",
            command="echo super-secret-value",
            description="dangerous",
            surface="cli",
        )

        rows = observers.snapshot()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["attention"], "approval")
        self.assertNotIn("command", rows[0])
        self.assertNotIn("super-secret-value", repr(rows[0]))

    def test_approval_resolution_returns_session_to_active(self) -> None:
        observers.on_session_start(session_id="s1", platform="tui")
        observers.pre_approval_request(session_key="s1", surface="cli")
        observers.post_approval_response(session_key="s1", choice="deny")

        row = observers.snapshot()[0]
        self.assertEqual(row["status"], "active")
        self.assertIsNone(row["attention"])


if __name__ == "__main__":
    unittest.main()
