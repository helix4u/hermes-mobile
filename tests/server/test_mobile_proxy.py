import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import httpx

from scripts.mobile_proxy import (
    AUDIO_UPSTREAM_TIMEOUT_SECONDS,
    DEFAULT_UPSTREAM_TIMEOUT_SECONDS,
    UPSTREAM_CONNECT_TIMEOUT_SECONDS,
    _extract_injected_token,
    _read_credential_file,
    _request_headers,
    _request_timeout,
    _translated_ws_query,
)


class MobileProxyTimeoutTests(unittest.TestCase):
    def test_audio_routes_allow_blocking_provider_synthesis(self) -> None:
        timeout = _request_timeout("api/audio/speak")

        self.assertEqual(timeout.read, AUDIO_UPSTREAM_TIMEOUT_SECONDS)
        self.assertEqual(timeout.write, AUDIO_UPSTREAM_TIMEOUT_SECONDS)
        self.assertEqual(timeout.pool, AUDIO_UPSTREAM_TIMEOUT_SECONDS)
        self.assertEqual(timeout.connect, UPSTREAM_CONNECT_TIMEOUT_SECONDS)

    def test_non_audio_routes_keep_the_short_default(self) -> None:
        timeout = _request_timeout("/api/health")

        self.assertEqual(timeout.read, DEFAULT_UPSTREAM_TIMEOUT_SECONDS)
        self.assertEqual(timeout.write, DEFAULT_UPSTREAM_TIMEOUT_SECONDS)
        self.assertEqual(timeout.pool, DEFAULT_UPSTREAM_TIMEOUT_SECONDS)
        self.assertEqual(timeout.connect, UPSTREAM_CONNECT_TIMEOUT_SECONDS)

    def test_timeout_shape_is_accepted_by_httpx_requests(self) -> None:
        self.assertIsInstance(_request_timeout("api/audio/tts/providers"), httpx.Timeout)


class MobileProxyDesktopBridgeTests(unittest.TestCase):
    def test_reads_a_backend_lifetime_token_from_its_file(self) -> None:
        token = "b" * 43
        with TemporaryDirectory() as directory:
            token_path = Path(directory) / "backend.token"
            token_path.write_text(token, encoding="utf-8")

            self.assertEqual(_read_credential_file(str(token_path), "Desktop backend"), token)

    def test_extracts_only_a_valid_injected_loopback_token(self) -> None:
        token = "d" * 43

        self.assertEqual(
            _extract_injected_token(
                f'<script>window.__HERMES_SESSION_TOKEN__="{token}";</script>'
            ),
            token,
        )
        self.assertIsNone(
            _extract_injected_token(
                '<script>window.__HERMES_SESSION_TOKEN__="short";</script>'
            )
        )

    def test_replaces_phone_credentials_without_forwarding_them(self) -> None:
        headers = _request_headers(
            [
                (b"authorization", b"Bearer phone-token"),
                (b"x-hermes-session-token", b"phone-token"),
                (b"x-client", b"mobile"),
            ],
            "127.0.0.1:45678",
            replacement_token="desktop-token",
        )

        self.assertNotIn(("authorization", "Bearer phone-token"), headers)
        self.assertNotIn(("x-hermes-session-token", "phone-token"), headers)
        self.assertIn(("Authorization", "Bearer desktop-token"), headers)
        self.assertIn(("x-hermes-session-token", "desktop-token"), headers)
        self.assertIn(("x-client", "mobile"), headers)
        self.assertIn(("Host", "127.0.0.1:45678"), headers)

    def test_translates_only_the_matching_raw_websocket_token(self) -> None:
        self.assertEqual(
            _translated_ws_query("token=phone&channel=tui", "phone", "desktop"),
            "token=desktop&channel=tui",
        )
        self.assertEqual(
            _translated_ws_query("token=someone-else", "phone", "desktop"),
            "token=someone-else",
        )
        self.assertEqual(
            _translated_ws_query("ticket=one-time", "phone", "desktop"),
            "ticket=one-time",
        )


if __name__ == "__main__":
    unittest.main()
