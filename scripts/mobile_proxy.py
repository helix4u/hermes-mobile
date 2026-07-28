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


def _host_without_port(value: str) -> str:
    return value.rsplit(":", 1)[0].lower() if value.count(":") == 1 else value.lower()


def _request_headers(
    raw_headers: Iterable[tuple[bytes, bytes]],
    upstream_authority: str | None,
) -> list[tuple[str, str]]:
    headers: list[tuple[str, str]] = []
    for raw_name, raw_value in raw_headers:
        name = raw_name.decode("latin-1")
        lower = name.lower()
        if lower in HOP_BY_HOP or lower.startswith("sec-websocket-") or lower in {
            "host",
            "content-length",
            "origin",
        }:
            continue
        headers.append((name, raw_value.decode("latin-1")))
    if upstream_authority:
        headers.append(("Host", upstream_authority))
    return headers


def create_app(*, upstream: str, allowed_host: str) -> FastAPI:
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    client = httpx.AsyncClient(timeout=30.0, follow_redirects=False)
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

        query = websocket.url.query
        target = f"{upstream_ws}/{path}"
        if query:
            target = f"{target}?{query}"
        headers = _request_headers(websocket.scope.get("headers", []), None)

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

        target = f"{upstream_http}/{path}"
        if request.url.query:
            target = f"{target}?{request.url.query}"
        upstream_response = await client.request(
            request.method,
            target,
            headers=_request_headers(request.scope.get("headers", []), upstream_authority),
            content=await request.body(),
        )
        response_headers = {
            name: value
            for name, value in upstream_response.headers.items()
            if name.lower()
            not in HOP_BY_HOP | {"content-length", "content-encoding"}
        }
        return Response(
            content=upstream_response.content,
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
    args = parser.parse_args()
    uvicorn.run(
        create_app(upstream=args.upstream, allowed_host=args.allowed_host),
        host=args.host,
        port=args.port,
        access_log=False,
        log_level="warning",
    )


if __name__ == "__main__":
    main()
