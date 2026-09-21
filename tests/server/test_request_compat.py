from __future__ import annotations

import asyncio
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server-plugin"))
from mobile_server.request_compat import CompatibleMobileWebSocket, RequestCompatibility


def question(rid="srq-1", method="approval", sid="session-a", **params):
    return {"jsonrpc": "2.0", "id": rid, "method": method,
            "params": {"session_id": sid, **params}}


def answer(method="approval.respond", **params):
    return {"jsonrpc": "2.0", "id": 12, "method": method, "params": params}


class RequestCompatibilityTests(unittest.TestCase):
    def test_ready_advertises_adapter_capability_once_and_swallows_its_receipt(self):
        ready = {"jsonrpc": "2.0", "method": "event", "params": {"type": "gateway.ready", "payload": {}}}
        bridge = RequestCompatibility()
        phone, core = bridge.from_core(ready)
        self.assertEqual(phone, [ready])
        self.assertEqual(core[0]["method"], "client.capabilities")
        self.assertEqual(core[0]["params"], {"server_requests": True})
        self.assertEqual(bridge.from_core(ready), ([ready], []))
        self.assertEqual(bridge.from_core({"id": core[0]["id"], "result": {"server_requests": ["approval"]}}), ([], []))
        self.assertEqual(bridge.from_core({"id": core[0]["id"], "error": {"code": -32601}}), ([], []))
        self.assertEqual(len(RequestCompatibility().from_core(ready)[1]), 1)

    def test_old_protocol_is_unchanged(self):
        bridge = RequestCompatibility()
        event = {"method": "event", "params": {"type": "approval.request", "payload": {"command": "test"}}}
        reply = answer(session_id="session-a", choice="once")
        self.assertEqual(bridge.from_core(event), ([event], []))
        self.assertEqual(bridge.from_phone(reply), ([], [reply]))

    def test_unique_legacy_approval_is_bound_to_the_received_request(self):
        bridge = RequestCompatibility()
        phone, core = bridge.from_core(question(command="test", request_id="queue-id"))
        self.assertFalse(core)
        self.assertEqual(phone[0]["params"]["payload"]["request_id"], "srq-1")
        receipt, replies = bridge.from_phone(answer(session_id="session-a", choice="once"))
        self.assertEqual(receipt[0]["id"], 12)
        self.assertEqual(replies, [{"jsonrpc": "2.0", "id": "srq-1", "result": {"choice": "once"}}])
        self.assertFalse(bridge.pending)

    def test_answers_preserve_kind_and_value_without_retaining_secrets(self):
        for kind, key in (("clarify", "answer"), ("sudo", "password"), ("secret", "value")):
            with self.subTest(kind=kind):
                bridge = RequestCompatibility()
                bridge.from_core(question(method=kind))
                _, replies = bridge.from_phone(answer(f"{kind}.respond", request_id="srq-1", **{key: "synthetic-value"}))
                result_key = "value" if kind == "sudo" else key
                self.assertEqual(replies[0]["result"], {result_key: "synthetic-value"})
                self.assertNotIn("synthetic-value", repr(vars(bridge)))

    def test_cross_session_wrong_kind_and_duplicate_replies_fail_closed(self):
        bridge = RequestCompatibility()
        bridge.from_core(question())
        for message in (answer(session_id="session-b", choice="once"),
                        answer("secret.respond", request_id="srq-1", value="synthetic"),
                        answer(request_id="srq-1", session_id="session-b", choice="once")):
            phone, core = bridge.from_phone(message)
            self.assertIn("error", phone[0])
            self.assertFalse(core)
        bridge.from_phone(answer(request_id="srq-1", choice="deny"))
        phone, core = bridge.from_phone(answer(request_id="srq-1", choice="once"))
        self.assertIn("error", phone[0])
        self.assertFalse(core)

    def test_overlapping_approvals_require_an_exact_id_not_an_arbitrary_queue_head(self):
        bridge = RequestCompatibility()
        bridge.from_core(question())
        bridge.from_core(question("srq-2"))
        phone, core = bridge.from_phone(answer(session_id="session-a", choice="once"))
        self.assertIn("error", phone[0])
        self.assertFalse(core)
        _, core = bridge.from_phone(answer(request_id="srq-2", session_id="session-a", choice="deny"))
        self.assertEqual(core[0]["id"], "srq-2")
        self.assertIn("srq-1", bridge.pending)

    def test_cancelled_card_cannot_approve_its_replacement(self):
        bridge = RequestCompatibility()
        bridge.from_core(question())
        expired, _ = bridge.from_core({"method": "event", "params": {
            "type": "request.cancel", "payload": {"id": "srq-1", "reason": "timeout"}}})
        self.assertEqual(expired[0]["params"]["type"], "approval.expire")
        bridge.from_core(question("srq-2"))
        phone, core = bridge.from_phone(answer(session_id="session-a", choice="once"))
        self.assertIn("error", phone[0])
        self.assertFalse(core)

    def test_replay_reconstructs_questions_once(self):
        bridge = RequestCompatibility()
        response = {"jsonrpc": "2.0", "id": 2, "result": {"open_requests": [question()]}}
        phone, core = bridge.from_core(response)
        self.assertEqual(len(phone), 2)
        self.assertFalse(core)
        self.assertEqual(bridge.from_core(response), ([response], []))

    def test_unsupported_requests_fail_immediately_without_inventing_an_answer(self):
        phone, core = RequestCompatibility().from_core(question(method="vault.unlock_prompt"))
        self.assertFalse(phone)
        self.assertEqual(core[0]["error"]["code"], -32601)

    def test_capacity_is_bounded(self):
        bridge = RequestCompatibility()
        for i in range(140):
            bridge.from_core(question(f"srq-{i}", method="clarify"))
        self.assertEqual(len(bridge.pending), 128)

    def test_raw_response_cannot_answer_another_sockets_request(self):
        bridge = RequestCompatibility()
        bridge.from_core(question())
        foreign = {"jsonrpc": "2.0", "id": "foreign-request", "result": {"choice": "once"}}
        self.assertEqual(bridge.from_phone(foreign), ([], []))
        self.assertIn("srq-1", bridge.pending)


