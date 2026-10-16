import React, { useState, useEffect } from 'react';
import { TalkOrb } from '../../packages/react/src/TalkOrb';
import { LocalModelCard } from '../../packages/react/src/LocalModelCard';
import { useTalk } from '../../packages/react/src/useTalk';
import { ModelSize } from '../../packages/core/src/types';

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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-teal-500 selection:text-black">
      {/* Navbar */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-500 flex items-center justify-center text-teal-400 font-bold font-mono">
            Y
          </div>
          <span className="font-bold text-lg tracking-tight text-white">
            Yapper
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            yapper.plaatoos.com
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-xs font-mono text-slate-400 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800">
            <span className={`w-2 h-2 rounded-full ${hasWebGpu ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {hasWebGpu ? 'WebGPU Accelerated' : 'WASM CPU Mode'}
          </span>
          <a
            href="https://github.com/plaatoos/yapper"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-lg border border-slate-800 hover:border-teal-500/50 hover:bg-slate-900 transition-all text-xs font-medium text-slate-300"
          >
            GitHub (OSS)
          </a>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-6 py-12 flex-1 w-full space-y-12">
        {/* Hero title */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-400 text-xs font-medium">
            <span>⚡ Zero-Server Speech-to-Text</span>
            <span>·</span>
            <span>100% Private In-Browser Whisper</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white">
            Real-Time Voice for Web & Desktop.
          </h1>
          <p className="text-slate-400 max-w-2xl mx-auto text-base">
            Run open-source Whisper in WebAssembly & WebGPU with zero cloud costs, or fall back to native Web Speech API and cloud streams. Zero data retention.
          </p>
        </div>

        {/* Live Interactive Sandbox */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Left: Model Controls */}
          <div className="md:col-span-5 space-y-6">
            <LocalModelCard
              progress={modelProgress}
              modelSize={modelSize}
              approxMb={modelSize === 'tiny' ? 40 : modelSize === 'base' ? 75 : 245}
              onDownload={downloadModel}
              onRemove={removeModel}
            />

            <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-3">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                Model Preset
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['tiny', 'base', 'small'] as ModelSize[]).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setModelSize(size)}
                    className={`py-1.5 text-xs font-medium rounded-lg border transition-all capitalize ${
                      modelSize === size
                        ? 'bg-teal-500/20 border-teal-500 text-teal-300 font-bold'
                        : 'border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>

              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block pt-2">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
              >
                <option value="english">English</option>
                <option value="spanish">Spanish</option>
                <option value="polish">Polish</option>
                <option value="german">German</option>
                <option value="french">French</option>
                <option value="korean">Korean</option>
              </select>
            </div>
          </div>

          {/* Right: Interactive Orb & Streaming Live Text */}
          <div className="md:col-span-7 flex flex-col items-center justify-center p-8 rounded-3xl border border-slate-800 bg-slate-900/40 backdrop-blur-xl relative space-y-8 min-h-[440px]">
            {/* Top State Badge */}
            <div className="flex items-center gap-2">
              <span className="text-xs px-3 py-1 rounded-full border border-teal-500/40 bg-teal-500/10 text-teal-300 font-mono">
                Active Engine: <strong className="uppercase">{engine}</strong>
              </span>
            </div>

            {/* Glowing Reactive Orb */}
            <TalkOrb
              size="lg"
              isListening={isListening}
              isProcessing={isTranscribing}
              audioLevel={audioLevel}
              onClick={handleOrbClick}
            />

            <span className="text-xs text-slate-400">
              {isListening
                ? 'Click orb to finish speaking'
                : isTranscribing
                ? 'Transcribing audio buffer...'
                : 'Click orb to speak'}
            </span>

            {/* Live Streaming Transcript Card */}
            <div className="w-full min-h-[96px] p-4 rounded-2xl bg-slate-950 border border-slate-800/80 flex flex-col justify-center">
              {interimText ? (
                <p className="text-teal-300 text-sm font-medium animate-pulse">
                  {interimText}
                </p>
              ) : finalText ? (
                <p className="text-slate-100 text-sm leading-relaxed">
                  "{finalText}"
                </p>
              ) : (
                <p className="text-slate-600 text-sm italic text-center">
                  Your spoken transcript will appear here in real time...
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Integration Code Tabs */}
        <div className="space-y-4 pt-6">
          <h2 className="text-xl font-bold text-white">Embed In Your Application</h2>
          <div className="flex gap-2 border-b border-slate-800 pb-2">
            <button
              onClick={() => setActiveTab('react')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'react' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              React / Next.js
            </button>
            <button
              onClick={() => setActiveTab('vanilla')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'vanilla' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Vanilla JS / Script Tag
            </button>
            <button
              onClick={() => setActiveTab('cloud')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'cloud' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Zero Data Retention Cloud Server
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto">
            {activeTab === 'react' && (
              <pre>{`import { useYapper, YapperOrb, YapperDictationPill } from '@yapper/react';

export function VoiceComponent() {
  const { isListening, isTranscribing, audioLevel, interimText, start, stop } = useYapper({
    preferredEngine: 'auto', // 'local' | 'browser' | 'cloud'
    modelSize: 'tiny',       // 40MB on-device Whisper WebGPU
    onFinal: (text) => console.log('Final text:', text),
  });

  return (
    <div>
      <YapperOrb isListening={isListening} isProcessing={isTranscribing} audioLevel={audioLevel} onClick={isListening ? stop : start} />
      <YapperDictationPill status={isListening ? 'listening' : 'idle'} engine="local" interimText={interimText} />
    </div>
  );
}`}</pre>
            )}

            {activeTab === 'vanilla' && (
              <pre>{`import { YapperClient } from '@yapper/core';

const yapper = new YapperClient({
  preferredEngine: 'auto',
  onInterim: (words) => console.log('Live words:', words),
  onFinal: (text) => console.log('Result:', text),
});

// Start streaming push-to-talk
const session = await yapper.start();

// Stop and get final text
const transcript = await yapper.stop();`}</pre>
            )}

            {activeTab === 'cloud' && (
              <pre>{`# Run the Zero Data Retention gateway
cd packages/server && yarn start

# Transcribe any audio via curl
curl -X POST http://localhost:8089/api/transcribe \\
  -F "file=@recording.webm" \\
  -F "language=en"`}</pre>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 px-6 text-center text-xs text-slate-500">
        Yapper is an open-source project by <strong className="text-slate-400">PlaatoOS</strong>. MIT Licensed.
      </footer>
    </div>
  );
}
