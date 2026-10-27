# ⚡ Yapper Engine (`services/yapper-engine`)

> **Production-grade, async Python 3.12 / FastAPI streaming speech-to-text service with Silero VAD gating and Wispr Flow post-processing.**

[![Python 3.12](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111%2B-teal.svg)](https://fastapi.tiangolo.com)
[![Docker Ready](https://img.shields.io/badge/Docker-Multi--stage-2496ED.svg)](Dockerfile)
[![Idle Memory](https://img.shields.io/badge/Memory-%3C80MB_Idle-emerald.svg)](#-memory--resource-footprint)

---

## 🚀 Overview

`yapper-engine` is the dedicated high-throughput backend service for the Yapper speech-to-text ecosystem. Designed to run seamlessly on free cloud tiers ($0/month, <80MB idle RAM) or local desktop hardware, it ingests 16kHz 16-bit mono PCM audio over duplex WebSockets, applies low-latency Silero Voice Activity Detection (VAD) gating, and executes transcription with Wispr Flow conversational cleanup.

### Key Capabilities
- **Duplex WebSocket Ingestion (`/ws/audio`)**: Low-overhead binary streaming with zero disk I/O.
- **Low-Footprint Silero VAD**: Evaluates 32ms audio windows via ONNX Runtime (<1.8MB model) with adaptive fallback.
- **Dual Transcription Engine**:
  - **Groq Cloud (Default)**: Sub-200ms `whisper-large-v3` inference with zero-data-retention in-memory WAV piping.
  - **Faster-Whisper (Local Fallback)**: CTranslate2 quantized `tiny.en` / `base` running locally on CPU or CUDA.
- **Wispr Flow Post-Processor**: Strips filler words (`um`, `uh`, `you know`), heals conversational self-corrections (`table four, actually table five` $\to$ `Table five.`), and enforces punctuation via LLaMA 3.1 8B or deterministic regex.
- **Structured Action Extraction**: Converts spoken thoughts into deterministic JSON schemas.

---

## 🛠️ Quickstart

### Option A: Local Python 3.12 Environment

```bash
cd services/yapper-engine

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
export GROQ_API_KEY="your-groq-api-key"
export INFERENCE_BACKEND="groq" # or "local"

# Start server
python -m src.main
```

The service will start on `http://0.0.0.0:8000`.

---

### Option B: Docker Container

```bash
cd services/yapper-engine

# Build multi-stage production image
docker build -t yapper-engine .

# Run container with unprivileged user
docker run -d \
  --name yapper-engine \
  -p 8000:8000 \
  -e GROQ_API_KEY="your-groq-api-key" \
  -e INFERENCE_BACKEND="groq" \
  --memory=512m \
  yapper-engine
```

Check health:
```bash
curl http://localhost:8000/health
```

---

## 📡 API Specification

### 1. Health Probe (`GET /health`)

```json
{
  "status": "ok",
  "uptime_seconds": 128.45,
  "backend": "groq",
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
| `PORT` | `int` | `8000` | Port for HTTP & WebSocket server |
| `HOST` | `str` | `"0.0.0.0"` | Bind interface |
| `INFERENCE_BACKEND` | `str` | `"groq"` | Inference provider: `"groq"` or `"local"` |
| `GROQ_API_KEY` | `str` | `""` | Groq Cloud API key |
| `GROQ_MODEL` | `str` | `"whisper-large-v3"` | Groq Whisper model ID |
| `GROQ_LLM_MODEL` | `str` | `"llama-3.1-8b-instant"` | LLM used for Flow text cleanup |
| `LOCAL_WHISPER_MODEL` | `str` | `"tiny.en"` | Faster-Whisper model size |
| `LOCAL_WHISPER_DEVICE` | `str` | `"cpu"` | CTranslate2 device (`"cpu"` or `"cuda"`) |
| `VAD_THRESHOLD` | `float` | `0.5` | Silero VAD speech probability threshold |
| `VAD_SILENCE_DURATION_MS` | `int` | `400` | Trailing silence ms before utterance flush |
| `SAMPLE_RATE` | `int` | `16000` | Audio sampling frequency in Hz |
| `CORS_ORIGINS` | `list` | `["*"]` | Allowed CORS origins |

---

## 🧪 Testing

```bash
pytest tests/ -v
```

---

## 📄 License

MIT © PlaatoOS Team
