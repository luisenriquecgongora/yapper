# Yapper

> *"Speak softly. Your voice writes itself into thought."*  
> **An intimate, zero-latency speech-to-text SDK running 100% on-device Whisper via WebGPU with self-healing 0ms Native Web Speech fallback.**  
> *Live interactive playground:* [**yapper.plaatoos.com**](https://yapper.plaatoos.com)

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](https://opensource.org/licenses/MIT)
[![WebGPU Accelerated](https://img.shields.io/badge/WebGPU-Hardware_Accelerated-emerald.svg)](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
[![Tests Passing](https://img.shields.io/badge/Tests-28_Passed-emerald.svg)](https://vitest.dev)
[![4-bit Quantized](https://img.shields.io/badge/Quantization-4--bit_q4-amber.svg)](https://huggingface.co/onnx-community/whisper-tiny)
[![Zero Data Retention](https://img.shields.io/badge/Security-Zero_Data_Retention-blue.svg)](#-security--privacy-invariants)

---

`Yapper` is an open-source, dual-architecture speech-to-text SDK built for modern web applications. Inspired by the intimate letterpress aesthetic of the film *Her* (Theodore Twombly's "Beautiful Handwritten Letters"), Yapper gives developers zero-latency, private voice dictation that feels like living ink on cotton paper.

---

## ✨ Key Highlights

- ✦ **On-Device WebGPU Whisper (Fast 4-bit)**: Compiles OpenAI's Whisper model directly into your browser's GPU shaders via ONNX Runtime Web and `@huggingface/transformers`. Model weights are compressed with 4-bit integer quantization (`q4`), slashing download size to **28 MB** and executing inference in **~60ms to 95ms**.
- ⚡ **Instant Native Speech (0ms)**: Instant hardware-accelerated speech recognition served directly by the browser's native Web Speech API (`webkitSpeechRecognition`) with a self-healing auto-restart supervisor loop. Zero download, zero GPU load, instant 60fps word streaming.
- ⏱️ **Real-Time Latency & Speed Telemetry**: Live microsecond-level decode pass latency, tokens-per-second throughput tracking, and commit duration metrics.
- ✍️ **Living Stationery UI**: Tactile cotton paper canvas, an audio-reactive living wax-seal voice orb (`<TalkOrb />`), a sliding hardware controls drawer, and continuous manuscript accumulation where speech writes in vermilion red ink before drying into permanent walnut ink.
- 🛡️ **Zero Cloud Transmission**: By default, audio samples never leave the user's device. Audio buffers reside in transient RAM, run through Web Audio nodes, and are immediately freed after decoding.
- 🧪 **Automated Vitest Test Suite**: 100% verified test coverage across audio downsampling, WAV header generation, Energy VAD, and streaming agreement chunking.
- 🌍 **Multilingual**: Supports 55+ spoken tongues including English, Spanish, Polish, French, German, Korean, Italian, Ukrainian, and more.

---

## ⚡ Architecture Comparison

| Capability | In-Browser WebGPU Whisper | Native Web Speech API | Cloud Gateway (ZDR Proxy) |
| :--- | :---: | :---: | :---: |
| **Server Cost** | **$0.00 (Zero)** | **$0.00 (Zero)** | Pay-per-token API cost |
| **Data Privacy** | **100% Client-Side (Never transmitted)** | Cloud (Browser vendor) | End-to-end encrypted, zero retention |
| **Offline Dictation** | **Yes (Cached in browser storage)** | No | No |
| **Latency** | **~60ms – 120ms** (WebGPU 4-bit) | **0ms – 50ms** (Instant streaming) | 150ms – 300ms |
| **Accuracy** | High (Whisper Tiny / Base / Small) | Medium | Very High (Whisper Large / Cloud) |
| **Hardware** | GPU (Chrome, Edge, Brave) / WASM CPU | Any supported browser | Any internet-connected device |

---

## 📦 Monorepo Architecture

```
yapper/
├── packages/
│   ├── core/           # @yapper/core: Universal framework-agnostic Web Audio & Whisper engine
│   ├── react/          # @yapper/react: React hooks (useTalk) & living UI components (TalkOrb, LocalModelCard)
│   └── server/         # @yapper/server: Lightweight Zero Data Retention Node/Express cloud proxy
├── services/
│   └── yapper-engine/  # Production async Python 3.12 / FastAPI streaming engine (Silero VAD, Local / OpenAI / Groq / vLLM, Wispr Flow)
└── apps/
    └── showcase/       # Production Vite web application deployed to yapper.plaatoos.com
```

---

## 🚀 Quickstart

### 1. React (`@yapper/react`)

```bash
yarn add @yapper/react @yapper/core
# or
npm install @yapper/react @yapper/core
```

```tsx
import React, { useState } from 'react';
import { useTalk, TalkOrb, LocalModelCard } from '@yapper/react';

export function LetterCompanion() {
  const [transcript, setTranscript] = useState('');

  const {
    isListening,
    isTranscribing,
    audioLevel,
    interimText,
    modelProgress,
    start,
    stop,
    downloadModel,
    removeModel,
  } = useTalk({
    preferredEngine: 'auto', // 'local' (WebGPU Whisper) | 'browser' (Native)
    modelSize: 'tiny',       // 28MB fast 4-bit Whisper
    language: 'english',
    onFinal: (sentence) => {
      setTranscript((prev) => (prev ? `${prev} ${sentence}` : sentence));
    },
  });

  return (
    <div className="flex flex-col items-center gap-6 p-8 bg-[#FAF6EE] text-[#251C17]">
      {/* Living Wax-Seal Voice Orb */}
      <TalkOrb
        size="lg"
        isListening={isListening}
        isProcessing={isTranscribing}
        audioLevel={audioLevel}
        onClick={isListening ? stop : start}
      />

      {/* Real-Time Manuscript Paper */}
      <div className="w-full max-w-xl p-6 bg-white border border-stone-200 rounded-2xl shadow-sm font-serif text-lg leading-relaxed">
        {transcript && <span>{transcript} </span>}
        {interimText && <span className="text-red-600 italic animate-pulse">{interimText}</span>}
      </div>

      {/* Model Download & Cache Management */}
      <LocalModelCard
        progress={modelProgress}
        modelSize="tiny"
        approxMb={28}
        onDownload={downloadModel}
        onRemove={removeModel}
      />
    </div>
  );
}
```

---

### 2. Vanilla JavaScript / TypeScript (`@yapper/core`)

```typescript
import { TalkClient } from '@yapper/core';

const client = new TalkClient({
  preferredEngine: 'auto',
  modelSize: 'tiny',
  language: 'english',
  onAudioLevel: (level) => {
    // Volume level 0.0 to 1.0 at ~60fps
  },
  onInterim: (words) => {
    console.log('Live words as spoken:', words);
  },
  onFinal: (sentence) => {
    console.log('Committed sentence:', sentence);
  },
});

// Start listening (requests microphone and resumes Web Audio graph)
await client.start();

// Stop listening and finalize transcription
const fullTranscript = await client.stop();
console.log('Letter complete:', fullTranscript);
```

---

### 3. Optional Zero Data Retention Gateway (`@yapper/server`)

For teams requiring a centralized proxy endpoint with guaranteed zero disk logging:

```bash
cd packages/server
yarn install
OPENAI_API_KEY=your_key yarn start
```

Transcribe audio with payload magic-byte validation:

```bash
curl -X POST http://localhost:8089/api/transcribe \
  -F "file=@speech.wav" \
  -F "language=en"
```

---

## 🛡️ Security & Privacy Invariants

1. **Zero Disk & Zero Cloud Logging**: Audio in `local` mode never crosses the network. When using `@yapper/server`, audio is held solely in volatile RAM during the lifetime of the HTTP request and is purged immediately upon response completion.
2. **Deterministic Bounded Generation**: Interim streaming passes enforce greedy decoding (`num_beams: 1`, `temperature: 0`) and cap tokens (`max_new_tokens: 64`) to eliminate infinite autoregressive loops and hallucination tokens on background silence.
3. **AudioContext Autoplay Safety**: Web Audio contexts are proactively verified and resumed upon user gesture, preventing silenced frequency bin loops in modern strict browser environments.
4. **Hardware Rate Adaptation**: The built-in `downsampleTo16k()` utility safely decimates any hardware DAC sample rate (44.1 kHz, 48 kHz, 96 kHz) into exact 16 kHz mono PCM, eliminating container decoding errors.

---

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/luisenriquecgongora/yapper.git
cd yapper

# Install monorepo dependencies
yarn install

# Run the showcase development server (port 5173)
yarn dev

# Compile all workspaces (core, react, server, showcase)
yarn build
```

---

## 📄 License

MIT © [PlaatoOS](https://plaatoos.com) / Luis Enrique.
