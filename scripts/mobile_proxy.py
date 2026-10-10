"""Tailnet-only reverse proxy for the loopback-bound Hermes Mobile server.

Hermes intentionally rejects a public Host header when it is bound to
127.0.0.1. Tailscale Serve preserves the original tailnet hostname, so this
small loopback proxy validates that hostname and then rewrites the upstream
request to the loopback authority Hermes expects. It supports both HTTP and
WebSocket traffic and is not exposed directly outside the machine.
"""

from __future__ import annotations

import argparse
import asyncio
from collections.abc import Iterable
import hmac
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit

import httpx
import uvicorn
from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import JSONResponse, Response
from websockets.asyncio.client import connect as websocket_connect
from websockets.exceptions import ConnectionClosed


HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}

DEFAULT_UPSTREAM_TIMEOUT_SECONDS = 30.0
AUDIO_UPSTREAM_TIMEOUT_SECONDS = 14 * 60.0
UPSTREAM_CONNECT_TIMEOUT_SECONDS = 15.0
MIN_SESSION_TOKEN_LENGTH = 43
_INJECTED_TOKEN_RE = re.compile(
    r"window\.__HERMES_SESSION_TOKEN__\s*=\s*(\"(?:\\.|[^\"\\])*\")"
)


def _host_without_port(value: str) -> str:
    return value.rsplit(":", 1)[0].lower() if value.count(":") == 1 else value.lower()


def _request_timeout(path: str) -> httpx.Timeout:
    """Give blocking audio work time to finish without weakening every route."""
    timeout_seconds = (
        AUDIO_UPSTREAM_TIMEOUT_SECONDS
        if path.lstrip("/").startswith("api/audio/")
        else DEFAULT_UPSTREAM_TIMEOUT_SECONDS
    )
    return httpx.Timeout(
        timeout_seconds,
        connect=UPSTREAM_CONNECT_TIMEOUT_SECONDS,
    )


def _request_headers(
    raw_headers: Iterable[tuple[bytes, bytes]],
    upstream_authority: str | None,
    *,
    replacement_token: str | None = None,
) -> list[tuple[str, str]]:
    headers: list[tuple[str, str]] = []
    for raw_name, raw_value in raw_headers:
        name = raw_name.decode("latin-1")
        lower = name.lower()
        if lower in HOP_BY_HOP or lower.startswith("sec-websocket-") or lower in {
            "host",
            "content-length",
            "origin",
        } or (replacement_token is not None and lower in {
            "authorization",
            "x-hermes-session-token",
        }):
            continue
        headers.append((name, raw_value.decode("latin-1")))
    if replacement_token is not None:
        headers.extend(
            [
                ("Authorization", f"Bearer {replacement_token}"),
                ("x-hermes-session-token", replacement_token),
            ]
        )
    if upstream_authority:
        headers.append(("Host", upstream_authority))
    return headers


def _extract_injected_token(html: str) -> str | None:
    match = _INJECTED_TOKEN_RE.search(str(html or ""))
    if match is None:
        return None
    try:
        value = json.loads(match.group(1))
    except (TypeError, json.JSONDecodeError):
        return None
    return value if isinstance(value, str) and len(value) >= MIN_SESSION_TOKEN_LENGTH else None


def _presented_http_token(request: Request) -> str:
    token = request.headers.get("x-hermes-session-token", "").strip()
    if token:
        return token
    authorization = request.headers.get("authorization", "").strip()
    return authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""


def _translated_ws_query(query: str, client_token: str | None, upstream_token: str | None) -> str:
    if not query or not client_token or not upstream_token:
        return query
    translated: list[tuple[str, str]] = []
    for name, value in parse_qsl(query, keep_blank_values=True):
        translated.append(
            (name, upstream_token)
            if name == "token" and hmac.compare_digest(value, client_token)
            else (name, value)
        )
    return urlencode(translated)


def _discover_upstream_token(upstream: str) -> str:
    try:
        response = httpx.get(upstream.rstrip("/") + "/", timeout=10, follow_redirects=False)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise RuntimeError("could not read the Desktop backend session token") from exc
    token = _extract_injected_token(response.text)
    if token is None:
        raise RuntimeError("Desktop backend did not expose a valid loopback session token")
    return token


