# Architecture

The map of Yapper: what its parts are, how a spoken sentence becomes text, and where to change what.
Keep it current: a change that adds, removes or rewires a part updates the diagram in the same pull request
(`AGENTS.md`, section 11).

## Color palette

| Color | Meaning |
| :--- | :--- |
| 🟦 Blue | Our code: packages, services, apps |
| 🟪 Purple | Inputs: microphone, configuration |
| 🟨 Yellow | Checks and decisions |
| 🟩 Green | Outputs: text, downloaded models |
| ⬜ Grey | External systems we do not own |
| 🟥 Red | Personal data: raw audio and transcripts |

## The big picture

Yapper turns speech into text. It has two halves: **browser libraries** that web apps embed, and a **Python
engine** that does the heavy transcription. Both can also call cloud providers.

```mermaid
flowchart LR
    mic["🎙️ Microphone<br/>raw audio"]
    subgraph browser["In the browser · packages/"]
        direction TB
        react["@yapper/react<br/>useTalk, TalkOrb, TalkDictationPill"]
        core["@yapper/core<br/>TalkClient + audio processing"]
        react --> core
    end
    subgraph python["On a machine · Python"]
        direction TB
        engine["yapper-engine<br/>services/yapper-engine · port 8000"]
        hud["Desktop HUD<br/>clients/hud · Tkinter"]
    end
    mic --> core
    mic --> hud
    core -->|cloud engine| gateway["Gateway<br/>packages/server · Express"]
    core -->|cloud engine, self-hosted| engine
    hud -->|HTTP /api/transcribe| engine
    gateway --> cloud["OpenAI / Groq<br/>speech-to-text APIs"]
    engine -->|optional backends| cloud
    r2["Model CDN<br/>Cloudflare R2, Hugging Face fallback"] -->|Whisper models| engine
    r2 -->|Whisper models| core
    showcase["Showcase site<br/>apps/showcase · Vite"] --> react
    core --> text["📝 Text"]
    engine --> text

    classDef ours fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef output fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef external fill:#f3f4f6,stroke:#6b7280,color:#374151
    classDef risk fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
    class react,core,engine,hud,gateway,showcase ours
    class text output
    class cloud,r2 external
    class mic risk
    style browser fill:#eff6ff,stroke:#2563eb
    style python fill:#eff6ff,stroke:#2563eb
```

**Audio and transcripts are personal data** (red). Nothing stores or logs them beyond the request: the engine
and the gateway transcribe and forget. Audio leaves the machine only when a cloud backend (OpenAI, Groq) is
chosen. The engine accepts browser requests only from localhost pages and the origins in `CORS_ORIGINS`.

## How the browser picks an engine

`TalkClient.resolvedEngine` in `packages/core/src/TalkClient.ts` picks one of three engines, unless the app
sets `preferredEngine`:

```mermaid
flowchart TD
    start["TalkClient.start()"] --> pref{"preferredEngine set?"}
    pref -->|yes| chosen["use it"]
    pref -->|"no (auto)"| local{"Local Whisper model<br/>downloaded or loading?"}
    local -->|yes| lw["🟦 LocalWhisperEngine<br/>Whisper in a Web Worker,<br/>audio never leaves the browser"]
    local -->|no| native{"Browser has<br/>SpeechRecognition?"}
    native -->|yes| bs["🟦 BrowserSpeechEngine<br/>the browser's built-in recognizer"]
    native -->|no| cloudq{"Cloud endpoint<br/>configured?"}
    cloudq -->|yes| cs["🟦 CloudStreamEngine<br/>sends audio to the endpoint"]
    cloudq -->|no| none["❌ no engine ready"]
    lw -->|fails to load| bs

    classDef gate fill:#fef9c3,stroke:#ca8a04,color:#713f12
    classDef ours fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef bad fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
    class pref,local,native,cloudq gate
    class chosen,lw,bs,cs ours
    class none bad
```

Before any engine sees it, `packages/core/src/audio/` downsamples the microphone to 16 kHz mono with an
AudioWorklet (inline code in `audioProcessor.ts`) and detects speech by energy.

## One utterance through the engine

`services/yapper-engine` receives 16 kHz, 16-bit mono audio on the WebSocket `/ws/audio` (streaming) or
`POST /api/transcribe` (one file):

