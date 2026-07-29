"""Local TTS provider adapters owned by the Hermes Mobile side project.

This is a deliberately narrow Hermes compatibility adapter. It imports the
public-ish TTS provider ABC and config loader so the standalone plugin can
register local services without putting provider-specific branches in Hermes
core.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional

from agent.tts_provider import TTSProvider


def _object(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _config() -> Dict[str, Any]:
    from hermes_cli.config import load_config

    return _object(load_config())


def _env() -> Dict[str, str]:
    from hermes_cli.config import load_env

    return load_env()


def _provider_config(name: str) -> Dict[str, Any]:
    tts = _object(_config().get("tts"))
    direct = _object(tts.get(name))
    named = _object(_object(tts.get("providers")).get(name))
    return {**direct, **named}


def _base_url(name: str, default: str) -> str:
    return str(_provider_config(name).get("base_url") or default).rstrip("/")


def _json_request(
    url: str,
    *,
    method: str = "GET",
    headers: Optional[Dict[str, str]] = None,
    payload: Optional[Dict[str, Any]] = None,
    timeout: float = 15,
) -> tuple[bytes, Dict[str, str]]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Accept": "application/json, audio/*",
            **({"Content-Type": "application/json"} if body is not None else {}),
            **(headers or {}),
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(), {key.lower(): value for key, value in response.headers.items()}


def _json(url: str, **kwargs: Any) -> Dict[str, Any]:
    body, _headers = _json_request(url, **kwargs)
    value = json.loads(body.decode("utf-8"))
    return value if isinstance(value, dict) else {}


def _healthy(url: str) -> bool:
    try:
        result = _json(f"{url}/health", timeout=2)
        return str(result.get("status") or "").lower() in {"healthy", "ok", "ready"}
    except Exception:
        return False


def _output_with_suffix(output_path: str, suffix: str) -> Path:
    path = Path(output_path)
    return path if path.suffix.lower() == suffix else path.with_suffix(suffix)


class KokoroTTSProvider(TTSProvider):
    @property
    def name(self) -> str:
        return "kokoro"

    @property
    def display_name(self) -> str:
        return "Kokoro (local)"

    def is_available(self) -> bool:
        return _healthy(_base_url(self.name, "http://127.0.0.1:8880"))

    def list_voices(self) -> list[Dict[str, Any]]:
        try:
            value = _json(f"{_base_url(self.name, 'http://127.0.0.1:8880')}/v1/audio/voices")
            return [
                {"id": str(voice), "display": str(voice)}
                for voice in value.get("voices", [])
                if str(voice).strip()
            ]
        except Exception:
            return []

    def list_models(self) -> list[Dict[str, Any]]:
        return [{"id": "kokoro", "display": "Kokoro"}]

    def synthesize(
        self,
        text: str,
        output_path: str,
        *,
        voice: Optional[str] = None,
        model: Optional[str] = None,
        speed: Optional[float] = None,
        format: str = "mp3",
        **extra: Any,
    ) -> str:
        requested = format if format in {"mp3", "wav", "flac", "opus"} else "mp3"
        body, _headers = _json_request(
            f"{_base_url(self.name, 'http://127.0.0.1:8880')}/v1/audio/speech",
            method="POST",
            headers={"x-raw-response": "true"},
            payload={
                "model": model or "kokoro",
                "input": text,
                "voice": voice or self.default_voice() or "af_heart",
                "response_format": requested,
                "speed": speed or 1,
                "stream": False,
                **({"lang_code": extra["language"]} if extra.get("language") else {}),
            },
            timeout=240,
        )
        suffix = ".ogg" if requested == "opus" else f".{requested}"
        path = _output_with_suffix(output_path, suffix)
        path.write_bytes(body)
        return str(path)

    @property
    def voice_compatible(self) -> bool:
        return True


def _urlsafe_json(value: Dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(
        json.dumps(value, separators=(",", ":")).encode("utf-8")
    ).rstrip(b"=").decode("ascii")


def _f5_token(secret: str) -> str:
    now = int(time.time())
    header = _urlsafe_json({"alg": "HS256", "typ": "JWT"})
    payload = _urlsafe_json({"sub": "hermes-mobile", "iat": now, "exp": now + 1800, "scope": "tts"})
    signing_input = f"{header}.{payload}"
    signature = base64.urlsafe_b64encode(
        hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    ).rstrip(b"=").decode("ascii")
    return f"{signing_input}.{signature}"


class F5TTSProvider(TTSProvider):
    @property
    def name(self) -> str:
        return "f5"

    @property
    def display_name(self) -> str:
        return "F5-TTS (local)"

    def _headers(self) -> Dict[str, str]:
        secret = str(_env().get("F5TTS_SECRET_KEY") or os.environ.get("F5TTS_SECRET_KEY") or "").strip()
        return {"Authorization": f"Bearer {_f5_token(secret)}"} if secret else {}

    def is_available(self) -> bool:
        return bool(self._headers()) and _healthy(_base_url(self.name, "http://127.0.0.1:8081"))

    def list_voices(self) -> list[Dict[str, Any]]:
        try:
            result = _json(
                f"{_base_url(self.name, 'http://127.0.0.1:8081')}/api/v1/voices/list",
                headers=self._headers(),
            )
            voices = []
            for profile in result.get("profiles", []):
                if isinstance(profile, dict):
                    voice_id = str(profile.get("name") or profile.get("id") or "").strip()
                    if voice_id:
                        voices.append(
                            {
                                "id": voice_id,
                                "display": str(profile.get("display") or profile.get("label") or voice_id),
                                "profile": str(profile.get("description") or ""),
                            }
                        )
                elif str(profile).strip():
                    voices.append({"id": str(profile), "display": str(profile)})
            return voices
        except Exception:
            return []

    def synthesize(
        self,
        text: str,
        output_path: str,
        *,
        voice: Optional[str] = None,
        **extra: Any,
    ) -> str:
        selected = voice or self.default_voice()
        if not selected:
            raise RuntimeError("F5-TTS has no available voice profile")
        body, _headers = _json_request(
            f"{_base_url(self.name, 'http://127.0.0.1:8081')}/api/v1/tts/synthesize",
            method="POST",
            headers=self._headers(),
            payload={"text": text, "voice_profile": selected},
            timeout=300,
        )
        path = _output_with_suffix(output_path, ".wav")
        path.write_bytes(body)
        return str(path)

    @property
    def voice_compatible(self) -> bool:
        return True


def _qwen_home() -> Path:
    configured = str(_provider_config("qwen").get("home") or "").strip()
    if configured:
        return Path(configured).expanduser()
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "hermes" / "qwen-tts"
    return Path.home() / ".hermes" / "qwen-tts"


class QwenTTSProvider(TTSProvider):
    @property
    def name(self) -> str:
        return "qwen"

    @property
    def display_name(self) -> str:
        return "Qwen3-TTS (local)"

    def _url(self) -> str:
        return _base_url(self.name, "http://127.0.0.1:9140")

    def _headers(self) -> Dict[str, str]:
        token_path = _qwen_home() / "service-token"
        try:
            token = token_path.read_text(encoding="utf-8").strip()
        except OSError:
            token = ""
        return {"Authorization": f"Bearer {token}"} if token else {}

    def is_available(self) -> bool:
        return bool(self._headers()) and _healthy(self._url())

    def get_capabilities(self) -> Dict[str, Any]:
        return {
            "voice_cloning": True,
            "voice_design": True,
            "voice_delete": True,
            "instruction_control": False,
            "streaming": False,
            "languages": [
                "Auto",
                "Chinese",
                "English",
                "Japanese",
                "Korean",
                "German",
                "French",
                "Russian",
                "Portuguese",
                "Spanish",
                "Italian",
            ],
        }

    def list_voices(self) -> list[Dict[str, Any]]:
        try:
            result = _json(f"{self._url()}/v1/voices", headers=self._headers())
            return [
                {
                    "id": str(voice.get("id") or ""),
                    "display": str(voice.get("display") or voice.get("name") or voice.get("id") or ""),
                    "language": str(voice.get("language") or ""),
                    "profile": str(voice.get("description") or voice.get("instruct") or ""),
                    "kind": str(voice.get("mode") or "clone"),
                    "deletable": True,
                }
                for voice in result.get("voices", [])
                if isinstance(voice, dict) and str(voice.get("id") or "").strip()
            ]
        except Exception:
            return []

    def list_models(self) -> list[Dict[str, Any]]:
        return [
            {"id": "Qwen/Qwen3-TTS-12Hz-0.6B-Base", "display": "Qwen3-TTS 0.6B Base"},
            {"id": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", "display": "Qwen3-TTS 1.7B VoiceDesign"},
        ]

    def synthesize(
        self,
        text: str,
        output_path: str,
        *,
        voice: Optional[str] = None,
        model: Optional[str] = None,
        **extra: Any,
    ) -> str:
        selected = voice or self.default_voice()
        if not selected:
            raise RuntimeError("Create or select a Qwen cloned voice first")
        body, _headers = _json_request(
            f"{self._url()}/v1/audio/speech",
            method="POST",
            headers=self._headers(),
            payload={
                "text": text,
                "voice": selected,
                "language": extra.get("language") or "Auto",
                "model": model,
            },
            timeout=600,
        )
        path = _output_with_suffix(output_path, ".wav")
        path.write_bytes(body)
        return str(path)

    def create_voice(
        self,
        *,
        name: str,
        reference_audio_path: Optional[str] = None,
        reference_text: Optional[str] = None,
        language: Optional[str] = None,
        instruct: Optional[str] = None,
        mode: str = "clone",
        **extra: Any,
    ) -> Dict[str, Any]:
        audio_data_url = None
        if reference_audio_path:
            path = Path(reference_audio_path)
            mime = "audio/wav" if path.suffix.lower() == ".wav" else "audio/mpeg"
            audio_data_url = f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"
        result = _json(
            f"{self._url()}/v1/voices",
            method="POST",
            headers=self._headers(),
            payload={
                "name": name,
                "mode": mode,
                "reference_audio_data_url": audio_data_url,
                "reference_text": reference_text,
                "language": language or "Auto",
                "instruct": instruct,
            },
            timeout=900,
        )
        return _object(result.get("voice"))

    def delete_voice(self, voice_id: str) -> bool:
        result = _json(
            f"{self._url()}/v1/voices/delete",
            method="POST",
            headers=self._headers(),
            payload={"voice_id": voice_id},
        )
        return bool(result.get("deleted"))

    @property
    def voice_compatible(self) -> bool:
        return True


def register_local_tts_providers(ctx) -> None:
    """Register every local provider; unavailable services stay out of catalogs."""
    ctx.register_tts_provider(KokoroTTSProvider())
    ctx.register_tts_provider(F5TTSProvider())
    ctx.register_tts_provider(QwenTTSProvider())
