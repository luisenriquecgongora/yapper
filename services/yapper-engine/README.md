# ⚡ Yapper Engine (`services/yapper-engine`)

> **Production-grade, async Python 3.12 / FastAPI streaming speech-to-text service with Silero VAD gating, universal provider support (Local, OpenAI, Groq, vLLM), and Wispr Flow post-processing.**

[![Python 3.12](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111%2B-teal.svg)](https://fastapi.tiangolo.com)
[![Docker Ready](https://img.shields.io/badge/Docker-Multi--stage-2496ED.svg)](Dockerfile)
[![Idle Memory](https://img.shields.io/badge/Memory-%3C80MB_Idle-emerald.svg)](#-memory--resource-footprint)
[![Multi-Provider](https://img.shields.io/badge/Providers-Local_|_OpenAI_|_Groq_|_vLLM-purple.svg)](#-pluggable-transcription-providers)

---

## 🚀 Overview

`yapper-engine` is the high-throughput backend service for the Yapper speech-to-text ecosystem. It ingests 16kHz 16-bit mono PCM audio over duplex WebSockets, applies low-latency Silero Voice Activity Detection (VAD) gating, and executes transcription with Wispr Flow conversational cleanup.

### Key Capabilities
- **Universal Provider Architecture**:
  - **100% Free Local (CTranslate2)**: Faster-Whisper `tiny.en` / `base` running entirely on your machine. **No API keys, no internet connection required.**
  - **OpenAI**: Cloud `whisper-1` + `gpt-4o-mini`.
  - **Groq**: Sub-150ms LPU-accelerated `whisper-large-v3` + `llama-3.1-8b-instant`.
  - **Self-Hosted / Third-Party**: Any OpenAI-compatible endpoint (Together AI, Fireworks AI, LocalAI, vLLM, Ollama).
- **Duplex WebSocket Ingestion (`/ws/audio`)**: Low-overhead binary streaming with zero disk I/O.
- **Low-Footprint Silero VAD**: Evaluates 32ms audio windows via ONNX Runtime (<1.8MB model) with adaptive fallback.
- **Wispr Flow Post-Processor**: Strips filler words (`um`, `uh`, `you know`), heals conversational self-corrections (`table four, actually table five` $\to$ `Table five.`), and enforces punctuation via LLM or deterministic regex.
- **Structured Action Extraction**: Converts spoken thoughts into deterministic JSON schemas.

---

## 🛠️ Quickstart

### Option A: Docker Container (Recommended)

Build the multi-stage image once:
```bash
cd services/yapper-engine
docker build -t yapper-engine .
```

Choose your preferred provider mode:

#### 1. Free Local Mode (Zero Cloud, No Keys Needed)
```bash
docker run -d \
  --name yapper-engine \
  -p 8000:8000 \
  -e INFERENCE_BACKEND="local" \
  --memory=512m \
  yapper-engine
```

#### 2. OpenAI Mode
```bash
docker run -d \
  --name yapper-engine \
  -p 8000:8000 \
  -e INFERENCE_BACKEND="openai" \
  -e OPENAI_API_KEY="sk-..." \
  --memory=512m \
  yapper-engine
```

#### 3. Groq Mode (Sub-150ms Free Tier)
```bash
docker run -d \
  --name yapper-engine \
  -p 8000:8000 \
  -e INFERENCE_BACKEND="groq" \
  -e GROQ_API_KEY="gsk_..." \
  --memory=512m \
  yapper-engine
```

#### 4. Custom / Self-Hosted Endpoint (vLLM, LocalAI, Together AI)
```bash
docker run -d \
  --name yapper-engine \
  -p 8000:8000 \
  -e INFERENCE_BACKEND="custom" \
  -e API_BASE_URL="http://your-server:8080/v1" \
  -e API_KEY="optional-token" \
  --memory=512m \
  yapper-engine
```

Check health:
```bash
curl http://localhost:8000/health
```

---

### Option B: Local Python 3.12 Environment

```bash
cd services/yapper-engine

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start server (defaults to local Faster-Whisper if no cloud keys are provided)
python -m src.main
```

---

## 📡 API Specification

### 1. Health Probe (`GET /health`)

```json
{
  "status": "ok",
  "uptime_seconds": 128.45,
  "backend": "local",
  "sample_rate": 16000,
  "memory_rss_mb": 42.18
}
```

### 2. Streaming WebSocket (`WSS /ws/audio`)

#### Connection Handshake
```
ws://localhost:8000/ws/audio?language=en&mode=flow
```
- Query Parameters:
  - `language`: Target speech language code (`en`, `es`, `fr`, etc.). Default: `en`.
  - `mode`: `"flow"` (cleaned text), `"raw"` (raw ASR), or `"action"` (JSON schema extraction).

#### Protocol
- **Binary Frames (`bytes`)**: Continuous 16kHz 16-bit mono signed PCM chunks.
- **Text Frames (`JSON`)**:
  - `{"type": "CONFIG", "language": "es", "mode": "flow"}`: Update session properties dynamically.
  - `{"type": "FLUSH"}`: Force immediate transcription of currently buffered audio.
  - `{"type": "RESET"}`: Clear in-memory buffer without processing.

#### Outgoing Result Message (`JSON`)
```json
{
  "type": "RESULT",
  "raw": "uh reservation for four actually five people",
  "text": "Reservation for 5 people.",
  "action": null,
  "duration_ms": 138
}
```

---

## ⚙️ Environment Variables

| Variable | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `INFERENCE_BACKEND` | `str` | `"auto"` | Provider: `"auto"` (auto-detected), `"local"`, `"openai"`, `"groq"`, `"custom"` |
| `OPENAI_API_KEY` | `str` | `""` | OpenAI API key for `whisper-1` + `gpt-4o-mini` |
| `OPENAI_MODEL` | `str` | `"whisper-1"` | OpenAI STT model |
| `GROQ_API_KEY` | `str` | `""` | Groq Cloud API key for `whisper-large-v3` + `llama-3.1-8b` |
| `GROQ_MODEL` | `str` | `"whisper-large-v3"` | Groq Whisper model |
| `API_BASE_URL` | `str` | `""` | Custom OpenAI-compatible URL (e.g. `http://localhost:8080/v1`) |
| `API_KEY` | `str` | `""` | Auth key for custom OpenAI-compatible endpoint |
| `LOCAL_WHISPER_MODEL` | `str` | `"tiny.en"` | Faster-Whisper local model size |
| `LOCAL_WHISPER_DEVICE` | `str` | `"cpu"` | CTranslate2 device (`"cpu"` or `"cuda"`) |
| `VAD_THRESHOLD` | `float` | `0.5` | Silero VAD speech probability threshold |
| `VAD_SILENCE_DURATION_MS` | `int` | `400` | Trailing silence ms before utterance flush |
| `SAMPLE_RATE` | `int` | `16000` | Audio sampling frequency in Hz |
| `PORT` | `int` | `8000` | Server HTTP & WebSocket port |

---

## 🧪 Testing

```bash
pytest tests/ -v
```

---

## 📄 License

MIT © PlaatoOS Team
