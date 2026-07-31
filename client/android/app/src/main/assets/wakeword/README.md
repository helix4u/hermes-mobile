# Bundled openWakeWord models

Hermes Mobile uses these ONNX assets for local, app-owned "Hey Hermes"
detection:

- `melspectrogram.onnx` and `embedding_model.onnx` are openWakeWord's shared
  feature pipeline.
- `hey_hermes.onnx` is the exact bundled Hermes wake-word model used by Hermes
  Desktop on Windows.

The models and pipeline originate from
[openWakeWord](https://github.com/dscripka/openWakeWord), Apache-2.0. Ambient
audio stays inside the Android process and is not sent to Hermes.
