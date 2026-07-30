import unittest

import httpx

from scripts.mobile_proxy import (
    AUDIO_UPSTREAM_TIMEOUT_SECONDS,
    DEFAULT_UPSTREAM_TIMEOUT_SECONDS,
    UPSTREAM_CONNECT_TIMEOUT_SECONDS,
    _request_timeout,
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


if __name__ == "__main__":
    unittest.main()
