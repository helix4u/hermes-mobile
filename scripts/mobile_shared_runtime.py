"""Attach-only Mobile transport adapter for the pinned shared-runtime pilot.

This is the documented private-core boundary for host discovery. It uses the
existing read-only service/rendezvous APIs, never worker/service launch APIs.
The record and canonical credential stay server-side. No discovery fallback.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass, field
import importlib
import json
import os
from pathlib import Path
import sys
if __package__:
    from .mobile_native_runtime import NativeBinding, resolve_native_binding
else:
    from mobile_native_runtime import NativeBinding, resolve_native_binding
from typing import Any

import httpx


class BindingUnavailable(RuntimeError):
    pass


def _key(path: str | Path) -> str:
    return os.path.normcase(str(Path(path).resolve()))


def _json(origin: str, path: str, credential: str) -> dict:
    with httpx.Client(trust_env=False, follow_redirects=False, timeout=2) as client:
        with client.stream("GET", origin + path, headers={"Authorization": "Bearer " + credential}) as response:
            if response.status_code != 200:
                raise BindingUnavailable("Broker authentication or readiness failed")
            body = bytearray()
            for chunk in response.iter_bytes():
                body.extend(chunk)
                if len(body) > 65536:
                    raise BindingUnavailable("Broker proof exceeded its size limit")
    result = json.loads(body)
    if not isinstance(result, dict):
        raise BindingUnavailable("Broker proof is malformed")
    return result


@dataclass(frozen=True)
class BrokerBinding:
    record: Any = field(repr=False)
    host_record: Any = field(repr=False)
    service: Any = field(repr=False)
    rendezvous: Any = field(repr=False)
    credential: str = field(repr=False)

    @property
    def origin(self) -> str:
        return f"http://127.0.0.1:{self.record.port}"

    @property
    def scope(self) -> tuple[str, str, str]:
        return (self.record.home, self.record.generation, self.record.worker_generation)

    def generation_current(self) -> bool:
        # No process scans, source hashing or credential reads on relay frames.
        try:
            return (self.service._read_record(Path(self.record.home)) == self.record
                    and self.rendezvous.read_record(self.rendezvous.ROLE_SERVE, include_stale=True) == self.host_record)
        except Exception:
            return False

    def verify_current(self, *, new_binding: bool = False) -> bool:
        try:
            if not self.generation_current() or not self.service._same_process(self.record, listener=True):
                return False
            identity = _json(self.origin, self.rendezvous.HOST_IDENTITY_PATH, self.credential)
            if (type(identity.get("pid")) is not int or identity["pid"] != self.record.pid
                    or identity.get("role") != self.rendezvous.ROLE_SERVE
                    or type(identity.get("protocolVersion")) is not int
                    or identity["protocolVersion"] != self.rendezvous.HOST_PROTOCOL_VERSION):
                return False
            if new_binding:
                status = _json(self.origin, "/api/shared-runtime/status", self.credential)
                valid = (status.get("worker_generation") == self.record.worker_generation
                         and status.get("worker_current") is True
                         and status.get("code_current") is True
                         and status.get("current") is True)
                if not valid:
                    return False
            # A verified live binding does not rehash source or rediscover plugin
            # capabilities on every supervisor tick. The broker owns admission.
            return self.generation_current()
        except Exception:
            return False

    def public_metadata(self) -> dict:
        return {"Url": self.origin, "AccessTokenFile": self.record.token_path,
                "Profile": Path(self.record.home).name if Path(self.record.home).parent.name == "profiles" else "default",
                "IdentityKey": "|".join(self.scope), "OwnerKind": "shared-runtime",
                "BrokerHome": self.record.home, "CodeRoot": self.record.code_root}

    def read_mobile_credential(self, path: str | Path) -> str:
        protected = Path(path).absolute()
        expected = Path(self.record.home) / "mobile-server" / "session-token"
        if _key(protected) != _key(expected):
            raise BindingUnavailable("Mobile credential belongs to another home")
        credential = self._mobile_credential_bytes(protected).decode("utf-8-sig").strip()
        if len(credential) < 43 or any(character in credential for character in "\r\n"):
            raise BindingUnavailable("Mobile credential is missing or too short")
        return credential

    def _mobile_credential_bytes(self, path: Path) -> bytes:
        if os.name == "nt":
            # Mobile's existing owner-only ACL is stricter than the broker's
            # owner+SYSTEM shape. Validate permissions through the opened handle,
            # not by demanding an extra grant or rewriting the pairing credential.
            reader = importlib.import_module("hermes_cli.windows_ssh_runtime")
            if _key(Path(reader.__file__).parent.parent) != self.record.code_root:
                raise BindingUnavailable("Credential reader loaded from another source")
            result = reader._read_shared(path, 4096, reader._win32().win32con.FILE_SHARE_READ)
            if result is None:
                raise BindingUnavailable("Mobile credential is missing")
            return result
        self.service._verify_file(path)
        return path.read_bytes()


def resolve_binding(home: str | Path, code_root: str | Path, *, expected_identity: str = "") -> NativeBinding:
    return resolve_native_binding(home, code_root, expected_identity=expected_identity)


def resolve_legacy_binding(home: str | Path, code_root: str | Path, *, expected_identity: str = "") -> BrokerBinding:
    home, code_root = Path(home).resolve(), Path(code_root).resolve()
    # Scope dependent imports before loading core. Never reuse another source.
    os.environ["HERMES_HOME"] = str(home)
    sys.path.insert(0, str(code_root))
    service = importlib.import_module("hermes_cli.shared_runtime_service")
    if _key(Path(service.__file__).parent.parent) != _key(code_root):
        raise BindingUnavailable("Broker discovery loaded from another source")
    hr = importlib.import_module("gateway.host_rendezvous")
    record = (service._read_record(home) if expected_identity
              else service.shared_runtime_status(home, code_root=code_root))
    if record is None or record.home != _key(home) or record.code_root != _key(code_root):
        raise BindingUnavailable("Selected shared runtime is not ready")
    host = hr.read_record(hr.ROLE_SERVE, include_stale=True)
    credential = hr.read_token(hr.ROLE_SERVE)
    if (host is None or not credential or not hr.record_token_is_consistent(host)
            or host.pid != record.pid or host.start_time != record.start_time
            or host.port != record.port or _key(host.home) != record.home
            or record.code_root != _key(code_root)):
        raise BindingUnavailable("Broker credential identity is inconsistent")
    binding = BrokerBinding(record, host, service, hr, credential)
    if expected_identity and binding.public_metadata()["IdentityKey"] != expected_identity:
        raise BindingUnavailable("Broker generation changed")
    if not binding.verify_current(new_binding=not bool(expected_identity)):
        raise BindingUnavailable("Broker changed during attachment proof")
    if expected_identity:
        return binding
    health = _json(binding.origin, "/api/plugins/hermes-mobile/v1/health", credential)
    capabilities = _json(binding.origin, "/api/plugins/hermes-mobile/v1/capabilities", credential)
    if (health.get("status") != "ok" or capabilities.get("status") != "compatible"
            or type(health.get("contract_version")) is not int or health["contract_version"] != 1
            or type(capabilities.get("contract_version")) is not int or capabilities["contract_version"] != 1
            or not binding.generation_current()):
        raise BindingUnavailable("Selected broker has no compatible Mobile contract")
    return binding


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", required=True)
    parser.add_argument("--code-root", required=True)
    parser.add_argument("--expected-identity", default="")
    parser.add_argument("--lock-directory", default="")
    args = parser.parse_args()
    if args.lock_directory:
        os.environ["HERMES_GATEWAY_LOCK_DIR"] = str(Path(args.lock_directory).resolve())
    try:
        binding = resolve_binding(args.home, args.code_root, expected_identity=args.expected_identity)
        print(json.dumps({"Ready": True, **binding.public_metadata()}))
    except Exception:
        # Exception messages/chains may contain credentials or private bodies.
        print(json.dumps({"Ready": False, "Reason": "Selected broker unavailable or unprovable"}))


if __name__ == "__main__":
    main()