def _read_credential_file(raw_path: str, label: str) -> str:
    credential_path = Path(raw_path)
    if credential_path.is_symlink() or not credential_path.is_file():
        raise RuntimeError(f"{label} credential file is missing or unsafe")
    token = credential_path.read_text(encoding="utf-8").strip()
    if len(token) < MIN_SESSION_TOKEN_LENGTH:
        raise RuntimeError(f"{label} credential is missing or too short")
    return token


def create_app(
    *,
    upstream: str,
    allowed_host: str,
    client_token: str | None = None,
    upstream_token: str | None = None,
    broker_binding=None,
) -> FastAPI:
    if bool(client_token) != bool(upstream_token):
        raise ValueError("client_token and upstream_token must be configured together")
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    client = httpx.AsyncClient(
        timeout=_request_timeout(""),
        follow_redirects=False,
        **({"trust_env": False} if broker_binding is not None else {}),
    )
    upstream_http = upstream.rstrip("/")
    upstream_ws = upstream_http.replace("http://", "ws://", 1).replace(
        "https://", "wss://", 1
    )
    upstream_authority = httpx.URL(upstream_http).netloc.decode("ascii")
    expected_host = allowed_host.lower().rstrip(".")

    def host_allowed(value: str) -> bool:
        actual = _host_without_port(value).rstrip(".")
        return actual in {expected_host, "127.0.0.1", "localhost"}

    from mobile_pairing import install_pairing_routes
    install_pairing_routes(app, client_token, host_allowed)

    if broker_binding is not None:
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server-plugin"))
        from mobile_server.broker_gateway import relay_gateway
        from mobile_server.tickets import TicketStore, TTL_SECONDS
        if not client_token or upstream != broker_binding.origin or upstream_token != broker_binding.credential:
            raise ValueError("Broker binding does not match configured upstream")
        tickets = TicketStore(broker_binding.scope)

        def origin_allowed(value: str) -> bool:
            if not value:
                return True  # Native ticket-only upgrades have no browser Origin.
            try:
                origin = urlsplit(value)
                return (not origin.username and not origin.password and not origin.query and not origin.fragment
                        and origin.path in ("", "/") and host_allowed(origin.netloc)
                        and (origin.scheme == "https" or (origin.scheme == "http" and
                             origin.hostname in {"localhost", "127.0.0.1"})))
            except ValueError:
                return False

        def phone_authenticated(request: Request) -> bool:
            return (host_allowed(request.headers.get("host", ""))
                    and origin_allowed(request.headers.get("origin", ""))
                    and hmac.compare_digest(_presented_http_token(request), client_token))

        @app.post("/api/auth/ws-ticket")
        async def broker_core_ticket(request: Request):
            # These clients prefer the core issuer. Its worker-local cookie
            # ticket cannot authenticate the broker, so use the Mobile issuer.
            if not phone_authenticated(request):
                return JSONResponse({"detail": "Authentication required"}, status_code=401)
            return JSONResponse({"detail": "Use the Mobile ticket endpoint"}, status_code=409)

        @app.post("/api/plugins/hermes-mobile/v1/ws-ticket")
        async def broker_mobile_ticket(request: Request):
            if not phone_authenticated(request):
                return JSONResponse({"detail": "Authentication required"}, status_code=401)
            if not await asyncio.to_thread(broker_binding.verify_current):
                return JSONResponse({"detail": "Broker identity changed"}, status_code=409)
            profile = request.query_params.get('profile', 'default')
            if getattr(broker_binding, 'protocol', None) == 'hermes-gateway-v1':
                try:
                    await asyncio.to_thread(broker_binding.for_profile, profile)
                except (OSError, ValueError, RuntimeError):
                    return JSONResponse({'detail': 'Selected gateway profile is unavailable'}, status_code=409)
            try:
                ticket = tickets.mint(client_token, profile=profile)
            except ValueError:
                return JSONResponse({"detail": "Ticket capacity reached"}, status_code=429)
            return {"ticket": ticket, "ttl_seconds": TTL_SECONDS}

        @app.websocket("/api/plugins/hermes-mobile/v1/gateway")
        async def broker_mobile_gateway(ws: WebSocket):
            if not host_allowed(ws.headers.get("host", "")) or not origin_allowed(ws.headers.get("origin", "")):
                await ws.close(code=4403, reason="Invalid host")
                return
            consumed = tickets.consume_binding(ws.query_params.get("mobile_ticket", ""))
            if consumed is None or not hmac.compare_digest(consumed[0], client_token):
                await ws.close(code=4401, reason="Authentication required")
                return
            if getattr(broker_binding, 'protocol', None) == 'hermes-gateway-v1':
                await relay_gateway(ws, broker_binding, profile=consumed[1] or 'default')
            else:
                await relay_gateway(ws, broker_binding)

        @app.on_event("shutdown")
        async def dispose_broker_tickets():
            tickets.dispose()

    @app.on_event("shutdown")
    async def close_client() -> None:
        await client.aclose()

    @app.websocket("/{path:path}")
    async def proxy_websocket(websocket: WebSocket, path: str) -> None:
        if broker_binding is not None:
            # No permissive alias can bypass the Mobile ticket/compatibility path.
            await websocket.close(code=4403, reason="Unsupported Mobile gateway path")
            return
        if not host_allowed(websocket.headers.get("host", "")):
            await websocket.close(code=1008, reason="invalid host")
            return

        query = _translated_ws_query(websocket.url.query, client_token, upstream_token)
        target = f"{upstream_ws}/{path}"
        if query:
            target = f"{target}?{query}"
        raw_ws_token = dict(parse_qsl(websocket.url.query, keep_blank_values=True)).get("token", "")
        replacement_token = (
            upstream_token
            if client_token
            and raw_ws_token
            and hmac.compare_digest(raw_ws_token, client_token)
            else None
        )
        headers = _request_headers(
            websocket.scope.get("headers", []),
            None,
            replacement_token=replacement_token,
        )

        try:
            async with websocket_connect(
                target,
                additional_headers=headers,
                open_timeout=15,
                close_timeout=5,
                max_size=None,
            ) as upstream_socket:
                await websocket.accept()

                async def client_to_upstream() -> None:
                    while True:
                        message = await websocket.receive()
                        if message["type"] == "websocket.disconnect":
                            await upstream_socket.close()
                            return
                        if message.get("text") is not None:
                            await upstream_socket.send(message["text"])
                        elif message.get("bytes") is not None:
                            await upstream_socket.send(message["bytes"])

                async def upstream_to_client() -> None:
                    async for message in upstream_socket:
                        if isinstance(message, str):
                            await websocket.send_text(message)
                        else:
                            await websocket.send_bytes(message)

                tasks = {
                    asyncio.create_task(client_to_upstream()),
                    asyncio.create_task(upstream_to_client()),
                }
                done, pending = await asyncio.wait(
                    tasks,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in pending:
                    task.cancel()
                await asyncio.gather(*done, *pending, return_exceptions=True)
        except ConnectionClosed as error:
            await websocket.close(code=error.code, reason=error.reason)
        except Exception:
            await websocket.close(code=1011, reason="upstream unavailable")

    @app.api_route(
        "/{path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    )
    async def proxy_http(request: Request, path: str) -> Response:
        if not host_allowed(request.headers.get("host", "")):
            return JSONResponse({"detail": "Invalid proxy host"}, status_code=400)
        replacement_token = None
        if broker_binding is not None and not await asyncio.to_thread(broker_binding.generation_current):
            return JSONResponse({"detail": "Broker identity changed"}, status_code=409)
        if client_token:
            presented = _presented_http_token(request)
            if presented and not hmac.compare_digest(presented, client_token):
                return JSONResponse({"detail": "Invalid session credential"}, status_code=401)
            if presented:
                replacement_token = upstream_token

        headers = _request_headers(request.scope.get('headers', []), upstream_authority, replacement_token=replacement_token)
        if replacement_token and getattr(broker_binding, 'protocol', None) == 'hermes-gateway-v1':
            if not origin_allowed(request.headers.get('origin', '')):
                return JSONResponse({'detail': 'Invalid origin'}, status_code=403)
            profile = request.query_params.get('profile', 'default')
            segments = path.split('/')
            if len(segments) > 2 and segments[:2] == ['api', 'profiles'] and segments[2] not in {'active', 'sessions', 'projects', 'import'}:
                profile = segments[2]
            headers = [(name, value) for name, value in headers if name.lower() not in {'authorization', 'origin', 'x-hermes-session-token', 'x-hermes-gateway-ticket'}]
            try:
                administrative = path == 'api/profiles' or path.startswith('api/profiles/')
                headers.extend((await asyncio.to_thread(broker_binding.http_headers, profile, profile_admin=administrative)).items())
            except (OSError, ValueError, RuntimeError):
                return JSONResponse({'detail': 'Selected gateway profile is unavailable'}, status_code=409)

        target = f"{upstream_http}/{path}"
        if request.url.query:
            target = f"{target}?{request.url.query}"
        try:
            upstream_response = await client.request(
                request.method,
                target,
                headers=headers,
                content=await request.body(),
                timeout=_request_timeout(path),
            )
        except httpx.TimeoutException:
            return JSONResponse(
                {"detail": "The Hermes host timed out while processing this request"},
                status_code=504,
            )
        response_headers = {
            name: value
            for name, value in upstream_response.headers.items()
            if name.lower()
            not in HOP_BY_HOP | {"content-length", "content-encoding"}
        }
        content = upstream_response.content
        if path == 'api/plugins/hermes-mobile/v1/capabilities' and upstream_response.status_code == 200 and getattr(broker_binding, 'protocol', None) == 'hermes-gateway-v1':
            payload = upstream_response.json()
            payload['native_gateway_protocol'] = broker_binding.protocol
            content = json.dumps(payload).encode('utf-8')
        content_type = upstream_response.headers.get("content-type", "").lower()
        if client_token and upstream_token and "text/html" in content_type:
            content = content.replace(upstream_token.encode(), client_token.encode())
        return Response(
            content=content,
            status_code=upstream_response.status_code,
            headers=response_headers,
            media_type=None,
        )

    return app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=9130)
    parser.add_argument("--upstream", default="http://127.0.0.1:9129")
    parser.add_argument("--allowed-host", required=True)
    parser.add_argument("--credential-file", default="")
    parser.add_argument("--upstream-credential-file", default="")
    parser.add_argument("--shared-runtime-home", default="")
    parser.add_argument("--shared-runtime-code-root", default="")
    parser.add_argument("--shared-runtime-identity", default="")
    parser.add_argument("--shared-runtime-lock-directory", default="")
    args = parser.parse_args()
    client_token = None
    upstream_token = None
    broker = None
    if args.shared_runtime_home or args.shared_runtime_code_root:
        if not args.shared_runtime_home or not args.shared_runtime_code_root or not args.credential_file:
            raise ValueError("Explicit broker home, code root and Mobile credential are required")
        from mobile_shared_runtime import resolve_binding
        if args.shared_runtime_lock_directory:
            os.environ["HERMES_GATEWAY_LOCK_DIR"] = str(Path(args.shared_runtime_lock_directory).resolve())
        broker = resolve_binding(args.shared_runtime_home, args.shared_runtime_code_root)
        if broker.public_metadata()["IdentityKey"] != args.shared_runtime_identity:
            raise ValueError("Broker changed before bridge startup")
        args.upstream = broker.origin
        client_token = broker.read_mobile_credential(args.credential_file)
        upstream_token = broker.credential
    elif args.credential_file:
        client_token = _read_credential_file(args.credential_file, "mobile")
        upstream_token = (
            _read_credential_file(args.upstream_credential_file, "Desktop backend")
            if args.upstream_credential_file
            else _discover_upstream_token(args.upstream)
        )
    uvicorn.run(
        create_app(
            upstream=args.upstream,
            allowed_host=args.allowed_host,
            client_token=client_token,
            upstream_token=upstream_token,
            broker_binding=broker,
        ),
        host=args.host,
        port=args.port,
        access_log=False,
        log_level="warning",
    )


if __name__ == "__main__":
    main()
