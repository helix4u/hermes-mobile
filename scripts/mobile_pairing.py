"""Ephemeral one-use pairing for the desktop-bound proxy's verified credential."""
import hmac
import secrets
import threading
import time


class PairingCodes:
    ttl = 300

    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.lock = threading.Lock()
        self.code = ''
        self.expires = 0.0
        self.attempts = 0

    def issue(self):
        with self.lock:
            self.code = ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(12))
            self.expires = self.clock() + self.ttl
            self.attempts = 0
            return self.code

    def redeem(self, code):
        with self.lock:
            if not self.code or self.clock() >= self.expires or self.attempts >= 5:
                return False
            self.attempts += 1
            if not hmac.compare_digest(str(code).replace('-', '').replace(' ', '').upper(), self.code):
                return False
            self.code = ''
            return True


def install_pairing_routes(app, credential, host_allowed):
    from fastapi import Request
    from fastapi.responses import JSONResponse
    codes = PairingCodes()
    headers = {'Cache-Control': 'no-store', 'Pragma': 'no-cache'}

    @app.post('/_hermes-mobile/pair/{action}')
    async def pair(action: str, request: Request):
        if not credential:
            return JSONResponse({'detail': 'Pairing requires a desktop-bound Mobile host.'}, 409, headers=headers)
        if not host_allowed(request.headers.get('host', '')):
            return JSONResponse({'detail': 'Invalid host'}, 400, headers=headers)
        if action == 'start':
            token = request.headers.get('x-hermes-session-token', '')
            if not hmac.compare_digest(token.encode('utf-8'), credential.encode('utf-8')):
                return JSONResponse({'detail': 'Host authentication required'}, 401, headers=headers)
            return JSONResponse({'code': codes.issue(), 'expiresIn': codes.ttl}, headers=headers)
        if action != 'redeem':
            return JSONResponse({'detail': 'Unknown pairing action'}, 404, headers=headers)
        body = b''
        async for chunk in request.stream():
            body += chunk
            if len(body) > 256:
                return JSONResponse({'detail': 'Pairing request too large'}, 413, headers=headers)
        import json
        try:
            payload = json.loads(body)
            code = payload.get('code') if isinstance(payload, dict) else None
            if not isinstance(code, str) or not codes.redeem(code):
                raise ValueError()
        except (ValueError, TypeError):
            return JSONResponse({'detail': 'Invalid, expired, or already used pairing code. Generate a new code on the host.'}, 403, headers=headers)
        return JSONResponse({'token': credential}, headers=headers)
