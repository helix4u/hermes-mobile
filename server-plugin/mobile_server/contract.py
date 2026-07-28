"""Versioned response shapes for the Hermes Mobile server contract."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from . import CONTRACT_VERSION, PLUGIN_VERSION


@dataclass(frozen=True)
class FeatureSet:
    profiles: bool = True
    stored_sessions: bool = True
    live_sessions: bool = True
    projects: bool = False
    revisioned_events: bool = False
    recoverable_approval: bool = False
    recoverable_clarification: bool = False
    recoverable_sudo: bool = False
    recoverable_secret: bool = False
    attachments: bool = False
    device_pairing: bool = False
    push_notifications: bool = False


@dataclass(frozen=True)
class CapabilityResponse:
    status: str
    hermes_version: str
    details: tuple[str, ...] = ()
    features: FeatureSet = field(default_factory=FeatureSet)
    contract_version: int = CONTRACT_VERSION
    plugin_version: str = PLUGIN_VERSION

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["details"] = list(self.details)
        return value


@dataclass(frozen=True)
class HealthResponse:
    status: str
    compatibility: str
    contract_version: int = CONTRACT_VERSION
    plugin_version: str = PLUGIN_VERSION

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
