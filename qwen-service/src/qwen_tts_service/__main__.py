from __future__ import annotations

import argparse

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="Hermes Qwen3-TTS service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=9140, type=int)
    args = parser.parse_args()
    uvicorn.run("qwen_tts_service.app:app", host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
