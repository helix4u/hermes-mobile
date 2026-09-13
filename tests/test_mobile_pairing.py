import sys
import unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from mobile_pairing import PairingCodes, install_pairing_routes


class PairingTest(unittest.TestCase):
    def test_expiry_attempt_limit_and_one_use(self):
        now = [100.0]
        state = PairingCodes(lambda: now[0])
        code = state.issue()
        now[0] += 301
        self.assertFalse(state.redeem(code))
        code = state.issue()
        for _ in range(5):
            self.assertFalse(state.redeem('wrong'))
        self.assertFalse(state.redeem(code))
        code = state.issue()
        with ThreadPoolExecutor(max_workers=4) as pool:
            self.assertEqual(sum(pool.map(state.redeem, [code] * 4)), 1)

    def test_http_auth_host_and_no_store(self):
        app = FastAPI()
        install_pairing_routes(app, 'synthetic-only-credential', lambda host: host == 'testserver')
        with TestClient(app) as client:
            self.assertEqual(client.post('/_hermes-mobile/pair/start').status_code, 401)
            self.assertEqual(client.post('/_hermes-mobile/pair/start', headers=[(b'x-hermes-session-token', b'\xff')]).status_code, 401)
            headers = {'x-hermes-session-token': 'synthetic-only-credential'}
            start = client.post('/_hermes-mobile/pair/start', headers=headers)
            code = start.json()['code']
            self.assertEqual(start.headers['cache-control'], 'no-store')
            self.assertEqual(client.post('/_hermes-mobile/pair/redeem', json={'code':code}, headers={'host':'foreign.test'}).status_code, 400)
            self.assertEqual(client.post('/_hermes-mobile/pair/redeem', content='x'*257).status_code, 413)
            result = client.post('/_hermes-mobile/pair/redeem', json={'code': code})
            self.assertEqual(result.json(), {'token':'synthetic-only-credential'})
            self.assertEqual(result.headers['cache-control'], 'no-store')
            self.assertEqual(client.post('/_hermes-mobile/pair/redeem', json={'code': code}).status_code, 403)

    def test_proxy_route_precedes_the_upstream_catchall(self):
        from mobile_proxy import create_app
        with TestClient(create_app(upstream='http://127.0.0.1:1', allowed_host='host.example', client_token='synthetic', upstream_token='upstream')) as client:
            response = client.post('/_hermes-mobile/pair/start', headers={'host':'host.example','x-hermes-session-token':'synthetic'})
            self.assertEqual(response.status_code, 200)
            self.assertIn('code', response.json())

if __name__ == '__main__': unittest.main()
