from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch


PROJECT_ROOT = Path(__file__).resolve().parents[2]
PLUGIN_ROOT = PROJECT_ROOT / "server-plugin"
sys.path.insert(0, str(PLUGIN_ROOT))

from mobile_server.gateway import handle_mobile_gateway


class GatewayTests(unittest.IsolatedAsyncioTestCase):
    async def test_incompatible_gateway_fails_closed(self) -> None:
        ws = SimpleNamespace(close=AsyncMock(), query_params={})
        report = SimpleNamespace(
            gateway_available=False,
            details=("missing dispatcher",),
        )

        with patch("mobile_server.gateway.probe_hermes", return_value=report):
            await handle_mobile_gateway(ws)

        ws.close.assert_awaited_once_with(
            code=1011,
            reason="Hermes Mobile plugin is incompatible",
        )

    async def test_authentication_failure_closes_before_dispatch(self) -> None:
        handler = AsyncMock()
        report = SimpleNamespace(
            gateway_available=True,
            websocket_auth=lambda _ws: False,
            websocket_request_guard=lambda _ws: True,
            websocket_handler=handler,
            details=(),
        )
        ws = SimpleNamespace(close=AsyncMock(), query_params={})

        with patch("mobile_server.gateway.probe_hermes", return_value=report):
            await handle_mobile_gateway(ws)

        ws.close.assert_awaited_once_with(
            code=4401,
            reason="Authentication required",
        )
        handler.assert_not_awaited()

    async def test_valid_connection_uses_real_gateway_handler_seam(self) -> None:
        handler = AsyncMock()
        report = SimpleNamespace(
            gateway_available=True,
            websocket_auth=lambda _ws: True,
            websocket_request_guard=lambda _ws: True,
            websocket_handler=handler,
            details=(),
        )
        ws = SimpleNamespace(close=AsyncMock(), query_params={})

        with patch("mobile_server.gateway.probe_hermes", return_value=report):
            await handle_mobile_gateway(ws)

        handler.assert_awaited_once_with(ws)
        ws.close.assert_not_awaited()

    async def test_mobile_ticket_is_single_use_and_uses_canonical_auth(self) -> None:
        from mobile_server.tickets import mint_ticket

        handler = AsyncMock()
        seen_credentials: list[str] = []
        report = SimpleNamespace(
            gateway_available=True,
            websocket_auth=lambda candidate: (
                seen_credentials.append(candidate.query_params.get("token", ""))
                or True
            ),
            websocket_request_guard=lambda _ws: True,
            websocket_handler=handler,
            details=(),
        )
        ticket = mint_ticket("verified-loopback-token")
        ws = SimpleNamespace(
            close=AsyncMock(),
            query_params={"mobile_ticket": ticket},
        )

        with patch("mobile_server.gateway.probe_hermes", return_value=report):
            await handle_mobile_gateway(ws)
            await handle_mobile_gateway(ws)

        self.assertEqual(seen_credentials, ["verified-loopback-token"])
        handler.assert_awaited_once_with(ws)
        ws.close.assert_awaited_once_with(
            code=4401,
            reason="Authentication required",
        )


if __name__ == "__main__":
    unittest.main()
