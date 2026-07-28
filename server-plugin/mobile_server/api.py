"""FastAPI routes for the versioned Hermes Mobile server contract."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, WebSocket

from .compatibility import probe_hermes
from .contract import CapabilityResponse, FeatureSet, HealthResponse
from .gateway import handle_mobile_gateway
from .observers import snapshot
from .tickets import TTL_SECONDS, mint_ticket

router = APIRouter()


@router.get("/v1/health")
async def health() -> dict:
    report = probe_hermes()
    return HealthResponse(
        status="ok" if report.gateway_available else "degraded",
        compatibility=report.status,
    ).to_dict()


@router.get("/v1/capabilities")
async def capabilities() -> dict:
    report = probe_hermes()
    features = FeatureSet(
        profiles=True,
        stored_sessions=True,
        live_sessions=report.gateway_available,
    )
    return CapabilityResponse(
        status=report.status,
        hermes_version=report.hermes_version,
        details=report.details,
        features=features,
    ).to_dict()


@router.get("/v1/observed-sessions")
async def observed_sessions() -> dict:
    return {"sessions": snapshot()}


@router.post("/v1/ws-ticket")
async def websocket_ticket(request: Request) -> dict:
    """Exchange a verified loopback session credential for a one-use ticket."""

    report = probe_hermes()
    if not report.gateway_available:
        raise HTTPException(
            status_code=503,
            detail="Hermes Mobile plugin is incompatible",
        )

    # This is the same gate used by Hermes's own sensitive HTTP endpoints.
    # It validates the legacy session header on loopback and defers to the
    # authenticated request state on gated public binds.
    report.http_auth(request)

    credential = request.headers.get("x-hermes-session-token", "").strip()
    if not credential:
        authorization = request.headers.get("authorization", "")
        if authorization.lower().startswith("bearer "):
            credential = authorization[7:].strip()

    if not credential:
        raise HTTPException(
            status_code=409,
            detail="Use the canonical /api/auth/ws-ticket endpoint",
        )

    return {
        "ticket": mint_ticket(credential),
        "ttl_seconds": TTL_SECONDS,
    }


@router.websocket("/v1/gateway")
async def gateway(ws: WebSocket) -> None:
    await handle_mobile_gateway(ws)
