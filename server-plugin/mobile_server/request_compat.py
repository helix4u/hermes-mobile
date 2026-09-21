"""Per-socket adapter from core server requests to the Mobile v1 question wire.

No private Hermes imports. Authentication stays in gateway.py. Request metadata
is connection-local and bounded. Answers, passwords and secret values are never
journaled. Older core event/respond pairs pass through unchanged.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
from dataclasses import dataclass
from typing import Any


_ANSWER_FIELDS = {"approval": "choice", "clarify": "answer", "sudo": "password", "secret": "value"}
_MAX_PENDING = 128
_CAPABILITIES_ID = "hermes-mobile-adapter-capabilities"


@dataclass(frozen=True)
class PendingQuestion:
    id: str
    method: str
    session_id: str


class RequestCompatibility:
    """Pure translation state. Returned pairs are (to_phone, to_core) frames."""

    def __init__(self) -> None:
        self.pending: dict[str, PendingQuestion] = {}
        self.modern = False
        self.unsafe_idless_sessions: set[str] = set()
        self.disable_idless = False
        self.capabilities_announced = False

    def _block_idless(self, session_id: str) -> None:
        if len(self.unsafe_idless_sessions) >= _MAX_PENDING:
            self.disable_idless = True
        else:
            self.unsafe_idless_sessions.add(session_id)

    @staticmethod
    def _error(rid: Any, message: str) -> dict:
        return {"jsonrpc": "2.0", "id": rid, "error": {"code": -32602, "message": message}}

    def from_core(self, frame: dict) -> tuple[list[dict], list[dict]]:
        method, rid = frame.get("method"), frame.get("id")
        if not method and rid == _CAPABILITIES_ID:
            # Older cores reject this optional handshake. It is adapter-owned,
            # not a failed phone request, and must never reach the UI.
            return [], []
        if method and method != "event" and rid is not None:
            self.modern = True
            params = frame.get("params")
            params = params if isinstance(params, dict) else {}
            sid = str(params.get("session_id") or "")
            if method not in _ANSWER_FIELDS or not isinstance(rid, str):
                return [], [{"jsonrpc": "2.0", "id": rid,
                             "error": {"code": -32601, "message": "Mobile v1 cannot answer this request kind"}}]
            if rid in self.pending:
                return [], []  # duplicate delivery or reconnect replay within this socket
            if len(self.pending) >= _MAX_PENDING:
                return [], [self._error(rid, "Mobile question capacity reached")]
            if method == "approval" and any(q.method == method and q.session_id == sid for q in self.pending.values()):
                self._block_idless(sid)
            self.pending[rid] = PendingQuestion(rid, method, sid)
            payload = {**params, "request_id": rid}
            payload.pop("session_id", None)
            return [{"jsonrpc": "2.0", "method": "event", "params": {
                "type": f"{method}.request", "session_id": sid, "payload": payload}}], []

        event = frame.get("params") if method == "event" else None
        if isinstance(event, dict) and event.get("type") == "request.cancel":
            payload = event.get("payload") or {}
            question = self.pending.pop(str(payload.get("id") or ""), None)
            if question:
                if question.method == "approval":
                    self._block_idless(question.session_id)
                return [{"jsonrpc": "2.0", "method": "event", "params": {
                    "type": f"{question.method}.expire", "session_id": question.session_id,
                    "payload": {"request_id": question.id, "reason": payload.get("reason")}}}], []
            return [frame], []

        phone, core = [frame], []
        if isinstance(event, dict) and event.get("type") == "gateway.ready" and not self.capabilities_announced:
            self.capabilities_announced = True
            core.append({"jsonrpc": "2.0", "id": _CAPABILITIES_ID,
                         "method": "client.capabilities", "params": {"server_requests": True}})
        result = frame.get("result")
        # New core returns pending questions in resume/activate/replay results.
        # The old client does not interpret that field, so project them as events.
        if isinstance(result, dict) and isinstance(result.get("open_requests"), list):
            for question in result["open_requests"]:
                if isinstance(question, dict):
                    outgoing, replies = self.from_core(question)
                    phone.extend(outgoing)
                    core.extend(replies)
        return phone, core

    def from_phone(self, frame: dict) -> tuple[list[dict], list[dict]]:
        method = frame.get("method")
        if self.modern and method is None and ("result" in frame or "error" in frame):
            # Do not let a raw response bypass this socket's request ownership.
            rid = frame.get("id")
            if not isinstance(rid, str) or rid not in self.pending:
                return [], []
            self.pending.pop(rid)
            return [], [frame]
        if not self.modern or not isinstance(method, str) or not method.endswith(".respond"):
            return [], [frame]
        kind = method.removesuffix(".respond")
        if kind not in _ANSWER_FIELDS:
            return [], [frame]
        params = frame.get("params")
        params = params if isinstance(params, dict) else {}
        request_id = params.get("request_id")
        question = self.pending.get(request_id) if isinstance(request_id, str) else None
        if not request_id and kind == "approval":
            sid = str(params.get("session_id") or "")
            candidates = [q for q in self.pending.values() if q.method == kind and q.session_id == sid]
            if not self.disable_idless and sid not in self.unsafe_idless_sessions and len(candidates) == 1:
                question = candidates[0]
        sid = params.get("session_id")
        if not question or question.method != kind or (sid is not None and sid != question.session_id):
            return [self._error(frame.get("id"),
                "This question is expired, ambiguous, or belongs to another session. Answer the exact request in Desktop or use a Mobile client that sends request IDs.")], []
        field = _ANSWER_FIELDS[kind]
        value = params.get(field)
        if not isinstance(value, str):
            return [self._error(frame.get("id"), "A text answer is required")], []
        if kind == "approval" and value not in {"once", "deny"}:
            return [self._error(frame.get("id"), "Mobile v1 supports one-time approval or denial only")], []
        self.pending.pop(question.id)
        # Mobile v1 names sudo input "password". Core's one-string request
        # result uses "value" for both sudo and secrets.
        result_field = "value" if kind == "sudo" else field
        response = {"jsonrpc": "2.0", "id": question.id, "result": {result_field: value}}
        # Receipt means forwarded, not that agent execution completed.
        return [{"jsonrpc": "2.0", "id": frame.get("id"), "result": {"forwarded": True}}], [response]


class CompatibleMobileWebSocket:
    """Duck-typed WebSocket facade at the documented handle_ws transport seam."""

    def __init__(self, websocket: Any) -> None:
        self._websocket = websocket
        self._compat = RequestCompatibility()
        self._incoming: asyncio.Queue = asyncio.Queue(maxsize=256)
        self._reader: asyncio.Task | None = None
        self._send_lock = asyncio.Lock()

    def __getattr__(self, name: str) -> Any:
        return getattr(self._websocket, name)

    async def _send(self, frames: list[dict]) -> None:
        if frames:
            async with self._send_lock:
                await self._websocket.send_text("\n".join(json.dumps(frame, ensure_ascii=False) for frame in frames))

    async def send_text(self, raw: str) -> None:
        phone, core = [], []
        for line in raw.splitlines():
            if not line.strip():
                continue
            frame = json.loads(line)
            outgoing, replies = self._compat.from_core(frame)
            phone.extend(outgoing)
            core.extend(replies)
        for frame in core:
            await self._incoming.put(json.dumps(frame))
        # Advertise before the phone can react to gateway.ready and send work.
        await self._send(phone)

    async def _read_phone(self) -> None:
        try:
            while True:
                raw = await self._websocket.receive_text()
                try:
                    frame = json.loads(raw)
                except (ValueError, TypeError):
                    await self._incoming.put(raw)  # core owns parse-error behavior
                    continue
                if not isinstance(frame, dict):
                    await self._incoming.put(raw)
                    continue
                phone, core = self._compat.from_phone(frame)
                for reply in core:
                    await self._incoming.put(json.dumps(reply))
                await self._send(phone)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await self._incoming.put(exc)

    async def receive_text(self) -> str:
        if self._reader is None:
            self._reader = asyncio.create_task(self._read_phone())
        frame = await self._incoming.get()
        if isinstance(frame, Exception):
            raise frame
        return frame

    async def dispose(self) -> None:
        if self._reader is not None:
            self._reader.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._reader
        self._compat.pending.clear()
        while not self._incoming.empty():
            self._incoming.get_nowait()
