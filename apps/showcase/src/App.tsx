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
    <div className="min-h-screen bg-[#140c0b] text-[#FFF8F4] flex flex-col justify-between selection:bg-[#C23B22] selection:text-[#FAF5EB] relative overflow-hidden font-sans">
      {/* Warm ambient desk lamp illumination */}
      <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[850px] h-[550px] bg-[radial-gradient(ellipse,rgba(227,74,59,0.18)_0%,rgba(217,152,59,0.08)_45%,transparent_75%)] blur-3xl pointer-events-none" />

      {/* Desk Header */}
      <header className="border-b border-[rgba(227,74,59,0.15)] bg-[#140c0b]/85 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#C23B22] to-[#E34A3B] flex items-center justify-center text-[#FAF5EB] font-serif italic text-base shadow-[0_2px_8px_rgba(194,59,34,0.4)]">
            y
          </div>
          <span className="font-serif italic font-medium text-xl tracking-tight text-[#FAF5EB]">
            Yapper
          </span>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#1c1211] text-[#D6C2B8] border border-[rgba(227,74,59,0.2)]">
            yapper.plaatoos.com
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-2 text-xs font-mono text-[#D6C2B8] bg-[#1c1211] px-3 py-1 rounded-full border border-[rgba(227,74,59,0.18)]">
            <span className={`w-2 h-2 rounded-full ${hasWebGpu ? 'bg-[#D9983B] shadow-[0_0_6px_#D9983B]' : 'bg-[#C23B22]'}`} />
            {hasWebGpu ? 'WebGPU Accelerated' : 'WASM CPU Mode'}
          </span>
          <a
            href="https://github.com/luisenriquecgongora/yapper"
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-1 rounded-full border border-[rgba(227,74,59,0.25)] hover:border-[#C23B22] hover:bg-[#1c1211] transition-all text-xs font-medium text-[#D6C2B8]"
          >
            GitHub
          </a>
        </div>
      </header>

      {/* Main Workspace (Desk Surface) */}
      <main className="max-w-4xl mx-auto px-4 md:px-6 py-10 flex-1 w-full space-y-10 relative z-10">
        
        {/* The Realistic Stationery Paper Sheet */}
        <div className="paper-stationery rounded-3xl p-6 md:p-12 text-[#251C17] relative transition-all">
          
          {/* Subtle Paper Top Margin / Letterhead */}
          <div className="border-b border-[#D9CDBE] pb-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-[#8C776E]">
            <div className="flex items-center gap-2 font-mono uppercase tracking-widest text-[10px]">
              <span className="w-2 h-2 rounded-full bg-[#C23B22]" />
              <span>Beautiful Handwritten Letters · Series IV</span>
            </div>
            <div className="font-serif italic text-xs text-[#736056]">
              "Every word stays quietly on this sheet."
            </div>
          </div>

          {/* Letter Title */}
          <div className="text-center space-y-3 mb-10">
            <h1 className="text-3xl md:text-5xl font-serif font-normal italic tracking-tight text-[#251C17] leading-[1.2]">
              Speak softly. <br className="hidden md:inline" />
              <span className="not-italic text-[#C23B22] font-normal">Your voice writes itself into thought.</span>
            </h1>
            <p className="text-[#736056] max-w-lg mx-auto text-xs md:text-sm leading-relaxed font-light">
              An intimate speech-to-text companion running entirely in the quiet of your browser via WebGPU. Never transmitted to the cloud. Zero data retention.
            </p>
          </div>

          {/* Interactive Layout inside Paper */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start mb-8">
            {/* Left: Vintage Embossed Model Controls */}
            <div className="md:col-span-5 space-y-4">
              <LocalModelCard
                progress={modelProgress}
                modelSize={modelSize}
                approxMb={modelSize === 'tiny' ? 40 : modelSize === 'base' ? 75 : 245}
                onDownload={downloadModel}
                onRemove={removeModel}
              />

              <div className="paper-card rounded-2xl p-4 space-y-3 text-[#594A42]">
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#8C776E] block font-semibold">
                  Model Scale
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['tiny', 'base', 'small'] as ModelSize[]).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setModelSize(size)}
                      className={`py-1.5 text-xs font-medium rounded-xl border transition-all capitalize cursor-pointer ${
                        modelSize === size
                          ? 'bg-[#FAF5EB] border-[#C23B22] text-[#C23B22] font-semibold shadow-sm'
                          : 'border-[#D9CDBE] text-[#8C776E] hover:border-[#C23B22]/50 hover:text-[#251C17]'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>

                <label className="text-[10px] font-mono uppercase tracking-wider text-[#8C776E] block font-semibold pt-1">
                  Spoken Tongue
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-[#FAF5EB] border border-[#D9CDBE] rounded-xl px-3 py-2 text-xs text-[#251C17] focus:outline-none focus:border-[#C23B22] transition-colors cursor-pointer"
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

            {/* Right: The Living Wax Seal Orb & Ruled Paper Transcript */}
            <div className="md:col-span-7 flex flex-col items-center justify-center p-6 md:p-8 rounded-2xl paper-card relative space-y-6 min-h-[380px]">
              {/* Presence badge */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-3 py-0.5 rounded-full border border-[#D9CDBE] bg-[#FAF5EB] text-[#736056] font-mono uppercase tracking-wider">
                  Active Presence: <strong className="text-[#C23B22]">{engine}</strong>
                </span>
              </div>

              {/* Living Wax Seal Voice Orb */}
              <TalkOrb
                size="lg"
                isListening={isListening}
                isProcessing={isTranscribing}
                audioLevel={audioLevel}
                onClick={handleOrbClick}
              />

              <span className="text-xs text-[#8C776E] font-serif italic tracking-wide">
                {isListening
                  ? 'Listening softly... click to pause'
                  : isTranscribing
                  ? 'Inking your words into memory...'
                  : 'Click the warm seal and speak aloud'}
              </span>

              {/* Ruled Paper Fountain Pen Transcript */}
              <div className="w-full min-h-[120px] p-5 rounded-xl bg-[#FAF5EB] border border-[#D9CDBE] shadow-inner paper-ruled flex flex-col justify-center relative overflow-hidden">
                <div className="absolute top-2 right-3 text-[9px] text-[#8C776E]/60 uppercase tracking-widest font-mono">
                  Ink Layer
                </div>

                {interimText ? (
                  <p className="text-[#C23B22] font-serif italic text-base md:text-lg leading-8 tracking-wide animate-pulse">
                    "{interimText}"
                  </p>
                ) : finalText ? (
                  <p className="text-[#251C17] font-serif text-base md:text-lg leading-8 tracking-wide">
                    "{finalText}"
                  </p>
                ) : (
                  <p className="text-[#8C776E]/70 text-sm font-serif italic text-center leading-8">
                    Your words will write themselves here in ink as breath turns into thought...
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Paper Bottom Sign-off */}
          <div className="border-t border-[#D9CDBE] pt-4 text-center">
            <span className="text-xs font-serif italic text-[#8C776E]">
              Handcrafted with fine WebGPU fibers · PlaatoOS Open Source
            </span>
          </div>
        </div>

        {/* Technical Appendix (Notebook Desk Tabs) */}
        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <h2 className="text-xl font-serif font-light text-[#FAF5EB]">Technical Appendix: Integration</h2>
            <p className="text-xs text-[#D6C2B8]/70">Zero-dependency, browser-native speech-to-text for your modern web applications.</p>
          </div>

          <div className="flex gap-2 border-b border-[rgba(227,74,59,0.2)] pb-2">
            <button
              onClick={() => setActiveTab('react')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                activeTab === 'react' ? 'bg-[#C23B22] text-[#FAF5EB]' : 'text-[#D6C2B8]/70 hover:text-[#FAF5EB]'
              }`}
            >
              React / Next.js
            </button>
            <button
              onClick={() => setActiveTab('vanilla')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                activeTab === 'vanilla' ? 'bg-[#C23B22] text-[#FAF5EB]' : 'text-[#D6C2B8]/70 hover:text-[#FAF5EB]'
              }`}
            >
              Vanilla JavaScript
            </button>
            <button
              onClick={() => setActiveTab('cloud')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                activeTab === 'cloud' ? 'bg-[#C23B22] text-[#FAF5EB]' : 'text-[#D6C2B8]/70 hover:text-[#FAF5EB]'
              }`}
            >
              Zero Data Retention Server
            </button>
          </div>

          <div className="p-5 rounded-2xl bg-[#1c1211] border border-[rgba(227,74,59,0.2)] font-mono text-xs text-[#D6C2B8] overflow-x-auto shadow-inner leading-relaxed">
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

      {/* Desk Surface Footer */}
      <footer className="border-t border-[rgba(227,74,59,0.15)] py-8 px-6 text-center text-xs text-[#8C776E] space-y-1 relative z-10">
        <p className="font-serif italic text-sm text-[#D6C2B8]">
          "Sometimes I look at you and I feel like I'm looking at distant stars."
        </p>
        <p className="text-[11px] text-[#8C776E]/80">
          Yapper · An intimate, open-source voice companion by <span className="text-[#C23B22]">PlaatoOS</span>. MIT Licensed.
        </p>
      </footer>
    </div>
  );
}
