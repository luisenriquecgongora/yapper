---
name: add-stt-backend
description: Add or change a speech-to-text backend of the Yapper engine (local Faster-Whisper, OpenAI, Groq, or any OpenAI-compatible server). Use when asked to support a new transcription provider, change model defaults, or adjust how the engine picks a backend.
---

# Add or change a speech-to-text backend

## Where things live

| What | Where |
|---|---|
| Interface | `BaseTranscriber.transcribe(pcm_bytes, language) -> str` in `services/yapper-engine/src/engine/transcription.py` |
| Backends | same file: `OpenAICompatibleTranscriber`, `GroqTranscriber`, `LocalFasterWhisperTranscriber` |
| Factory (cached per backend + model) | `get_transcriber()` in the same file |
| Settings and auto-selection | `services/yapper-engine/src/config.py`: `INFERENCE_BACKEND`, `effective_backend` |
| Local model download | `src/engine/model_loader.py` (see the `publish-model` skill) |

## First check: is it OpenAI-compatible?

Most providers (Together, Fireworks, vLLM, LocalAI) speak the OpenAI audio API. Those need **no code**:
`INFERENCE_BACKEND=custom`, `API_BASE_URL=...`, `API_KEY=...`, `STT_MODEL=...`.
Only add a class when the provider needs a fixed base URL and its own key setting (like `GroqTranscriber`)
or a different API.

## Steps for a new backend

1. Settings in `config.py`: `<NAME>_API_KEY` and `<NAME>_MODEL` fields; add the name to the
   `INFERENCE_BACKEND` `Literal`; decide whether `effective_backend` auto-selects it when its key is set
   (order matters: earlier keys win).
2. Class in `transcription.py`: subclass `OpenAICompatibleTranscriber` (set `base_url`) or `BaseTranscriber`.
3. A branch in `get_transcriber()`.
4. Tests in `services/yapper-engine/tests/` with the provider client mocked: no network calls in tests.

## Rules

- **Input is raw 16 kHz, 16-bit mono PCM bytes.** Convert in the backend if the provider needs a file format.
- **Never store or log audio or transcripts** beyond the request (see `AGENTS.md`).
- **Never log API keys**; settings come from the environment, never from committed files.
- An unknown backend name falls back to local Faster-Whisper with a warning; keep that behavior.

## Done when

`python scripts/verify.py` passes.
