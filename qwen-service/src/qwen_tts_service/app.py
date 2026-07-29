from __future__ import annotations

import base64
import contextlib
import gc
import json
import os
import re
import secrets
import shutil
import tempfile
import threading
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel


BASE_MODEL = "Qwen/Qwen3-TTS-12Hz-0.6B-Base"
DESIGN_MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
MAX_REFERENCE_BYTES = 25 * 1024 * 1024


def service_home() -> Path:
    configured = os.environ.get("QWEN_TTS_HOME", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
    if local_app_data:
        return (Path(local_app_data) / "hermes" / "qwen-tts").resolve()
    return (Path.home() / ".hermes" / "qwen-tts").resolve()


HOME = service_home()
VOICES = HOME / "voices"
TOKEN_FILE = HOME / "service-token"
VOICES.mkdir(parents=True, exist_ok=True)


def _token() -> str:
    try:
        value = TOKEN_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        value = ""
    if value:
        return value
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    value = secrets.token_urlsafe(48)
    TOKEN_FILE.write_text(value, encoding="utf-8")
    return value


def require_token(authorization: Optional[str] = Header(default=None)) -> None:
    expected = _token()
    supplied = (authorization or "").removeprefix("Bearer ").strip()
    if not supplied or not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


class VoiceCreateRequest(BaseModel):
    name: str
    mode: str = "clone"
    reference_audio_data_url: Optional[str] = None
    reference_text: Optional[str] = None
    language: str = "Auto"
    instruct: Optional[str] = None


class VoiceDeleteRequest(BaseModel):
    voice_id: str


class SpeechRequest(BaseModel):
    text: str
    voice: str
    language: str = "Auto"
    model: Optional[str] = None


def _voice_id(name: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    if not value:
        raise HTTPException(status_code=400, detail="Voice name is required")
    return value[:64]


def _voice_dir(voice_id: str) -> Path:
    safe = _voice_id(voice_id)
    path = (VOICES / safe).resolve()
    if path.parent != VOICES.resolve():
        raise HTTPException(status_code=400, detail="Invalid voice id")
    return path


def _metadata(path: Path) -> dict[str, Any]:
    try:
        value = json.loads((path / "voice.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def _write_metadata(path: Path, value: dict[str, Any]) -> None:
    pending = path / "voice.json.pending"
    pending.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")
    pending.replace(path / "voice.json")


def _catalog() -> list[dict[str, Any]]:
    voices = []
    for path in sorted(VOICES.iterdir(), key=lambda item: item.name.lower()):
        if not path.is_dir():
            continue
        value = _metadata(path)
        if value.get("id"):
            voices.append(value)
    return voices


def _decode_audio(data_url: str, destination: Path) -> None:
    match = re.fullmatch(r"data:audio/([a-zA-Z0-9.+-]+);base64,(.+)", data_url, flags=re.DOTALL)
    if not match:
        raise HTTPException(status_code=400, detail="Reference audio must be an audio data URL")
    try:
        payload = base64.b64decode(match.group(2), validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Reference audio is not valid base64") from exc
    if not payload or len(payload) > MAX_REFERENCE_BYTES:
        raise HTTPException(status_code=400, detail="Reference audio must be between 1 byte and 25 MB")
    destination.write_bytes(payload)


class ModelManager:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._model: Any = None
        self._kind = ""
        self._prompt_cache: dict[str, Any] = {}

    @property
    def loaded(self) -> str:
        return self._kind

    def _unload(self) -> None:
        self._model = None
        self._kind = ""
        self._prompt_cache.clear()
        gc.collect()
        with contextlib.suppress(Exception):
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    def _load(self, kind: str):
        if self._model is not None and self._kind == kind:
            return self._model
        self._unload()
        import torch
        from qwen_tts import Qwen3TTSModel

        model_id = BASE_MODEL if kind == "base" else DESIGN_MODEL
        cuda = torch.cuda.is_available()
        self._model = Qwen3TTSModel.from_pretrained(
            model_id,
            device_map="cuda:0" if cuda else "cpu",
            dtype=torch.bfloat16 if cuda else torch.float32,
            attn_implementation="sdpa",
        )
        self._kind = kind
        return self._model

    def design_reference(
        self,
        *,
        text: str,
        language: str,
        instruct: str,
        output_path: Path,
    ) -> None:
        with self._lock:
            model = self._load("design")
            wavs, sample_rate = model.generate_voice_design(
                text=text,
                language=language,
                instruct=instruct,
            )
            import soundfile as sf

            sf.write(str(output_path), wavs[0], sample_rate)
            self._unload()

    def synthesize(self, voice: dict[str, Any], text: str, language: str, output_path: Path) -> None:
        with self._lock:
            model = self._load("base")
            voice_id = str(voice["id"])
            prompt = self._prompt_cache.get(voice_id)
            if prompt is None:
                prompt = model.create_voice_clone_prompt(
                    ref_audio=str(_voice_dir(voice_id) / str(voice["reference_file"])),
                    ref_text=voice.get("reference_text") or None,
                    x_vector_only_mode=bool(voice.get("x_vector_only_mode")),
                )
                self._prompt_cache[voice_id] = prompt
            wavs, sample_rate = model.generate_voice_clone(
                text=text,
                language=language,
                voice_clone_prompt=prompt,
            )
            import soundfile as sf

            sf.write(str(output_path), wavs[0], sample_rate)


MODELS = ModelManager()
app = FastAPI(title="Hermes Qwen3-TTS", version="0.1.0")


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "healthy", "model_loaded": MODELS.loaded or None, "voices": len(_catalog())}


@app.get("/v1/voices", dependencies=[Depends(require_token)])
def list_voices() -> dict[str, Any]:
    return {"voices": _catalog()}


@app.post("/v1/voices", dependencies=[Depends(require_token)])
def create_voice(payload: VoiceCreateRequest) -> dict[str, Any]:
    mode = payload.mode.strip().lower()
    if mode not in {"clone", "design"}:
        raise HTTPException(status_code=400, detail="Mode must be clone or design")
    voice_id = _voice_id(payload.name)
    path = _voice_dir(voice_id)
    if path.exists():
        raise HTTPException(status_code=409, detail="A voice with that name already exists")
    path.mkdir(parents=True)
    try:
        reference_file = "reference.wav"
        reference_text = (payload.reference_text or "").strip()
        instruct = (payload.instruct or "").strip()
        if mode == "clone":
            if not payload.reference_audio_data_url:
                raise HTTPException(status_code=400, detail="Clone mode requires reference audio")
            extension = ".wav"
            mime_match = re.match(r"data:audio/([^;]+);", payload.reference_audio_data_url)
            if mime_match and mime_match.group(1).lower() in {"mpeg", "mp3"}:
                extension = ".mp3"
            reference_file = f"reference{extension}"
            _decode_audio(payload.reference_audio_data_url, path / reference_file)
            x_vector_only = not bool(reference_text)
        else:
            if not instruct:
                raise HTTPException(status_code=400, detail="Design mode requires a voice instruction")
            reference_text = reference_text or "Hello. This is a short reference for my reusable voice."
            MODELS.design_reference(
                text=reference_text,
                language=payload.language or "Auto",
                instruct=instruct,
                output_path=path / reference_file,
            )
            x_vector_only = False

        value = {
            "id": voice_id,
            "name": payload.name.strip(),
            "display": payload.name.strip(),
            "mode": mode,
            "language": payload.language or "Auto",
            "instruct": instruct,
            "description": instruct if mode == "design" else "Cloned from reference audio",
            "reference_file": reference_file,
            "reference_text": reference_text,
            "x_vector_only_mode": x_vector_only,
        }
        _write_metadata(path, value)
        return {"voice": value}
    except Exception:
        shutil.rmtree(path, ignore_errors=True)
        raise


@app.post("/v1/voices/delete", dependencies=[Depends(require_token)])
def delete_voice(payload: VoiceDeleteRequest) -> dict[str, Any]:
    path = _voice_dir(payload.voice_id)
    if not path.exists():
        return {"deleted": False}
    shutil.rmtree(path)
    MODELS._prompt_cache.pop(path.name, None)
    return {"deleted": True}


@app.post("/v1/audio/speech", dependencies=[Depends(require_token)])
def synthesize(payload: SpeechRequest) -> Response:
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    voice = _metadata(_voice_dir(payload.voice))
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")
    fd, filename = tempfile.mkstemp(prefix="qwen-tts-", suffix=".wav", dir=HOME)
    os.close(fd)
    output = Path(filename)
    try:
        MODELS.synthesize(voice, text, payload.language or voice.get("language") or "Auto", output)
        return Response(output.read_bytes(), media_type="audio/wav")
    finally:
        with contextlib.suppress(OSError):
            output.unlink()
