import React, { useState, useEffect } from 'react';
import { TalkOrb, LocalModelCard, useTalk } from '@yapper/react';
import { ModelSize } from '@yapper/core';

export function App() {
  const [modelSize, setModelSize] = useState<ModelSize>('tiny');
  const [language, setLanguage] = useState<string>('english');
  const [preferredEngine, setPreferredEngine] = useState<'auto' | 'local' | 'browser'>('auto');
  const [activeTab, setActiveTab] = useState<'react' | 'vanilla' | 'cloud'>('react');
  const [hasWebGpu, setHasWebGpu] = useState<boolean>(false);
  
  // Continuous manuscript letter accumulator
  const [letterTranscript, setLetterTranscript] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

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
    modelProgress,
    start,
    stop,
    cancel,
    downloadModel,
    removeModel,
  } = useTalk({
    preferredEngine,
    modelSize,
    language,
    onFinal: (text) => {
      if (text) {
        setLetterTranscript((prev) => (prev ? `${prev} ${text}` : text));
      }
    },
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

  const handleClearSheet = () => {
    setLetterTranscript('');
    cancel();
  };

  const handleCopyLetter = () => {
    const fullText = [letterTranscript, interimText].filter(Boolean).join(' ').trim();
    if (!fullText) return;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const fullLetterText = [letterTranscript, interimText].filter(Boolean).join(' ').trim();
  const wordCount = fullLetterText ? fullLetterText.split(/\s+/).filter(Boolean).length : 0;
  const charCount = fullLetterText.length;

  const todayFormatted = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  return (
    <div className="min-h-screen text-[#251C17] flex flex-col justify-between selection:bg-[#C23B22] selection:text-[#FAF5EB] relative font-sans">
      
      {/* Subtle warm amber ambient lighting on the cotton paper */}
      <div className="fixed top-[-10%] left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-[radial-gradient(ellipse,rgba(227,74,59,0.08)_0%,rgba(217,152,59,0.04)_50%,transparent_75%)] blur-3xl pointer-events-none" />

      {/* Paper Stationery Header */}
      <header className="border-b border-[#D7C3AF]/60 bg-[#F7F3EA]/90 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#C23B22] to-[#E34A3B] flex items-center justify-center text-[#FAF5EB] font-serif italic text-base shadow-[0_2px_8px_rgba(194,59,34,0.35)] select-none">
            y
          </div>
          <div className="flex flex-col">
            <span className="font-serif italic font-medium text-xl tracking-tight text-[#251C17] leading-none">
              Yapper
            </span>
            <span className="text-[10px] uppercase font-mono tracking-widest text-[#8C776E] pt-0.5">
              Beautiful Handwritten Letters · Series IV
            </span>
          </div>
          <span className="hidden sm:inline-flex text-[11px] px-2.5 py-0.5 rounded-full bg-[#EFE7DC] text-[#736056] border border-[#D7C3AF]/70 font-mono">
            yapper.plaatoos.com
          </span>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-2 text-xs font-mono text-[#594A42] bg-[#EFE7DC] px-3 py-1 rounded-full border border-[#D7C3AF]/70 shadow-xs">
            <span className={`w-2 h-2 rounded-full ${hasWebGpu ? 'bg-[#D9983B] shadow-[0_0_6px_#D9983B]' : 'bg-[#C23B22]'}`} />
            {hasWebGpu ? 'WebGPU Accelerated' : 'WASM CPU Mode'}
          </span>
          <a
            href="https://github.com/luisenriquecgongora/yapper"
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-1 rounded-full border border-[#D7C3AF] hover:border-[#C23B22] hover:bg-[#F2EBE0] transition-all text-xs font-medium text-[#594A42]"
          >
            GitHub
          </a>
        </div>
      </header>

      {/* Main Desktop Split Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 flex-1 w-full space-y-12 relative z-10">
        
        {/* Top Split Layout: Left Controls & Wax Seal Orb | Right Full-Height Letter Sheet */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          
          {/* Left Column (5 Cols): Title, Voice Orb & Controls */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Poetic Title & Subtitle */}
            <div className="space-y-2">
              <h1 className="text-3xl sm:text-4xl font-serif font-normal italic tracking-tight text-[#251C17] leading-[1.2]">
                Speak softly. <br />
                <span className="not-italic text-[#C23B22] font-normal">Your voice writes itself into thought.</span>
              </h1>
              <p className="text-[#736056] text-xs sm:text-sm leading-relaxed font-light">
                An intimate speech-to-text companion running entirely in the quiet of your browser via WebGPU. Never transmitted to the cloud. Zero data retention.
              </p>
            </div>

            {/* Living Wax Seal Voice Orb Card */}
            <div className="paper-card rounded-3xl p-6 md:p-8 flex flex-col items-center justify-center space-y-5 text-center relative overflow-hidden">
              
              {/* Presence badge */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-3 py-1 rounded-full border border-[#D7C3AF] bg-[#FAF6EE] text-[#594A42] font-mono uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                  <span className={`w-1.5 h-1.5 rounded-full ${modelProgress.status === 'ready' || engine === 'browser' ? 'bg-[#D9983B]' : modelProgress.status === 'loading' ? 'bg-[#C23B22] animate-ping' : 'bg-[#8C776E]'}`} />
                  Active Presence:{' '}
                  <strong className="text-[#C23B22]">
                    {engine === 'browser'
                      ? 'Browser Native (Instant 0ms)'
                      : modelProgress.status === 'ready'
                      ? 'On-Device WebGPU (Fast 4-bit)'
                      : modelProgress.status === 'loading'
                      ? 'Awakening WebGPU...'
                      : engine}
                  </strong>
                </span>
              </div>

              {/* The Living Wax Seal Voice Orb */}
              <TalkOrb
                size="lg"
                isListening={isListening}
                isProcessing={isTranscribing}
                audioLevel={audioLevel}
                onClick={handleOrbClick}
              />

              <span className="text-xs text-[#736056] font-serif italic tracking-wide">
                {isListening
                  ? 'Listening softly... click to pause'
                  : isTranscribing
                  ? 'Inking your words into memory...'
                  : modelProgress.status === 'loading'
                  ? 'Awakening WebGPU pipeline...'
                  : modelProgress.status === 'downloading'
                  ? 'Receiving neural weights...'
                  : 'Click the warm seal and speak aloud'}
              </span>
            </div>

            {/* Embossed Controls Card */}
            <div className="paper-card rounded-2xl p-5 space-y-4 text-[#594A42]">
              
              {/* Architecture Selector */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#8C776E] block font-semibold mb-1.5">
                  Engine Architecture
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPreferredEngine('local')}
                    className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all text-center cursor-pointer ${
                      preferredEngine === 'local' || (preferredEngine === 'auto' && modelProgress.status === 'ready')
                        ? 'bg-[#FAF6EE] border-[#C23B22] text-[#C23B22] font-semibold shadow-xs'
                        : 'border-[#D7C3AF] text-[#8C776E] hover:border-[#C23B22]/50 hover:text-[#251C17]'
                    }`}
                  >
                    <span>✦ WebGPU (Private)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferredEngine('browser')}
                    className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all text-center cursor-pointer ${
                      preferredEngine === 'browser'
                        ? 'bg-[#FAF6EE] border-[#C23B22] text-[#C23B22] font-semibold shadow-xs'
                        : 'border-[#D7C3AF] text-[#8C776E] hover:border-[#C23B22]/50 hover:text-[#251C17]'
                    }`}
                  >
                    <span>⚡ Native (Instant)</span>
                  </button>
                </div>
              </div>

              {/* Model Scale */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#8C776E] block font-semibold mb-1.5">
                  Model Scale (WebGPU)
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['tiny', 'base', 'small'] as ModelSize[]).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setModelSize(size)}
                      className={`py-1.5 text-xs font-medium rounded-xl border transition-all capitalize cursor-pointer ${
                        modelSize === size
                          ? 'bg-[#FAF6EE] border-[#C23B22] text-[#C23B22] font-semibold shadow-xs'
                          : 'border-[#D7C3AF] text-[#8C776E] hover:border-[#C23B22]/50 hover:text-[#251C17]'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Spoken Tongue */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#8C776E] block font-semibold mb-1.5">
                  Spoken Tongue
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-[#FAF6EE] border border-[#D7C3AF] rounded-xl px-3 py-2 text-xs text-[#251C17] focus:outline-none focus:border-[#C23B22] transition-colors cursor-pointer"
                >
                  <option value="english">English</option>
                  <option value="spanish">Spanish (Español)</option>
                  <option value="polish">Polish (Polski)</option>
                  <option value="french">French (Français)</option>
                  <option value="german">German (Deutsch)</option>
                  <option value="korean">Korean (한국어)</option>
                  <option value="italian">Italian (Italiano)</option>
                  <option value="ukrainian">Ukrainian (Українська)</option>
                  <option value="russian">Russian (Русский)</option>
                </select>
              </div>
            </div>

            {/* Local Model Download / Cache Card */}
            <LocalModelCard
              progress={modelProgress}
              modelSize={modelSize}
              approxMb={modelSize === 'tiny' ? 28 : modelSize === 'base' ? 48 : 145}
              onDownload={downloadModel}
              onRemove={removeModel}
            />
          </div>

          {/* Right Column (7 Cols): Dedicated Cotton Paper Manuscript Letter */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="manuscript-sheet rounded-3xl p-6 sm:p-10 lg:p-12 min-h-[640px] flex flex-col justify-between relative transition-all">
              
              {/* Paper Top Margin / Letterhead & Actions */}
              <div className="border-b border-[#D7C3AF]/80 pb-5 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-[#8C776E]">
                <div className="flex items-center gap-2.5 font-mono uppercase tracking-widest text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#C23B22] shadow-[0_0_6px_rgba(194,59,34,0.4)]" />
                  <span className="text-[#251C17] font-semibold">{todayFormatted}</span>
                  <span className="text-[#8C776E]/60">·</span>
                  <span className="font-serif italic capitalize text-[#736056] text-xs">Series IV Letter</span>
                </div>

                {/* Letter Actions: Copy & Clear */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyLetter}
                    disabled={!fullLetterText}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                      copied
                        ? 'bg-[#EAF5E9] border-[#4A7C59] text-[#2D5A38]'
                        : fullLetterText
                        ? 'border-[#D7C3AF] hover:border-[#C23B22] hover:bg-[#FAF6EE] text-[#594A42]'
                        : 'border-[#D7C3AF]/40 text-[#8C776E]/40 cursor-not-allowed'
                    }`}
                  >
                    <span>{copied ? '✓ Letter Copied' : 'Copy Letter'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClearSheet}
                    disabled={!fullLetterText && !isListening}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      fullLetterText || isListening
                        ? 'border-[#D7C3AF] hover:border-[#C23B22] hover:text-[#C23B22] hover:bg-[#FAF6EE] text-[#8C776E]'
                        : 'border-[#D7C3AF]/40 text-[#8C776E]/40 cursor-not-allowed'
                    }`}
                  >
                    Clear Sheet
                  </button>
                </div>
              </div>

              {/* Manuscript Writing Body */}
              <div className="flex-1 paper-ruled py-2">
                <div className="font-serif text-lg sm:text-xl lg:text-[21px] leading-[34px] tracking-wide whitespace-pre-wrap min-h-[420px]">
                  {fullLetterText ? (
                    <>
                      {/* Past finalized sentences in permanent walnut ink */}
                      {letterTranscript && (
                        <span className="text-[#251C17] font-normal">
                          {letterTranscript}{' '}
                        </span>
                      )}

                      {/* Current live streaming speech in vermilion red ink */}
                      {interimText && (
                        <span className="text-[#C23B22] italic font-normal inline animate-pulse">
                          {interimText}
                          <span className="inline-block w-1.5 h-5 ml-1 bg-[#C23B22] animate-ping align-middle opacity-80" />
                        </span>
                      )}
                    </>
                  ) : (
                    /* Poetic Letter Placeholder */
                    <div className="h-full min-h-[380px] flex flex-col items-center justify-center text-center text-[#8C776E]/65 italic space-y-3 select-none px-4">
                      <span className="text-3xl font-serif text-[#C23B22]/40">❦</span>
                      <p className="max-w-md text-base sm:text-lg leading-relaxed">
                        "Every breath turns quietly into ink on this sheet."
                      </p>
                      <span className="text-[11px] font-mono tracking-widest uppercase opacity-75 pt-2 text-[#736056]">
                        Click the warm wax seal on the left and speak aloud
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Manuscript Bottom Sign-off & Statistics */}
              <div className="border-t border-[#D7C3AF]/80 pt-5 mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#8C776E]">
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
                  <span>·</span>
                  <span>{charCount} characters</span>
                </div>

                <div className="font-serif italic text-xs text-[#736056] flex items-center gap-2">
                  <span className="text-base text-[#C23B22]">✦</span>
                  <span>Handcrafted with fine WebGPU fibers · 100% Private</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Technical Appendix: Developer Integration (Positioned Below) */}
        <section className="space-y-5 pt-8 border-t border-[#D7C3AF]/60">
          <div className="space-y-1">
            <h2 className="text-2xl font-serif font-light text-[#251C17]">
              Technical Appendix: Integration
            </h2>
            <p className="text-xs text-[#736056]">
              Zero-dependency, browser-native speech-to-text SDK for your modern web applications.
            </p>
          </div>

          <div className="flex gap-2 border-b border-[#D7C3AF]/70 pb-2">
            <button
              onClick={() => setActiveTab('react')}
              className={`px-4 py-2 text-xs font-medium rounded-xl transition-all cursor-pointer ${
                activeTab === 'react'
                  ? 'bg-[#C23B22] text-[#FAF5EB] shadow-xs'
                  : 'text-[#736056] hover:text-[#251C17] hover:bg-[#F2EBE0]'
              }`}
            >
              React / Next.js
            </button>
            <button
              onClick={() => setActiveTab('vanilla')}
              className={`px-4 py-2 text-xs font-medium rounded-xl transition-all cursor-pointer ${
                activeTab === 'vanilla'
                  ? 'bg-[#C23B22] text-[#FAF5EB] shadow-xs'
                  : 'text-[#736056] hover:text-[#251C17] hover:bg-[#F2EBE0]'
              }`}
            >
              Vanilla JavaScript
            </button>
            <button
              onClick={() => setActiveTab('cloud')}
              className={`px-4 py-2 text-xs font-medium rounded-xl transition-all cursor-pointer ${
                activeTab === 'cloud'
                  ? 'bg-[#C23B22] text-[#FAF5EB] shadow-xs'
                  : 'text-[#736056] hover:text-[#251C17] hover:bg-[#F2EBE0]'
              }`}
            >
              Zero Data Retention Server
            </button>
          </div>

          <div className="p-6 rounded-2xl bg-[#251C17] border border-[#3A2D25] font-mono text-xs text-[#EADFD0] overflow-x-auto shadow-sm leading-relaxed">
            {activeTab === 'react' && (
              <pre>{`import { useTalk, TalkOrb, LocalModelCard } from '@yapper/react';

export function VoiceCompanion() {
  const { isListening, isTranscribing, audioLevel, interimText, finalText, start, stop } = useTalk({
    preferredEngine: 'auto', // 'local' (WebGPU Whisper) | 'browser' (Instant Native)
    modelSize: 'tiny',       // 28MB fast 4-bit Whisper on-device
    onFinal: (text) => console.log('Letter sentence:', text),
  });

  return (
    <div className="flex flex-col items-center gap-6">
      <TalkOrb
        size="lg"
        isListening={isListening}
        isProcessing={isTranscribing}
        audioLevel={audioLevel}
        onClick={isListening ? stop : start}
      />
      {interimText && <p className="text-red-600 italic">"{interimText}"</p>}
      {finalText && <p className="text-stone-900">"{finalText}"</p>}
    </div>
  );
}`}</pre>
            )}

            {activeTab === 'vanilla' && (
              <pre>{`import { TalkClient } from '@yapper/core';

const client = new TalkClient({
  preferredEngine: 'auto',
  modelSize: 'tiny',
  onInterim: (words) => console.log('Living words:', words),
  onFinal: (sentence) => console.log('Committed sentence:', sentence),
});

// Start streaming push-to-talk
const session = await client.start();

// Finish speaking and get final transcript
const transcript = await client.stop();`}</pre>
            )}

            {activeTab === 'cloud' && (
              <pre>{`# Run the Zero Data Retention gateway
cd packages/server && yarn start

# Configure TalkClient to stream to your self-hosted proxy
const client = new TalkClient({
  preferredEngine: 'cloud',
  cloudEndpoint: 'https://your-domain.com/api/transcribe',
});`}</pre>
            )}
          </div>
        </section>

      </main>

      {/* Paper Footer */}
      <footer className="border-t border-[#D7C3AF]/60 py-6 text-center text-xs text-[#8C776E] font-serif italic">
        Handcrafted with fine WebGPU fibers · PlaatoOS Open Source · Zero cloud footprint
      </footer>
    </div>
  );
}
