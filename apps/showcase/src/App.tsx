import React, { useState, useEffect } from 'react';
import { TalkOrb, LocalModelCard, useTalk } from '@yapper/react';
import { ModelSize } from '@yapper/core';

export function App() {
  const [modelSize, setModelSize] = useState<ModelSize>('tiny');
  const [language, setLanguage] = useState<string>('english');
  const [activeTab, setActiveTab] = useState<'react' | 'vanilla' | 'cloud'>('react');
  const [hasWebGpu, setHasWebGpu] = useState<boolean>(false);

  useEffect(() => {
    setHasWebGpu(typeof navigator !== 'undefined' && 'gpu' in navigator);
  }, []);

  const {
    status,
    isListening,
    isTranscribing,
    engine,
    audioLevel,
    interimText,
    finalText,
    modelProgress,
    start,
    stop,
    downloadModel,
    removeModel,
  } = useTalk({
    preferredEngine: 'auto',
    modelSize,
    language,
  });

  const handleOrbClick = () => {
    if (isListening) {
      stop();
    } else {
      start().catch((err) => {
        alert(err.message);
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#120a09] text-[#FFF8F4] flex flex-col justify-between selection:bg-[#E34A3B] selection:text-[#FFF8F4] relative overflow-hidden font-sans">
      {/* Ambient warm atmospheric background glow */}
      <div className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[650px] h-[450px] bg-[radial-gradient(circle,rgba(227,74,59,0.18)_0%,rgba(235,177,91,0.06)_50%,transparent_80%)] blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="border-b border-[rgba(227,74,59,0.12)] bg-[#120a09]/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#E34A3B] to-[#F07167] flex items-center justify-center text-[#FFF8F4] font-serif italic text-base shadow-[0_0_12px_rgba(227,74,59,0.4)]">
            y
          </div>
          <span className="font-serif italic font-medium text-xl tracking-tight text-[#FFF8F4]">
            Yapper
          </span>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#1c1211] text-[#D6C2B8] border border-[rgba(227,74,59,0.2)]">
            yapper.plaatoos.com
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-2 text-xs font-mono text-[#D6C2B8] bg-[#1c1211] px-3 py-1 rounded-full border border-[rgba(227,74,59,0.18)]">
            <span className={`w-2 h-2 rounded-full ${hasWebGpu ? 'bg-[#EBB15B] shadow-[0_0_6px_#EBB15B]' : 'bg-[#E34A3B]'}`} />
            {hasWebGpu ? 'WebGPU Accelerated' : 'WASM CPU Mode'}
          </span>
          <a
            href="https://github.com/luisenriquecgongora/yapper"
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-1 rounded-full border border-[rgba(227,74,59,0.25)] hover:border-[#E34A3B] hover:bg-[#1c1211] transition-all text-xs font-medium text-[#D6C2B8]"
          >
            GitHub
          </a>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-6 py-12 flex-1 w-full space-y-12 relative z-10">
        {/* Poetic Hero Section */}
        <div className="text-center space-y-5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#1c1211] border border-[rgba(227,74,59,0.25)] text-[#F07167] text-xs font-medium tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E34A3B] animate-pulse" />
            <span>I'm here with you.</span>
            <span className="text-[#9E8681]">·</span>
            <span className="text-[#D6C2B8]">Private on-device voice</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-light italic tracking-tight text-[#FFF8F4] leading-[1.15]">
            Speak softly. <br className="hidden md:inline" />
            <span className="text-[#FAD2B8] not-italic font-normal">Every word stays in your machine.</span>
          </h1>

          <p className="text-[#9E8681] max-w-xl mx-auto text-sm md:text-base leading-relaxed font-light">
            An intimate speech-to-text companion running quietly inside your browser via WebGPU. No cloud, no eavesdropping, zero data retention.
          </p>
        </div>

        {/* Live Interactive Sandbox */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Left: Model Controls & Language */}
          <div className="md:col-span-5 space-y-5">
            <LocalModelCard
              progress={modelProgress}
              modelSize={modelSize}
              approxMb={modelSize === 'tiny' ? 40 : modelSize === 'base' ? 75 : 245}
              onDownload={downloadModel}
              onRemove={removeModel}
            />

            <div className="p-5 rounded-2xl border border-[rgba(227,74,59,0.18)] bg-[#1c1211]/80 backdrop-blur-md space-y-4">
              <label className="text-[11px] font-semibold text-[#D6C2B8] uppercase tracking-wider block">
                Model Scale
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['tiny', 'base', 'small'] as ModelSize[]).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setModelSize(size)}
                    className={`py-2 text-xs font-medium rounded-xl border transition-all capitalize ${
                      modelSize === size
                        ? 'bg-gradient-to-r from-[#E34A3B]/25 to-[#F07167]/20 border-[#E34A3B] text-[#FFF8F4] font-semibold shadow-sm'
                        : 'border-[rgba(227,74,59,0.15)] text-[#9E8681] hover:border-[rgba(227,74,59,0.3)] hover:text-[#D6C2B8]'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>

              <label className="text-[11px] font-semibold text-[#D6C2B8] uppercase tracking-wider block pt-1">
                Spoken Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-[#120a09] border border-[rgba(227,74,59,0.2)] rounded-xl px-3.5 py-2.5 text-xs text-[#FFF8F4] focus:outline-none focus:border-[#E34A3B] transition-colors"
              >
                <option value="english">English</option>
                <option value="spanish">Spanish (Español)</option>
                <option value="polish">Polish (Polski)</option>
                <option value="french">French (Français)</option>
                <option value="german">German (Deutsch)</option>
                <option value="korean">Korean (한국어)</option>
              </select>
            </div>
          </div>

          {/* Right: Living Orb & Flowing Transcript */}
          <div className="md:col-span-7 flex flex-col items-center justify-center p-8 rounded-3xl border border-[rgba(227,74,59,0.2)] bg-[#1c1211]/50 backdrop-blur-xl relative space-y-7 min-h-[440px] shadow-[0_15px_45px_rgba(0,0,0,0.4)]">
            {/* Top State Badge */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] px-3.5 py-1 rounded-full border border-[rgba(227,74,59,0.3)] bg-[#1c1211] text-[#FAD2B8] font-mono tracking-tight">
                Active Presence: <strong className="uppercase text-[#E34A3B]">{engine}</strong>
              </span>
            </div>

            {/* Glowing Reactive Her Orb */}
            <TalkOrb
              size="lg"
              isListening={isListening}
              isProcessing={isTranscribing}
              audioLevel={audioLevel}
              onClick={handleOrbClick}
            />

            <span className="text-xs text-[#9E8681] font-serif italic tracking-wide">
              {isListening
                ? 'Listening to you... click to pause'
                : isTranscribing
                ? 'Gathering your thoughts into words...'
                : 'Click the circle and speak gently'}
            </span>

            {/* Poetic Live Streaming Transcript Area */}
            <div className="w-full min-h-[110px] p-5 rounded-2xl bg-[#120a09]/90 border border-[rgba(227,74,59,0.18)] flex flex-col justify-center relative overflow-hidden">
              <div className="absolute top-2 right-3 text-[10px] text-[#9E8681]/60 uppercase tracking-widest font-mono">
                Transcript
              </div>

              {interimText ? (
                <p className="text-[#F07167] font-serif italic text-base md:text-lg leading-relaxed animate-pulse">
                  "{interimText}"
                </p>
              ) : finalText ? (
                <p className="text-[#FFF8F4] font-serif text-base md:text-lg leading-relaxed">
                  "{finalText}"
                </p>
              ) : (
                <p className="text-[#9E8681]/70 text-sm font-serif italic text-center">
                  Words will bloom here in real-time as your breath turns into thought...
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Integration Code Tabs */}
        <div className="space-y-4 pt-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-serif font-light text-[#FFF8F4]">Bring Yapper to Your Project</h2>
            <p className="text-xs text-[#9E8681]">Simple, zero-server speech-to-text integration for any web application.</p>
          </div>

          <div className="flex gap-2 border-b border-[rgba(227,74,59,0.15)] pb-2">
            <button
              onClick={() => setActiveTab('react')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeTab === 'react' ? 'bg-[#E34A3B] text-[#FFF8F4]' : 'text-[#9E8681] hover:text-[#FFF8F4]'
              }`}
            >
              React / Next.js
            </button>
            <button
              onClick={() => setActiveTab('vanilla')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeTab === 'vanilla' ? 'bg-[#E34A3B] text-[#FFF8F4]' : 'text-[#9E8681] hover:text-[#FFF8F4]'
              }`}
            >
              Vanilla JavaScript
            </button>
            <button
              onClick={() => setActiveTab('cloud')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeTab === 'cloud' ? 'bg-[#E34A3B] text-[#FFF8F4]' : 'text-[#9E8681] hover:text-[#FFF8F4]'
              }`}
            >
              Zero Data Retention Server
            </button>
          </div>

          <div className="p-5 rounded-2xl bg-[#1c1211] border border-[rgba(227,74,59,0.18)] font-mono text-xs text-[#D6C2B8] overflow-x-auto shadow-inner leading-relaxed">
            {activeTab === 'react' && (
              <pre>{`import { useYapper, YapperOrb, YapperDictationPill } from '@yapper/react';

export function VoiceCompanion() {
  const { isListening, isTranscribing, audioLevel, interimText, start, stop } = useYapper({
    preferredEngine: 'auto', // 'local' | 'browser' | 'cloud'
    modelSize: 'tiny',       // 40MB on-device Whisper WebGPU
    onFinal: (text) => console.log('Spoken:', text),
  });

  return (
    <div className="flex flex-col items-center gap-6">
      <YapperOrb
        isListening={isListening}
        isProcessing={isTranscribing}
        audioLevel={audioLevel}
        onClick={isListening ? stop : start}
      />
      <YapperDictationPill
        status={isListening ? 'listening' : 'idle'}
        engine="local"
        interimText={interimText}
      />
    </div>
  );
}`}</pre>
            )}

            {activeTab === 'vanilla' && (
              <pre>{`import { YapperClient } from '@yapper/core';

const yapper = new YapperClient({
  preferredEngine: 'auto',
  onInterim: (words) => console.log('Living words:', words),
  onFinal: (text) => console.log('Committed letter:', text),
});

// Start streaming push-to-talk
const session = await yapper.start();

// Finish speaking and get final transcript
const transcript = await yapper.stop();`}</pre>
            )}

            {activeTab === 'cloud' && (
              <pre>{`# Run the Zero Data Retention gateway
cd packages/server && yarn start

# Transcribe any audio via curl (never touches disk)
curl -X POST http://localhost:8089/api/transcribe \\
  -F "file=@recording.webm" \\
  -F "language=en"`}</pre>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[rgba(227,74,59,0.12)] py-8 px-6 text-center text-xs text-[#9E8681] space-y-1 relative z-10">
        <p className="font-serif italic text-sm text-[#D6C2B8]">
          "Sometimes I look at you and I feel like I'm looking at distant stars."
        </p>
        <p className="text-[11px] text-[#9E8681]/70">
          Yapper · An intimate, open-source voice companion by <span className="text-[#F07167]">PlaatoOS</span>. MIT Licensed.
        </p>
      </footer>
    </div>
  );
}
