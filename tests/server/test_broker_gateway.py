import asyncio
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
sys.path.insert(0, str(ROOT / 'server-plugin'))
from scripts.mobile_proxy import create_app
from mobile_server.broker_gateway import relay_gateway
from mobile_server.tickets import TicketStore


class Binding:
    origin = 'http://127.0.0.1:24001'
    credential = 'synthetic-server-credential'
    scope = ('synthetic-home', 'broker-a', 'worker-a')
    current = True
    def verify_current(self): return self.current
    def generation_current(self): return self.current


class BrokerTicketTests(unittest.TestCase):
    def test_issuers_authenticate_and_ticket_cannot_replay_or_cross_apps(self):
        binding = Binding()
        credential = 'synthetic-mobile-credential'
        async def connected(ws, _binding):
            await ws.accept()
            await ws.send_json({'connected': True})
            await ws.close()
        with patch('mobile_server.broker_gateway.relay_gateway', side_effect=connected):
            app = create_app(upstream=binding.origin, allowed_host='fixture.test', client_token=credential,
                             upstream_token=binding.credential, broker_binding=binding)
            other = create_app(upstream=binding.origin, allowed_host='fixture.test', client_token=credential,
                               upstream_token=binding.credential, broker_binding=binding)
        with TestClient(app, base_url='http://127.0.0.1') as client, TestClient(other, base_url='http://127.0.0.1') as second:
            path = '/api/plugins/hermes-mobile/v1/ws-ticket'
            self.assertEqual(client.post(path).status_code, 401)
            headers = {'Authorization': 'Bearer ' + credential}
            self.assertEqual(client.post('/api/auth/ws-ticket', headers=headers).status_code, 409)
            self.assertEqual(client.post(path, headers={**headers, 'Origin': 'https://evil.test'}).status_code, 401)
            ticket = client.post(path, headers=headers).json()['ticket']
            gateway_path = '/api/plugins/hermes-mobile/v1/gateway?mobile_ticket=' + ticket
            # Starlette's relative WS URL uses testserver, not HTTP base_url.
            # Verify that failure stage before exercising the real ticket gate.
            with self.assertRaises(WebSocketDisconnect) as wrong_host:
                with client.websocket_connect(gateway_path): pass
            self.assertEqual(wrong_host.exception.code, 4403)
            self.assertEqual(wrong_host.exception.reason, 'Invalid host')

            gateway = 'ws://127.0.0.1' + gateway_path
            with self.assertRaises(WebSocketDisconnect) as foreign_ticket:
                with second.websocket_connect(gateway): pass
            self.assertEqual(foreign_ticket.exception.code, 4401)
            self.assertEqual(foreign_ticket.exception.reason, 'Authentication required')
            with client.websocket_connect(gateway) as socket:
                self.assertTrue(socket.receive_json()['connected'])
            with self.assertRaises(WebSocketDisconnect) as replay:
                with client.websocket_connect(gateway): pass
            self.assertEqual(replay.exception.code, 4401)
            self.assertEqual(replay.exception.reason, 'Authentication required')
            with self.assertRaises(WebSocketDisconnect) as bypass:
                with client.websocket_connect('ws://127.0.0.1/api/ws'): pass
            self.assertEqual(bypass.exception.code, 4403)
            self.assertEqual(bypass.exception.reason, 'Unsupported Mobile gateway path')

    def test_ticket_store_is_bounded_expiring_and_instance_scoped(self):
        first, second = TicketStore(('home-a', 'generation-a')), TicketStore(('home-b', 'generation-b'))
        ticket = first.mint('synthetic', now=100)
        self.assertIsNone(second.consume(ticket, now=101))
        self.assertIsNone(first.consume(ticket, now=131))
        ticket = first.mint('synthetic', now=200)
        first.dispose()
        self.assertIsNone(first.consume(ticket, now=201))


class RelayTests(unittest.IsolatedAsyncioTestCase):
    async def test_actual_compatibility_orders_capabilities_and_preserves_key_and_exact_approval(self):
        binding = Binding()
        core_frames, phone_frames = [], []
        sent = asyncio.Event()
        inbound = asyncio.Queue()
        class Phone:
            async def accept(self): pass
            async def close(self, **_kwargs): pass
            async def receive_text(self): return await inbound.get()
            async def send_text(self, text):
                for line in text.splitlines():
                    frame = json.loads(line)
                    phone_frames.append(frame)
                    event = frame.get('params', {})
                    if event.get('type') == 'gateway.ready':
                        await inbound.put(json.dumps({'id': 'send-a', 'method': 'prompt.submit', 'params': {
                            'session_id': 'session-a', 'text': 'Synthetic prompt', 'submission_id': 'caller-key'}}))
                    if event.get('type') == 'approval.request':
                        await inbound.put(json.dumps({'id': 'answer-a', 'method': 'approval.respond', 'params': {
                            'session_id': 'session-a', 'request_id': event['payload']['request_id'], 'choice': 'once'}}))
        class Upstream:
            def __aiter__(self): return self.stream()
            async def stream(self):
                yield json.dumps({'method': 'event', 'params': {'type': 'gateway.ready', 'payload': {'shared_runtime': True}}})
                yield json.dumps({'id': 'question-a', 'method': 'approval', 'params': {'session_id': 'session-a'}})
                await asyncio.Future()
            async def send(self, text):
                for line in text.splitlines():
                    frame = json.loads(line)
                    core_frames.append(frame)
                    if frame.get('id') == 'question-a' and 'result' in frame: sent.set()
        class Connector:
            async def __aenter__(self): return Upstream()
            async def __aexit__(self, *_args): pass
        calls = []
        def connect(url, **kwargs):
            calls.append((url, kwargs))
            return Connector()
        task = asyncio.create_task(relay_gateway(Phone(), binding, connect_socket=connect))
        try:
            await asyncio.wait_for(sent.wait(), 2)
            self.assertEqual(core_frames[0]['method'], 'client.capabilities')
            prompt = next(f for f in core_frames if f.get('method') == 'prompt.submit')
            self.assertEqual(prompt['params']['submission_id'], 'caller-key')
            self.assertEqual(next(f for f in core_frames if f.get('id') == 'question-a')['result'], {'choice': 'once'})
            self.assertTrue(phone_frames[0]['params']['payload']['shared_runtime'])
            self.assertEqual(calls[0][0], 'ws://127.0.0.1:24001/api/ws')
            self.assertIsNone(calls[0][1]['proxy'])
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
