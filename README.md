# Yapper

> **The Zero-Server, 100% Private Real-Time Speech-to-Text SDK.**  
> *Live showcase & playground:* **[yapper.plaatoos.com](https://yapper.plaatoos.com)**

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](https://opensource.org/licenses/MIT)
[![WebGPU Accelerated](https://img.shields.io/badge/WebGPU-Hardware_Accelerated-emerald.svg)](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
[![Zero Data Retention](https://img.shields.io/badge/Security-Zero_Data_Retention-blue.svg)](#security--privacy)

`Yapper` is an open-source, modular speech-to-text SDK designed to run **everywhere**:
1. **In-Browser On-Device (WebGPU / WASM)**: Runs OpenAI's Whisper model completely offline using ONNX Runtime Web and `@huggingface/transformers`. Audio never leaves the client machine.
2. **Native Browser Speech**: Instant zero-download speech recognition via the Web Speech API (`SpeechRecognition`).
3. **Zero Data Retention (ZDR) Cloud Gateway**: Streaming cloud proxy with support for OpenAI `gpt-4o-mini-transcribe`, Groq Whisper, and self-hosted `faster-whisper`.
4. **Streaming Alignment**: Implements the Local Agreement algorithm to provide live interim text as the user speaks without repeating hallucinated tokens.

---

## ⚡ Comparison Matrix

| Feature | In-Browser WebGPU Whisper | Native Web Speech API | Cloud Gateway (ZDR) |
| :--- | :---: | :---: | :---: |
| **Server Cost** | **$0.00 (Zero)** | **$0.00 (Zero)** | Pay per token / minute |
| **Data Privacy** | **100% Local (Never transmitted)** | Cloud (Google / Apple / Microsoft) | Encrypted stream, Zero retention |
| **Offline Capable** | **Yes (Cached locally)** | No | No |
| **Typical Latency** | 150ms – 400ms | 200ms – 500ms | 100ms – 300ms |
| **Accuracy** | High (Whisper Small/Tiny) | Medium | Very High |
| **Hardware** | GPU (Chrome/Edge/Brave) or WASM CPU | Any supported browser | Any device with network |

---

## 📦 Packages

This repository is structured as a modular monorepo:

- **[`@yapper/core`](./packages/core)**: Framework-agnostic TypeScript core engine. Handles audio capture, 16 kHz PCM downsampling, VAD, and engine negotiation.
- **[`@yapper/react`](./packages/react)**: React hooks (`useYapper`, `useTalk`) and UI components (`<YapperOrb />`, `<YapperDictationPill />`, `<LocalModelCard />`).
- **[`@yapper/server`](./packages/server)**: Lightweight, production-grade cloud gateway proxy with Zero Data Retention and magic-byte payload verification.
- **[`apps/showcase`](./apps/showcase)**: The production Next.js / Vite web application deployed to `yapper.plaatoos.com`.

---

## 🚀 Quickstart

### 1. React (`@yapper/react`)

Install the packages:

```bash
npm install @yapper/react @yapper/core
# or
yarn add @yapper/react @yapper/core
```

Use the hook and UI components:

```tsx
import React from 'react';
import { useYapper, YapperOrb, YapperDictationPill, LocalModelCard } from '@yapper/react';

export function VoiceAssistant() {
  const {
    isListening,
    isTranscribing,
    audioLevel,
    interimText,
    finalText,
    modelProgress,
    start,
    stop,
    downloadModel,
    removeModel,
  } = useYapper({
    preferredEngine: 'auto', // 'local' | 'browser' | 'cloud'
    modelSize: 'tiny',       // ~40MB on-device Whisper
    language: 'english',
    onFinal: (text) => console.log('Final text:', text),
  });

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      {/* On-device model download card */}
      <LocalModelCard
        progress={modelProgress}
        modelSize="tiny"
        approxMb={40}
        onDownload={downloadModel}
        onRemove={removeModel}
      />

      {/* Audio-reactive glowing orb */}
      <YapperOrb
        size="lg"
        isListening={isListening}
        isProcessing={isTranscribing}
        audioLevel={audioLevel}
        onClick={isListening ? stop : start}
      />

      {/* Floating dictation pill with live partials */}
      <YapperDictationPill
        status={isListening ? 'listening' : 'idle'}
        engine="local"
        interimText={interimText}
      />

      {finalText && <p className="text-sm font-semibold">{finalText}</p>}
    </div>
  );
}
```

---

### 2. Vanilla JavaScript / TypeScript (`@yapper/core`)

```typescript
import { YapperClient } from '@yapper/core';

const yapper = new YapperClient({
  preferredEngine: 'auto',
  language: 'english',
  onInterim: (words) => {
    console.log('Real-time running words:', words);
  },
  onFinal: (text) => {
    console.log('Final committed text:', text);
  },
});

// Start listening
const session = await yapper.start();

// Stop listening and get transcript
const text = await yapper.stop();
console.log('Spoken:', text);
```

---

### 3. Zero Data Retention Cloud Gateway (`@yapper/server`)

If you want to proxy speech through a self-hosted cloud endpoint with anti-abuse security and zero disk storage:

```bash
cd packages/server
yarn install
OPENAI_API_KEY=your_key yarn start
```

Transcribe an audio buffer via standard HTTP POST:

```bash
curl -X POST http://localhost:8089/api/transcribe \
  -F "file=@recording.webm" \
  -F "language=en"
```

---

## 🛡️ Security & Privacy ("Must Be Safe")

Yapper is built with strict privacy and resource safety invariants:

1. **Client-Side Privacy Guarantee**: In `local` mode, audio is processed purely in RAM using WebGPU/WASM tensor pipelines. No audio data, vectors, or transcripts are ever sent across the network.
2. **Zero Data Retention (ZDR)**: The server gateway processes incoming audio in transient memory buffers. Audio files are never written to disk, database, or object storage.
3. **Hallucination Suppression**: Whisper models frequently loop on background noise (`[Music]`, `Thank you for watching`). Yapper gates inference through an energy-based Voice Activity Detector (VAD) and filters phantom tokens.
4. **Thermal & GPU Protection**: In-browser inference automatically skips frames if the previous chunk is still executing, preventing GPU queuing and thermal throttling.

---

## 🤝 Contributing

We welcome community contributions, additional model architectures (such as Useful Sensors' Moonshine), and framework bindings.

```bash
# Clone the repo
git clone https://github.com/plaatoos/yapper.git
cd yapper

# Install dependencies and build
yarn install
yarn build
```

---

## 📄 License

MIT © [PlaatoOS](https://plaatoos.com) / Taki Entertainment.
