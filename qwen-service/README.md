# Hermes Qwen3-TTS service

This local-only service keeps Qwen's GPU/Python dependency stack outside the
Hermes runtime. It binds to `127.0.0.1:9140`, authenticates every state-bearing
route with a random token stored under `%LOCALAPPDATA%\hermes\qwen-tts`, and
stores reusable cloned/designed voices in that same runtime directory.

The Hermes Mobile server plugin registers `qwen`, `kokoro`, and `f5` through the
generic TTS provider interface. Desktop and Mobile talk only to authenticated
Hermes endpoints, never directly to this service.

Run `scripts\install-qwen-tts.ps1` from the repository root to create the
isolated Python 3.12 environment and scheduled task.