```mermaid
flowchart TD
    pcm["Audio frames<br/>WebSocket /ws/audio"] --> origin{"Origin allowed?<br/>src/api/origins.py"}
    origin -->|no| reject["❌ closed (1008)"]
    origin -->|yes| vad{"Silero VAD<br/>is someone speaking?"}
    vad -->|speech| buffer["Buffer the utterance"]
    vad -->|silence long enough,<br/>or buffer full| pipe
    buffer --> vad
    subgraph pipe["TranscriptionPipeline · src/engine/pipeline.py"]
        direction TB
        dsp["1. Denoise<br/>dsp.py"] --> asr["2. Transcribe<br/>transcription.py"]
        asr --> hall["3. Drop hallucinations<br/>hallucination.py"]
        hall --> fmt["4. Format<br/>formatter.py: flow, raw or action mode"]
    end
    asr -.-> backends["Backend, from INFERENCE_BACKEND:<br/>local Faster-Whisper · OpenAI · Groq · custom"]
    fmt --> out["📝 transcript JSON<br/>back over the WebSocket"]

    classDef risk fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
    classDef gate fill:#fef9c3,stroke:#ca8a04,color:#713f12
    classDef ours fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef output fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef external fill:#f3f4f6,stroke:#6b7280,color:#374151
    class pcm risk
    class origin,vad gate
    class buffer,dsp,asr,hall,fmt ours
    class out output
    class backends external
    class reject risk
    style pipe fill:#eff6ff,stroke:#2563eb
```

`INFERENCE_BACKEND=auto` picks a cloud backend when its API key is set, otherwise local Faster-Whisper.

## How models are downloaded

```mermaid
flowchart LR
    need["Engine or HUD needs<br/>Whisper model X"] --> cache{"In the local cache?"}
    cache -->|yes| use["✅ use it"]
    cache -->|no| r2["Download from R2<br/>(OS trust store for TLS)"]
    r2 --> sum{"SHA-256 matches<br/>model_checksums.py?"}
    sum -->|yes| extract["Extract safely<br/>(no links, no path traversal)"] --> use
    sum -->|"no, or model unknown"| hf["Fall back to Hugging Face"] --> use

    classDef gate fill:#fef9c3,stroke:#ca8a04,color:#713f12
    classDef ours fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef output fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef external fill:#f3f4f6,stroke:#6b7280,color:#374151
    class cache,sum gate
    class need,extract ours
    class use output
    class r2,hf external
```

`scripts/upload_models_to_r2.py` publishes a model and rewrites `model_checksums.py` with its hash; the two are
always committed together (`publish-model` skill).

## Parts

| Part | Folder | What it does | Talks to |
| :--- | :--- | :--- | :--- |
| Core library | `packages/core` | `TalkClient`, audio processing, the three browser engines, streaming agreement | Gateway, engine, model CDN |
| React library | `packages/react` | `useTalk` hook and ready-made components | Core |
| Gateway | `packages/server` | Express proxy to OpenAI / Groq / self-hosted Whisper; stores no audio | Cloud APIs |
| Showcase | `apps/showcase` | Marketing and demo site (`src/App.tsx`) | React library |
| Engine | `services/yapper-engine` | FastAPI: `GET /health`, `POST /api/transcribe`, WebSocket `/ws/audio` | Backends, model CDN |
| Desktop HUD | `clients/hud`, `clients/desktop_hud.py` | Records audio, transcribes through the engine or in-process | Engine |
| Scripts | `scripts/` | Release builds, R2 publish and model upload, `doctor.py`, `verify.py` | R2 |

## Where to change what

| To change... | Look in | Skill |
| :--- | :--- | :--- |
| Add or change a transcription backend | `services/yapper-engine/src/engine/transcription.py`, `config.py` | `.agents/skills/add-stt-backend` |
| Publish or fix a model download | `scripts/upload_models_to_r2.py`, `model_loader.py` | `.agents/skills/publish-model` |
| How the browser picks an engine | `packages/core/src/TalkClient.ts` | `.agents/skills/review-change` |
| Cleanup of the text (fillers, actions) | `services/yapper-engine/src/engine/formatter.py` | `.agents/skills/review-change` |
| Which websites may call the engine | `CORS_ORIGINS`, `src/api/origins.py` | `.agents/skills/review-change` |
