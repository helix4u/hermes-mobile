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
from pathlib import Path
import re
from urllib.parse import parse_qsl, urlencode

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
) -> FastAPI:
    if bool(client_token) != bool(upstream_token):
        raise ValueError("client_token and upstream_token must be configured together")
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    client = httpx.AsyncClient(
        timeout=_request_timeout(""),
        follow_redirects=False,
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

    @app.on_event("shutdown")
    async def close_client() -> None:
        await client.aclose()

    @app.websocket("/{path:path}")
    async def proxy_websocket(websocket: WebSocket, path: str) -> None:
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
        if client_token:
            presented = _presented_http_token(request)
            if presented and not hmac.compare_digest(presented, client_token):
                return JSONResponse({"detail": "Invalid session credential"}, status_code=401)
            if presented:
                replacement_token = upstream_token

        target = f"{upstream_http}/{path}"
        if request.url.query:
            target = f"{target}?{request.url.query}"
        try:
            upstream_response = await client.request(
                request.method,
                target,
                headers=_request_headers(
                    request.scope.get("headers", []),
                    upstream_authority,
                    replacement_token=replacement_token,
                ),
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
    args = parser.parse_args()
    client_token = None
    upstream_token = None
    if args.credential_file:
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
        ),
        host=args.host,
        port=args.port,
        access_log=False,
        log_level="warning",
    )


if __name__ == "__main__":
    main()
