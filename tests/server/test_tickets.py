from __future__ import annotations

import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
PLUGIN_ROOT = PROJECT_ROOT / "server-plugin"
sys.path.insert(0, str(PLUGIN_ROOT))

from mobile_server.tickets import TTL_SECONDS, consume_ticket, mint_ticket


class TicketTests(unittest.TestCase):
    def test_ticket_is_single_use(self) -> None:
        ticket = mint_ticket("credential", now=100.0)

        self.assertEqual(consume_ticket(ticket, now=101.0), "credential")
        self.assertIsNone(consume_ticket(ticket, now=101.0))

    def test_expired_ticket_fails_closed(self) -> None:
        ticket = mint_ticket("credential", now=100.0)

        self.assertIsNone(
            consume_ticket(ticket, now=100.0 + TTL_SECONDS + 0.01),
        )


if __name__ == "__main__":
    unittest.main()
