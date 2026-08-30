# Bundled openWakeWord models

Hermes Mobile uses these ONNX assets for local, app-owned wake-word detection:

- `melspectrogram.onnx` and `embedding_model.onnx` are openWakeWord's shared
  feature pipeline.
- `hey_hermes.onnx` is Hermes's custom `Hey Hermes` classifier.
- `alexa_v0.1.onnx`, `hey_jarvis_v0.1.onnx`, `hey_mycroft_v0.1.onnx`, and
  `hey_rhasspy_v0.1.onnx` are the official openWakeWord v0.5.1 classifiers.

The classifier is selected by a closed model ID catalog in
`OpenWakeWordEngine`; callers cannot supply asset paths.

The models and pipeline originate from
[openWakeWord](https://github.com/dscripka/openWakeWord), Apache-2.0. Ambient
audio stays inside the Android process and is not sent to Hermes.

## Sherpa open-vocabulary model

The `sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01` directory contains
the official Apache-2.0 English keyword-spotting model's int8 encoder, decoder,
joiner, tokens, and BPE tokenizer. Mobile uses the official
`sherpa-onnx-static-link-onnxruntime-1.13.6.aar` Android runtime. Users choose a
plain English phrase; the client tokenizes it with the same bundled BPE model,
and Android accepts only that bounded token definition plus the fixed model ID.
Callers cannot supply native libraries or model paths.

Verified source artifacts:

- Sherpa AAR SHA-256:
  `01E87037AFCA2ED49085062AACE5C012E60321E8E23E3A72B6D9AC02C843F66C`
- GigaSpeech KWS archive SHA-256:
  `F170013B4716E41B62B9BFD809687C207CEF798EF9BC6534D524E17AF9B6561A`
