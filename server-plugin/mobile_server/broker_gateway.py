"""Mobile v1 wire compatibility over a remote authenticated broker, not handle_ws."""
from __future__ import annotations

import asyncio
import json
import logging

from websockets.asyncio.client import connect

from .request_compat import RequestCompatibility


class NoRedirectConnect(connect):
    def process_redirect(self, exc: Exception) -> Exception:
        return exc


async def relay_gateway(phone, binding, *, connect_socket=NoRedirectConnect, profile='default') -> None:
    compat = RequestCompatibility()
    lock = asyncio.Lock()
    tasks: list[asyncio.Task] = []

    async def current() -> bool:
        return await asyncio.to_thread(binding.generation_current)

    try:
        if not await asyncio.to_thread(binding.verify_current):
            await phone.close(code=4410, reason="Broker identity changed")
            return
        native = getattr(binding, 'protocol', None) == 'hermes-gateway-v1'
        if native:
            target, protocols = await asyncio.to_thread(binding.websocket_target, profile)
            authorization = {'subprotocols': protocols}
        else:
            target = binding.origin.replace("http://", "ws://", 1) + "/api/ws"
            authorization = {'additional_headers': {"Authorization": "Bearer " + binding.credential}}
        async with connect_socket(
            target, **authorization,
            proxy=None, open_timeout=5, close_timeout=2, max_size=None,
            logger=logging.Logger("mobile-broker-ws", level=logging.CRITICAL + 1),
        ) as upstream:
            if not await current():
                await phone.close(code=4410, reason="Broker identity changed")
                return
            await phone.accept()

            async def send_core(frames: list[dict]) -> None:
                if frames:
                    async with lock:
                        if not await current():
                            raise ConnectionError("Broker identity changed")
                        await upstream.send("\n".join(json.dumps(f) for f in frames))

            async def send_phone(frames: list[dict]) -> None:
                if frames:
                    if not await current():
                        raise ConnectionError("Broker identity changed")
                    await phone.send_text("\n".join(json.dumps(f) for f in frames))

            async def from_core() -> None:
                async for raw in upstream:
                    if not isinstance(raw, str):
                        raise ValueError("Mobile gateway requires text frames")
                    for line in raw.splitlines():
                        if not line.strip():
                            continue
                        frame = json.loads(line)
                        if native and frame.get('method') == 'event' and frame.get('params', {}).get('type') == 'gateway.ready':
                            frame['params']['payload'].update(native_gateway_protocol=binding.protocol, shared_runtime=True)
                        phone_frames, core_frames = compat.from_core(frame)
                        # Capability announcement precedes phone reaction to ready.
                        await send_core(core_frames)
                        await send_phone(phone_frames)

            async def from_phone() -> None:
                while True:
                    raw = await phone.receive_text()
                    if not await current():
                        raise ConnectionError("Broker identity changed")
                    for line in raw.splitlines():
                        if not line.strip():
                            continue
                        try:
                            frame = json.loads(line)
                        except ValueError:
                            await send_core_raw(line)
                            continue
                        if not isinstance(frame, dict):
                            await send_core_raw(line)
                            continue
                        phone_frames, core_frames = compat.from_phone(frame)
                        await send_core(core_frames)
                        await send_phone(phone_frames)

            async def send_core_raw(raw: str) -> None:
                async with lock:
                    if not await current():
                        raise ConnectionError("Broker identity changed")
                    await upstream.send(raw)

            tasks = [asyncio.create_task(from_core()), asyncio.create_task(from_phone())]
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
    except Exception:
        # Never return/log exception text, URLs, headers or answer values.
        try:
            await phone.close(code=1011, reason="Broker transport unavailable")
        except Exception:
            pass
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        compat.pending.clear()
        try:
            await phone.close(code=1000, reason="Mobile bridge detached")
        except Exception:
            pass  # The peer may already have closed during transport cleanup.
