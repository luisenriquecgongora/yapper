# @yapper/core

> **Zero-dependency, universal speech-to-text core running on-device WebGPU Whisper, self-healing 0ms Web Speech API, and real-time streaming agreement.**

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](https://opensource.org/licenses/MIT)
[![WebGPU Accelerated](https://img.shields.io/badge/WebGPU-Hardware_Accelerated-emerald.svg)](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
[![Tests Passing](https://img.shields.io/badge/Tests-Vitest_28_Passed-emerald.svg)](https://vitest.dev)

---

## ⚡ Features

- **AudioWorklet Decimation**: Seamless zero-copy 16kHz downsampling running on dedicated audio rendering threads, eliminating UI frame drops from deprecated `ScriptProcessorNode`.
- **Web Worker Inference**: Offloads `@huggingface/transformers` Whisper models to a dedicated Web Worker thread with WebGPU hardware acceleration and CPU/WASM fallback.
- **English Model Specialization**: Automatically resolves `onnx-community/whisper-tiny.en` for English voice input, cutting weight size and improving Word Error Rate (WER).
- **Self-Healing 0ms Native Speech Engine**: Automated supervisor loop wrapping `webkitSpeechRecognition` to instantly revive dead sessions during silence.
- **Streaming Agreement Algorithm**: Bounded greedy chunking with hallucination suppression and real-time confidence thresholding.
- **Zero Cloud Footprint**: 100% private, on-device audio processing without sending vocal data across the wire.

---

## 📦 Installation

```bash
# npm
npm install @yapper/core

# yarn
yarn add @yapper/core

# pnpm
pnpm add @yapper/core
```

---

## 🚀 Quickstart (Vanilla TypeScript / JavaScript)

```typescript
import { TalkClient } from '@yapper/core';

// Initialize TalkClient
const client = new TalkClient({
  engine: 'browser', // 'browser' | 'local' | 'cloud'
  language: 'english',
  onInterim: (text) => {
    console.log('Interim transcript:', text);
  },
  onFinal: (text) => {
    console.log('Final committed transcript:', text);
  },
  onAudioLevel: (rms) => {
    // 0.0 to 1.0 real-time microphone volume level
  },
  onStatusChange: (status) => {
    console.log('Status:', status); // 'idle' | 'listening' | 'processing' | 'ready'
  },
});

// Start listening
const session = await client.start();

// Stop listening and finalize transcript
const transcript = await session.stop();
console.log('Committed text:', transcript);
```

### Loading On-Device WebGPU Whisper

```typescript
import { TalkClient } from '@yapper/core';

const client = new TalkClient({
  engine: 'local',
  modelSize: 'tiny', // 'tiny' (76MB) | 'base' (140MB) | 'small' (240MB)
  onModelProgress: (progress) => {
    console.log(`Loading weights: ${Math.round(progress.progress * 100)}%`);
  },
});

// Pre-load model weights into browser cache and compile GPU shaders
await client.local.load();

// Start recording with on-device AI transcription
await client.start();
```

---

## 🛠️ Architecture

- **`TalkClient`**: The primary orchestrator handling audio context, worklets, VAD, and transcription sessions.
- **`AudioWorklet` (`pcm-downsampler-processor`)**: Decimates incoming 44.1kHz/48kHz microphone streams to 16,000Hz 16-bit PCM via inline Blob URLs without requiring external asset bundlers.
- **`whisper.worker`**: Web Worker running ONNX Runtime Web and Hugging Face Transformers.
- **`EnergyVad`**: Adaptive RMS voice activity detection with hysteresis thresholds.
- **`AgreementChunker`**: Stabilizes interim token streams into dry, permanent transcript chunks.

---

## 📄 License

MIT © PlaatoOS Team
