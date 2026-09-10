from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from fastapi import FastAPI, HTTPException
import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server-plugin"))
from mobile_server import api, voice_diagnostics as diagnostics
from mobile_server.diagnostics_adapter import diagnostics_home


def payload(**updates):
    return {"schema": 1, "optIn": True, "transport": "native", "build": "0.1.0+abcdef0",
            "entries": [{"phase": "review.unverified", "elapsedMs": 100, "epoch": 2, "muted": False, "tracks": 1}], **updates}


class DiagnosticsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name)
        diagnostics._requests.clear()
        self.app = FastAPI()
        self.app.include_router(api.router, prefix="/api/plugins/hermes-mobile")
        self.endpoint = "/api/plugins/hermes-mobile/v1/voice-diagnostics"
        self.auth = Mock()
        self.report = SimpleNamespace(gateway_available=True, http_auth=self.auth)
        self.probe = patch.object(api, "probe_hermes", return_value=self.report)
        self.probe.start()
        self.addCleanup(self.probe.stop)
        self.resolve = patch.object(api, "diagnostics_home", return_value=self.home)
        self.resolve_mock = self.resolve.start()
        self.addCleanup(self.resolve.stop)

    async def post(self, body=None, **kwargs):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test") as client:
            return await client.post(self.endpoint, json=payload() if body is None else body, **kwargs)

    def rows(self, home=None):
        return [json.loads(line) for line in ((home or self.home) / "logs/mobile-voice-diagnostics.jsonl").read_text().splitlines()]

    async def test_registered_route_uses_canonical_auth_and_selected_profile(self):
        self.endpoint += "?profile=synthetic"
        response = await self.post()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"schema": 1, "accepted": 1})
        self.auth.assert_called_once()
        self.resolve_mock.assert_called_once_with("synthetic")
        self.assertEqual(self.rows()[0]["phase"], "review.unverified")
        self.assertEqual(set(self.rows()[0]), {"receivedAt", "schema", "transport", "build", "phase", "elapsedMs", "epoch", "muted", "tracks"})

    async def test_unauthenticated_request_never_parses_body_or_resolves_home(self):
        self.auth.side_effect = HTTPException(401, "Authentication required")
        with patch.object(api, "read_payload", side_effect=AssertionError("must not read")):
            self.assertEqual((await self.post()).status_code, 401)
        self.resolve_mock.assert_not_called()
        self.assertFalse((self.home / "logs").exists())

    async def test_incompatible_gate_fails_closed(self):
        self.report.gateway_available = False
        self.assertEqual((await self.post()).status_code, 503)
        self.auth.assert_not_called()
        self.resolve_mock.assert_not_called()

    async def test_opt_in_and_strict_fields_required(self):
        for bad in (payload(optIn=False), payload(schema=True), payload(token="private"),
                    payload(build="https://private.example"), payload(transport="secret"),
                    payload(entries=[]), payload(entries=payload()["entries"] * 33)):
            with self.subTest(body=bad):
                self.assertEqual((await self.post(bad)).status_code, 400)
        self.resolve_mock.assert_not_called()

    async def test_rejects_raw_content_unknown_phases_and_invalid_numeric_fields(self):
        for extra in ({"transcript": "private"}, {"phase": "tool.user_supplied_name.started"},
                      {"phase": []}, {"elapsedMs": 120001}, {"epoch": True}, {"tracks": -1}, {"muted": 1}):
            bad = payload(entries=[{**payload()["entries"][0], **extra}])
            self.assertEqual((await self.post(bad)).status_code, 400)
        self.assertFalse((self.home / "logs").exists())

    async def test_accepts_all_fixed_review_states(self):
        states = ("idle", "interrupted", "awaiting_transcript", "content_mismatch", "ready", "awaiting_audio")
        entries = [{**payload()["entries"][0], "phase": f"review.state.{state}"} for state in states]
        self.assertEqual((await self.post(payload(entries=entries))).status_code, 200)
        self.assertEqual([row["phase"] for row in self.rows()], [entry["phase"] for entry in entries])

    async def test_request_length_and_chunked_body_are_bounded(self):
        self.assertEqual((await self.post(headers={"content-length": "20000"})).status_code, 413)
        async def chunks():
            yield b" " * 10000
            yield b" " * 10000
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test") as client:
            response = await client.post(self.endpoint, content=chunks())
        self.assertEqual(response.status_code, 413)
        self.resolve_mock.assert_not_called()

    async def test_malformed_json_is_safe_and_unlogged(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test") as client:
            response = await client.post(self.endpoint, content=b'{"token": "private"')
        self.assertEqual(response.status_code, 400)
        self.assertNotIn("private", response.text)
        self.assertFalse((self.home / "logs").exists())

    async def test_profile_spools_are_separate(self):
        self.resolve_mock.side_effect = lambda profile: self.home / profile
        for profile in ("first", "second"):
            self.endpoint = f"/api/plugins/hermes-mobile/v1/voice-diagnostics?profile={profile}"
            self.assertEqual((await self.post()).status_code, 200)
        self.assertEqual(len(self.rows(self.home / "first")), 1)
        self.assertEqual(len(self.rows(self.home / "second")), 1)

    async def test_storage_failure_does_not_expose_host_paths(self):
        with patch.object(api, "append_entries", side_effect=OSError("private host path")):
            response = await self.post()
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private", response.text)

    def test_retention_and_byte_and_row_bounds(self):
        entries = diagnostics.validate_payload(payload())
        with patch.object(diagnostics.time, "time", return_value=100):
            diagnostics.append_entries(self.home, entries)
        with patch.object(diagnostics.time, "time", return_value=100 + diagnostics.RETENTION_SECONDS + 1):
            diagnostics.append_entries(self.home, entries)
        self.assertEqual(len(self.rows()), 1)
        with patch.object(diagnostics, "MAX_SPOOL_BYTES", 1000), patch.object(diagnostics, "MAX_SPOOL_ROWS", 3):
            diagnostics.append_entries(self.home, entries * 32)
        self.assertLessEqual(len(self.rows()), 3)
        self.assertLessEqual((self.home / "logs/mobile-voice-diagnostics.jsonl").stat().st_size, 1000)
        self.assertEqual(list((self.home / "logs").glob(".mobile-voice-*")), [])

    def test_concurrent_writes_preserve_both_batches(self):
        first = diagnostics.validate_payload(payload())
        second = diagnostics.validate_payload(payload(entries=[{**payload()["entries"][0], "epoch": 3}]))
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda batch: diagnostics.append_entries(self.home, batch), (first, second)))
        self.assertEqual(results, [1, 1])
        self.assertEqual({row["epoch"] for row in self.rows()}, {2, 3})

    def test_disk_rows_are_revalidated_without_preserving_extra_private_fields(self):
        entries = diagnostics.validate_payload(payload())
        diagnostics.append_entries(self.home, entries)
        path = self.home / "logs/mobile-voice-diagnostics.jsonl"
        row = self.rows()[0]
        path.write_text(json.dumps({**row, "transcript": "private"}) + "\n")
        diagnostics.append_entries(self.home, entries)
        self.assertEqual(len(self.rows()), 2)
        self.assertNotIn("private", path.read_text())

    async def test_aggregate_rate_limit_is_bounded_and_has_retry_after(self):
        with patch.object(diagnostics, "MAX_REQUESTS_PER_MINUTE", 1):
            self.assertEqual((await self.post()).status_code, 200)
            response = await self.post()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["retry-after"], "60")
        self.assertEqual(len(self.rows()), 1)


class ProfileAdapterTests(unittest.TestCase):
    def test_uses_public_profile_authority_and_rejects_invalid_or_missing_profile(self):
        def validate(profile):
            if profile not in ("synthetic", "missing"):
                raise ValueError("invalid")
        constants = SimpleNamespace(get_hermes_home=lambda: Path("effective-home"))
        profiles = SimpleNamespace(validate_profile_name=validate, profile_exists=lambda name: name != "missing",
                                   get_profile_dir=lambda name: Path("profiles") / name)
        with patch.dict(sys.modules, {"hermes_constants": constants, "hermes_cli.profiles": profiles}):
            self.assertEqual(diagnostics_home(None), Path("effective-home"))
            self.assertEqual(diagnostics_home("synthetic"), Path("profiles/synthetic"))
            for name, status in (("../escape", 400), ("missing", 404)):
                with self.assertRaises(HTTPException) as raised:
                    diagnostics_home(name)
                self.assertEqual(raised.exception.status_code, status)


if __name__ == "__main__":
    unittest.main()