class WebSocketCompatibilityTests(unittest.IsolatedAsyncioTestCase):
    async def test_advertisement_precedes_a_phone_request_after_ready(self):
        class Socket:
            def __init__(self):
                self.input = asyncio.Queue()
            async def receive_text(self):
                return await self.input.get()
            async def send_text(self, _text):
                await self.input.put(json.dumps({"id": 1, "method": "session.list", "params": {}}))
        bridge = CompatibleMobileWebSocket(Socket())
        try:
            await bridge.send_text(json.dumps({"method": "event", "params": {"type": "gateway.ready", "payload": {}}}))
            first = json.loads(await asyncio.wait_for(bridge.receive_text(), 2))
            second = json.loads(await asyncio.wait_for(bridge.receive_text(), 2))
            self.assertEqual(first["method"], "client.capabilities")
            self.assertEqual(second["method"], "session.list")
        finally:
            await bridge.dispose()

    async def test_wire_translation_keeps_one_reader_and_preserves_other_frames(self):
        class Socket:
            def __init__(self):
                self.input = asyncio.Queue()
                self.sent = []
            async def receive_text(self):
                return await self.input.get()
            async def send_text(self, text):
                self.sent.extend(json.loads(line) for line in text.splitlines())
        socket = Socket()
        bridge = CompatibleMobileWebSocket(socket)
        try:
            await bridge.send_text(json.dumps(question(method="clarify", question="Which one?")))
            await socket.input.put(json.dumps(answer("clarify.respond", request_id="srq-1", answer="second")))
            response = json.loads(await asyncio.wait_for(bridge.receive_text(), 2))
            self.assertEqual(response, {"jsonrpc": "2.0", "id": "srq-1", "result": {"answer": "second"}})
            await socket.input.put(json.dumps({"id": 22, "method": "gateway.ping", "params": {}}))
            self.assertEqual(json.loads(await asyncio.wait_for(bridge.receive_text(), 2))["method"], "gateway.ping")
            await bridge.send_text(json.dumps(question("srq-unsupported", method="window.read")))
            unsupported = json.loads(await asyncio.wait_for(bridge.receive_text(), 2))
            self.assertEqual(unsupported["error"]["code"], -32601)
        finally:
            await bridge.dispose()
        self.assertTrue(bridge._reader.done())
        self.assertFalse(bridge._compat.pending)


if __name__ == "__main__":
    unittest.main()
