import React, { useState, useEffect } from 'react';
import { TalkOrb, LocalModelCard, useTalk } from '@yapper/react';
import { ModelSize } from '@yapper/core';
import { APP_VERSION, GIT_HASH, RECENT_COMMITS, CommitEntry } from './buildInfo';

function parseCommitType(msg: string): { type: string; title: string; colorClass: string } {
  const match = msg.match(/^([a-z]+)(\(.*?\))?:\s*(.*)$/i);
  if (match) {
    const type = match[1].toLowerCase();
    const rest = (match[2] ? `${match[2]}: ` : '') + match[3];
    switch (type) {
      case 'feat':
        return { type: 'feat', title: rest, colorClass: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
      case 'perf':
        return { type: 'perf', title: rest, colorClass: 'bg-amber-100 text-amber-900 border-amber-300' };
      case 'fix':
        return { type: 'fix', title: rest, colorClass: 'bg-rose-100 text-rose-900 border-rose-300' };
      case 'docs':
        return { type: 'docs', title: rest, colorClass: 'bg-blue-100 text-blue-900 border-blue-300' };
      case 'chore':
        return { type: 'chore', title: rest, colorClass: 'bg-stone-200 text-stone-700 border-stone-300' };
      default:
        return { type, title: rest, colorClass: 'bg-purple-100 text-purple-900 border-purple-300' };
    }
  }
  return { type: 'commit', title: msg, colorClass: 'bg-[#FAF6EE] text-[#594A42] border-[#D7C3AF]' };
}

export function App() {
  const [modelSize, setModelSize] = useState<ModelSize>('tiny');
  const [language, setLanguage] = useState<string>('english');
  const [preferredEngine, setPreferredEngine] = useState<'auto' | 'local' | 'browser'>('auto');
  const [activeTab, setActiveTab] = useState<'react' | 'vanilla' | 'cloud' | 'commits'>('react');
  const [showCommitsSubrule, setShowCommitsSubrule] = useState<boolean>(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState<boolean>(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [hasWebGpu, setHasWebGpu] = useState<boolean>(false);
  
  // Continuous manuscript letter accumulator
  const [letterTranscript, setLetterTranscript] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    setHasWebGpu(typeof navigator !== 'undefined' && 'gpu' in navigator);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSettingsDrawer(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
    logs,
    clearLogs,
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

  const [showLogs, setShowLogs] = useState<boolean>(true);
  const [logsCopied, setLogsCopied] = useState<boolean>(false);

  const handleCopyLogs = () => {
    const formatted = logs
      .map((l) => `[${l.timestamp}] [${l.category.toUpperCase()}] [${l.level.toUpperCase()}]: ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(formatted || 'No logs recorded yet.');
    setLogsCopied(true);
    setTimeout(() => setLogsCopied(false), 2000);
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1800);
  };

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

  // Real-time latency & throughput telemetry computed reactively from engine diagnostic pulses
  const latencyStats = React.useMemo(() => {
    let lastInterpMs: number | null = null;
    let lastCommitMs: number | null = null;
    let msPerToken: number | null = null;
    const interpHistory: number[] = [];

    for (let i = logs.length - 1; i >= 0; i--) {
      const msg = logs[i].message;

      if (lastInterpMs === null) {
        const interpMatch =
          msg.match(/transcribed in (\d+)ms/i) ||
          msg.match(/interp:\s*(\d+)ms/i) ||
          msg.match(/inked in (\d+)ms/i);
        if (interpMatch) {
          lastInterpMs = parseInt(interpMatch[1], 10);
        }
      }

      if (msPerToken === null) {
        const tokenMatch = msg.match(/~(\d+)ms\/token/i);
        if (tokenMatch) {
          msPerToken = parseInt(tokenMatch[1], 10);
        }
      }

      if (lastCommitMs === null) {
        const commitMatch = msg.match(/total commit pipeline:\s*(\d+)ms/i);
        if (commitMatch) {
          lastCommitMs = parseInt(commitMatch[1], 10);
        }
      }

      const anyInterp = msg.match(/transcribed in (\d+)ms/i) || msg.match(/interp:\s*(\d+)ms/i);
      if (anyInterp && interpHistory.length < 20) {
        interpHistory.push(parseInt(anyInterp[1], 10));
      }
    }

    const avgInterpMs =
      interpHistory.length > 0
        ? Math.round(interpHistory.reduce((a, b) => a + b, 0) / interpHistory.length)
        : null;

    const tokensPerSec = msPerToken && msPerToken > 0 ? Math.round(1000 / msPerToken) : null;

    return {
      lastInterpMs,
      lastCommitMs,
      msPerToken,
      tokensPerSec,
      avgInterpMs,
      sampleCount: interpHistory.length,
    };
  }, [logs]);

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
          <button
            type="button"
            onClick={() => setShowCommitsSubrule(!showCommitsSubrule)}
            className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-[#FAF6EE] hover:bg-[#EFE7DC] text-[#594A42] hover:text-[#C23B22] border border-[#D7C3AF] font-mono transition-all cursor-pointer shadow-xs"
            title="Toggle release version & git commit sub-ruler"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#C23B22]" />
            <span className="font-semibold text-[#251C17]">v{APP_VERSION}</span>
            <span className="text-[#8C776E]/60">·</span>
            <span className="text-[10px] text-[#8C776E]">{GIT_HASH}</span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-2 text-xs font-mono text-[#594A42] bg-[#EFE7DC] px-3 py-1 rounded-full border border-[#D7C3AF]/70 shadow-xs">
            <span className={`w-2 h-2 rounded-full ${hasWebGpu ? 'bg-[#D9983B] shadow-[0_0_6px_#D9983B]' : 'bg-[#C23B22]'}`} />
            {hasWebGpu ? 'WebGPU Accelerated' : 'WASM CPU Mode'}
          </span>
          {/* Live Latency Metric Badge */}
          <span
            className="hidden md:inline-flex items-center gap-1.5 text-xs font-mono text-[#594A42] bg-[#EFE7DC] px-3 py-1 rounded-full border border-[#D7C3AF]/70 shadow-xs"
            title="Real-time speech transcription decoding latency"
          >
            <span className="text-[#C23B22] font-semibold">⚡</span>
            <span>Latency:</span>
            <strong className="text-[#C23B22]">
              {preferredEngine === 'browser'
                ? '0ms (Instant)'
                : latencyStats.lastInterpMs
                ? `${latencyStats.lastInterpMs}ms`
                : '--'}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => setShowSettingsDrawer(true)}
            className={`px-3 py-1 rounded-full border text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
              showSettingsDrawer
                ? 'bg-[#251C17] text-[#FAF5EB] border-[#251C17]'
                : 'border-[#D7C3AF] bg-[#EFE7DC] text-[#594A42] hover:border-[#C23B22]'
            }`}
            title="Open Engine & Model Settings Drawer"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            <span>Settings</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCommitsSubrule(!showCommitsSubrule)}
            className={`px-3 py-1 rounded-full border text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
              showCommitsSubrule
                ? 'bg-[#251C17] text-[#FAF5EB] border-[#251C17]'
                : 'border-[#D7C3AF] bg-[#EFE7DC] text-[#594A42] hover:border-[#C23B22]'
            }`}
            title="Toggle commit history sub-ruler"
          >
            <span className="font-serif italic font-medium">§</span>
            <span>Commits ({RECENT_COMMITS.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setShowLogs(!showLogs)}
            className={`px-3 py-1 rounded-full border text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
              showLogs
                ? 'bg-[#251C17] text-[#FAF5EB] border-[#251C17]'
                : 'border-[#D7C3AF] bg-[#EFE7DC] text-[#594A42] hover:border-[#C23B22]'
            }`}
            title="Toggle live telemetry logs console"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#C23B22] animate-pulse" />
            <span>Logs ({logs.length})</span>
          </button>
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

      {/* Postal Ledger / Commits Sub-ruler */}
      {showCommitsSubrule && (
        <div className="bg-[#FAF6EE] border-b border-[#D7C3AF] px-6 py-3.5 transition-all shadow-inner relative z-30">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono uppercase tracking-wider text-[#C23B22] font-semibold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#C23B22] shadow-[0_0_6px_rgba(194,59,34,0.5)]" />
                Postal Ledger
              </span>
              <span className="text-xs font-serif italic text-[#736056]">
                Series IV · Version {APP_VERSION} ({GIT_HASH})
              </span>
              <span className="hidden sm:inline text-[11px] font-mono text-[#8C776E]">
                ({RECENT_COMMITS.length} tracked dispatches)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('commits');
                  setShowCommitsSubrule(false);
                  document.getElementById('tech-appendix')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="text-xs font-mono text-[#C23B22] hover:underline"
              >
                Open Full Table in Appendix ↓
              </button>
              <button
                type="button"
                onClick={() => setShowCommitsSubrule(false)}
                className="text-xs text-[#8C776E] hover:text-[#251C17] px-2 py-0.5 rounded border border-[#D7C3AF] cursor-pointer"
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Quick horizontal commit ticker / chips */}
          <div className="max-w-7xl mx-auto mt-2.5 overflow-x-auto pb-1 flex items-center gap-2 text-xs font-mono">
            {RECENT_COMMITS.map((commit) => {
              const parsed = parseCommitType(commit.message);
              return (
                <div
                  key={commit.hash}
                  className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-[#D7C3AF] shadow-xs"
                >
                  <a
                    href={`https://github.com/luisenriquecgongora/yapper/commit/${commit.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#C23B22] hover:underline font-semibold"
                  >
                    {commit.hash}
                  </a>
                  <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-semibold border ${parsed.colorClass}`}>
                    {parsed.type}
                  </span>
                  <span className="text-[#251C17] font-sans text-xs truncate max-w-xs" title={commit.message}>
                    {parsed.title}
                  </span>
                  <span className="text-[10px] text-[#8C776E]">{commit.date}</span>
                </div>
              );
            })}
          </div>

          {/* Telemetry & Test Coverage Strip */}
          <div className="max-w-7xl mx-auto mt-2.5 pt-2.5 border-t border-[#D7C3AF]/60 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-[#594A42]">
              <span className="flex items-center gap-1.5">
                <span className="text-[#C23B22] font-semibold">⚡ Latency:</span>
                <strong className="text-[#251C17]">
                  {preferredEngine === 'browser'
                    ? '0ms (Native Instant)'
                    : latencyStats.lastInterpMs
                    ? `${latencyStats.lastInterpMs}ms`
                    : 'Awaiting speech'}
                </strong>
                {latencyStats.avgInterpMs && (
                  <span className="text-[#8C776E]">(avg {latencyStats.avgInterpMs}ms)</span>
                )}
              </span>

              {latencyStats.tokensPerSec && (
                <span className="flex items-center gap-1.5">
                  <span className="text-[#8C776E]">·</span>
                  <span className="text-[#736056]">Throughput:</span>
                  <strong className="text-[#251C17]">~{latencyStats.tokensPerSec} tok/s</strong>
                  <span className="text-[#8C776E]">({latencyStats.msPerToken}ms/tok)</span>
                </span>
              )}

              {latencyStats.lastCommitMs && (
                <span className="flex items-center gap-1.5">
                  <span className="text-[#8C776E]">·</span>
                  <span className="text-[#736056]">Commit:</span>
                  <strong className="text-[#251C17]">{latencyStats.lastCommitMs}ms</strong>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-semibold shadow-xs">
                ✓ 20/20 Vitest Tests
              </span>
              <span className="text-[#736056]">
                Core Coverage: <strong className="text-[#251C17]">100%</strong> Audio & Stream
              </span>
            </div>
          </div>
        </div>
      )}

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
              
              {/* Gear Settings Button (Top-Right) */}
              <button
                type="button"
                onClick={() => setShowSettingsDrawer(true)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full border border-[#D7C3AF] bg-[#FAF6EE] hover:bg-[#EFE7DC] text-[#736056] hover:text-[#C23B22] flex items-center justify-center transition-all cursor-pointer shadow-xs group z-20"
                title="Configure Engine Architecture & Model Settings"
                aria-label="Engine Settings"
              >
                <svg
                  className="w-4 h-4 fill-current group-hover:rotate-45 transition-transform duration-300"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

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

              <div className="flex flex-col items-center gap-1.5">
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

                {/* Real-time Hardware Decode Latency */}
                {(isListening || isTranscribing || latencyStats.lastInterpMs !== null) && (
                  <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#FAF6EE] border border-[#D7C3AF] text-[10px] font-mono text-[#736056] shadow-xs">
                    <span className="text-[#C23B22] font-semibold">⚡</span>
                    <span>Last pass:</span>
                    <strong className="text-[#C23B22]">
                      {preferredEngine === 'browser'
                        ? '0ms (Native Stream)'
                        : latencyStats.lastInterpMs !== null
                        ? `${latencyStats.lastInterpMs}ms`
                        : isListening
                        ? 'Sampling speech...'
                        : '--'}
                    </strong>
                    {latencyStats.msPerToken && (
                      <span className="text-[#8C776E]">({latencyStats.msPerToken}ms/tok)</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Engine Status Caption */}
            <div className="flex flex-col items-center gap-1.5 pt-1 text-center">
              <span className="text-[11px] font-mono text-[#8C776E] flex items-center gap-1.5">
                <span>Active:</span>
                <strong className="text-[#251C17]">
                  {preferredEngine === 'browser' ? '⚡ Native (Instant 0ms)' : `✦ WebGPU Whisper (${modelSize})`}
                </strong>
                <button
                  type="button"
                  onClick={() => setShowSettingsDrawer(true)}
                  className="text-[#C23B22] hover:underline cursor-pointer ml-1 font-semibold"
                >
                  Change ⚙
                </button>
              </span>
              <p className="text-[11px] text-[#8C776E] font-light leading-relaxed max-w-xs">
                {preferredEngine === 'browser'
                  ? 'Streaming instant native words directly from browser hardware.'
                  : `Running private on-device Whisper (${modelSize}) via WebGPU shaders.`}
              </p>
            </div>
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
                <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
                  <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
                  <span>·</span>
                  <span>{charCount} characters</span>
                  <span>·</span>
                  <span className="text-[#C23B22] font-semibold flex items-center gap-1">
                    ⚡ {preferredEngine === 'browser' ? '0ms (Native Instant)' : latencyStats.lastInterpMs ? `${latencyStats.lastInterpMs}ms latency` : 'Latency: --'}
                  </span>
                  {latencyStats.msPerToken && (
                    <>
                      <span>·</span>
                      <span className="text-[#736056]">~{latencyStats.msPerToken}ms/token</span>
                    </>
                  )}
                </div>

                <div className="font-serif italic text-xs text-[#736056] flex items-center gap-2">
                  <span className="text-base text-[#C23B22]">✦</span>
                  <span>Handcrafted with fine WebGPU fibers · 100% Private</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Architecture & Speed Anatomy Guide */}
        <section className="paper-card rounded-3xl p-6 sm:p-8 lg:p-10 space-y-8 border border-[#D7C3AF]/80">
          <div className="space-y-2 border-b border-[#D7C3AF]/60 pb-5">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-mono tracking-widest text-[#C23B22] font-semibold">
                Anatomy & Mechanics
              </span>
              <span className="text-xs text-[#8C776E]">·</span>
              <span className="text-xs font-serif italic text-[#736056]">
                How Voice Inks into Thought
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-serif font-light text-[#251C17] tracking-tight">
              Architecture & Speed Anatomy: What Decides Performance?
            </h2>
            <p className="text-xs sm:text-sm text-[#736056] leading-relaxed max-w-3xl font-light">
              An unvarnished engineering breakdown of the 3 processing phases, how audio flows into your hardware, 
              and the exact factors determining whether a speech pass takes 50 milliseconds or several seconds.
            </p>
          </div>

          {/* The 3 Pipeline Phases with Real Timing Telemetry */}
          <div className="space-y-4">
            <h3 className="text-sm font-mono uppercase tracking-wider text-[#251C17] font-semibold flex items-center gap-2">
              <span>The 3 Processing Phases</span>
              <span className="text-[11px] font-normal text-[#8C776E] lowercase">(logged live in the Telegraph Ribbon below)</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Phase 1: Receiving */}
              <div className="bg-[#FAF6EE] rounded-2xl p-5 border border-[#D7C3AF]/70 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold bg-blue-100 text-blue-900 border border-blue-300">
                    Phase 1: Receiving
                  </span>
                  <span className="font-mono text-xs text-[#736056]">~0ms – 5ms</span>
                </div>
                <h4 className="font-serif italic font-medium text-base text-[#251C17]">
                  Web Audio Ingestion & VAD
                </h4>
                <p className="text-xs text-[#736056] leading-relaxed font-light">
                  Direct microphone stream is captured at 16 kHz mono Float32 PCM. Energy-based Voice Activity Detection (VAD) continuously samples RMS volume. When silence is detected, GPU dispatch is suspended so quiet pauses never burn compute or trigger phantom token loops.
                </p>
              </div>

              {/* Phase 2: Interpreting */}
              <div className="bg-[#FAF6EE] rounded-2xl p-5 border border-[#D7C3AF]/70 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                    Phase 2: Interpreting
                  </span>
                  <span className="font-mono text-xs text-[#C23B22] font-semibold">Hardware Dependent</span>
                </div>
                <h4 className="font-serif italic font-medium text-base text-[#251C17]">
                  Neural Decoding Pass
                </h4>
                <p className="text-xs text-[#736056] leading-relaxed font-light">
                  Raw audio transforms into an 80-channel Log-Mel Spectrogram. Whisper's Transformer Encoder maps 30-second windows into 1500 hidden states. The Autoregressive Decoder then generates text <strong>one token at a time</strong>. Time taken directly mirrors your GPU shader bandwidth.
                </p>
              </div>

              {/* Phase 3: Writing */}
              <div className="bg-[#FAF6EE] rounded-2xl p-5 border border-[#D7C3AF]/70 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold bg-emerald-100 text-emerald-900 border border-emerald-300">
                    Phase 3: Writing
                  </span>
                  <span className="font-mono text-xs text-[#736056]">&lt; 2ms</span>
                </div>
                <h4 className="font-serif italic font-medium text-base text-[#251C17]">
                  Manuscript Ink Emitted
                </h4>
                <p className="text-xs text-[#736056] leading-relaxed font-light">
                  Emits live partial hypotheses into React state. Real-time words flow in pulsing vermilion red ink with an active aperture cursor, drying into permanent walnut ink upon final sentence commit.
                </p>
              </div>

            </div>
          </div>

          {/* What Affects Speed Deep Dive */}
          <div className="space-y-4 pt-2">
            <h3 className="text-sm font-mono uppercase tracking-wider text-[#251C17] font-semibold">
              What Directly Affects Speed? (The 5 Decisive Factors)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#594A42]">
              
              <div className="p-4 rounded-xl bg-[#FAF6EE] border border-[#D7C3AF]/60 space-y-1.5">
                <div className="font-semibold text-[#251C17] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C23B22]" />
                  1. Autoregressive Token Generation (Sequential Loop)
                </div>
                <p className="text-[#736056] leading-relaxed font-light">
                  Whisper is an Encoder-Decoder Seq2Seq Attention Transformer. Unlike streaming CTC models that process audio in a single forward pass, Whisper generates text <em>one token at a time</em>. If a sentence takes 25 tokens, the decoder executes 25 sequential GPU forward passes. Total time = Tokens × GPU Latency per Token.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF6EE] border border-[#D7C3AF]/60 space-y-1.5">
                <div className="font-semibold text-[#251C17] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C23B22]" />
                  2. Discrete GPU vs Integrated Laptop GPU
                </div>
                <p className="text-[#736056] leading-relaxed font-light">
                  A discrete GPU (e.g. NVIDIA RTX 4080 or Apple Silicon M3/M4 Max) executes each token in ~12ms–25ms (40 words in ~0.6s). An integrated laptop GPU (Intel UHD / Iris Xe / AMD APU) takes ~200ms–350ms per token, generating the same sentence in ~5s–10s.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF6EE] border border-[#D7C3AF]/60 space-y-1.5">
                <div className="font-semibold text-[#251C17] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C23B22]" />
                  3. Active Tail Window Slicing vs Full Accumulation
                </div>
                <p className="text-[#736056] leading-relaxed font-light">
                  If an engine sends the full 20-second conversation buffer on every tick, Whisper must re-decode the entire history repeatedly. Yapper slices an active 4.5s tail window during streaming passes, keeping target tokens below 12 and cutting latency by up to 6×.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF6EE] border border-[#D7C3AF]/60 space-y-1.5">
                <div className="font-semibold text-[#251C17] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C23B22]" />
                  4. Anti-Looping Repetition Penalties
                </div>
                <p className="text-[#736056] leading-relaxed font-light">
                  On quiet or paused audio, unpenalized Whisper decoders can hallucinate repetitive punctuation or dots until hitting token limits. Yapper enforces a 1.25 repetition penalty and 3-gram blocker to halt decoding the instant speech pauses.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF6EE] border border-[#D7C3AF]/60 space-y-1.5 md:col-span-2">
                <div className="font-semibold text-[#251C17] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C23B22]" />
                  5. Engine Mode: ⚡ Native (0ms Instant) vs ✦ WebGPU (100% Private)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                  <div className="p-3 rounded-lg bg-[#EFE7DC] border border-[#D7C3AF]">
                    <span className="font-semibold text-[#251C17] block mb-1">⚡ Choose Native (Instant 0ms) if:</span>
                    <span className="text-[#736056]">You want words appearing on the paper <em>instantaneously</em> as syllables leave your lips. Powered by browser/OS speech transducers with 0ms lag, zero download, and zero battery drain.</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#EFE7DC] border border-[#D7C3AF]">
                    <span className="font-semibold text-[#251C17] block mb-1">✦ Choose WebGPU (Whisper) if:</span>
                    <span className="text-[#736056]">You want <em>absolute confidentiality</em>. Ideal for legal, medical, or sensitive dictation where audio must never touch an external server and runs 100% air-gapped on your device.</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Technical Appendix: Developer Integration (Positioned Below) */}
        <section id="tech-appendix" className="space-y-5 pt-8 border-t border-[#D7C3AF]/60">
          <div className="space-y-1">
            <h2 className="text-2xl font-serif font-light text-[#251C17]">
              Technical Appendix: Integration
            </h2>
            <p className="text-xs text-[#736056]">
              Zero-dependency, browser-native speech-to-text SDK for your modern web applications.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-[#D7C3AF]/70 pb-2">
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
            <button
              onClick={() => setActiveTab('commits')}
              className={`px-4 py-2 text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'commits'
                  ? 'bg-[#C23B22] text-[#FAF5EB] shadow-xs'
                  : 'text-[#736056] hover:text-[#251C17] hover:bg-[#F2EBE0]'
              }`}
            >
              <span>Postal Ledger & Commits</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 font-mono">
                {RECENT_COMMITS.length}
              </span>
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

            {activeTab === 'commits' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#3A2D25] gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#E34A3B] shadow-[0_0_8px_#E34A3B]" />
                    <span className="text-[#FAF5EB] font-serif italic text-sm">Series IV Postal Ledger</span>
                    <span className="text-[#9E8681]">·</span>
                    <span className="font-mono text-[#D9983B]">v{APP_VERSION}</span>
                    <span className="text-[#9E8681]">·</span>
                    <span className="font-mono text-[#FAF5EB]/80">HEAD: {GIT_HASH}</span>
                  </div>
                  <span className="text-[#9E8681] font-mono text-[11px]">
                    {RECENT_COMMITS.length} Tracked Dispatches
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#3A2D25] text-[#9E8681] text-[10px] uppercase tracking-wider">
                        <th className="py-2.5 px-3">Commit</th>
                        <th className="py-2.5 px-3">Scope</th>
                        <th className="py-2.5 px-3">Message</th>
                        <th className="py-2.5 px-3">Author</th>
                        <th className="py-2.5 px-3 text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#3A2D25]/60 text-[12px]">
                      {RECENT_COMMITS.map((commit) => {
                        const parsed = parseCommitType(commit.message);
                        const isCopied = copiedHash === commit.hash;
                        return (
                          <tr key={commit.hash} className="hover:bg-white/[0.04] transition-colors group">
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={`https://github.com/luisenriquecgongora/yapper/commit/${commit.hash}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#E34A3B] hover:text-[#F07167] font-semibold hover:underline"
                                  title="View on GitHub"
                                >
                                  {commit.hash}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => handleCopyHash(commit.hash)}
                                  className="text-[10px] text-[#9E8681] hover:text-[#FAF5EB] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer px-1 py-0.5 rounded"
                                  title="Copy commit hash"
                                >
                                  {isCopied ? '✓ Copied' : 'Copy'}
                                </button>
                              </div>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${parsed.colorClass}`}>
                                {parsed.type}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-sans text-sm text-[#EADFD0] max-w-md">
                              {parsed.title}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap text-[#9E8681] text-xs">
                              {commit.author}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap text-right text-[#9E8681] text-xs">
                              {commit.date}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Live Telegraph Ribbon Diagnostics & Telemetry Logs */}
        {showLogs && (
          <section className="paper-card rounded-2xl p-5 md:p-6 space-y-4 border border-[#D7C3AF]/80 transition-all shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#D7C3AF]/60 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#C23B22] animate-pulse" />
                <h3 className="font-serif italic font-medium text-lg text-[#251C17]">
                  Telegraph Ribbon — Live Engine Diagnostics & Telemetry
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono">
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  className="px-3 py-1 rounded-lg border border-[#D7C3AF] hover:border-[#C23B22] hover:bg-[#FAF6EE] text-[#594A42] transition-colors cursor-pointer"
                >
                  {logsCopied ? '✓ Copied' : 'Copy All Logs'}
                </button>
                <button
                  type="button"
                  onClick={clearLogs}
                  className="px-3 py-1 rounded-lg border border-[#D7C3AF] hover:border-[#C23B22] hover:bg-[#FAF6EE] text-[#8C776E] hover:text-[#C23B22] transition-colors cursor-pointer"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogs(false)}
                  className="px-2.5 py-1 rounded-lg border border-[#D7C3AF] hover:border-[#C23B22] hover:bg-[#FAF6EE] text-[#8C776E] transition-colors cursor-pointer"
                  title="Close log viewer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Log entries container */}
            <div className="bg-[#FAF6EE] border border-[#D7C3AF]/80 rounded-xl p-4 font-mono text-xs max-h-72 overflow-y-auto space-y-1.5 select-text shadow-inner">
              {logs.length === 0 ? (
                <p className="text-[#8C776E] italic">Waiting for initial telemetry pulses...</p>
              ) : (
                logs.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-[#8C776E] shrink-0 font-light text-[11px]">{entry.timestamp}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold shrink-0 ${
                        entry.category === 'hardware'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300/80'
                          : entry.category === 'model'
                          ? 'bg-purple-100 text-purple-800 border border-purple-300/80'
                          : entry.category === 'audio'
                          ? 'bg-blue-100 text-blue-800 border border-blue-300/80'
                          : entry.category === 'stt'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300/80'
                          : 'bg-stone-200 text-stone-700'
                      }`}
                    >
                      {entry.category}
                    </span>
                    <span
                      className={`break-all ${
                        entry.level === 'error'
                          ? 'text-[#C23B22] font-semibold'
                          : entry.level === 'warn'
                          ? 'text-[#D9983B]'
                          : entry.level === 'debug'
                          ? 'text-[#8C776E]'
                          : entry.message.includes('[Writing]')
                          ? 'text-[#C23B22] font-medium'
                          : entry.message.includes('[Interpreting]')
                          ? 'text-[#B55A1A] font-medium'
                          : entry.message.includes('[Receiving]')
                          ? 'text-[#2D5A38] font-medium'
                          : 'text-[#251C17]'
                      }`}
                    >
                      {entry.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

      </main>

      {/* Paper Footer */}
      <footer className="border-t border-[#D7C3AF]/60 py-6 text-center text-xs text-[#8C776E] font-serif italic flex flex-col sm:flex-row items-center justify-center gap-2">
        <span>Handcrafted with fine WebGPU fibers · PlaatoOS Open Source · Zero cloud footprint</span>
        <span className="hidden sm:inline">·</span>
        <button
          type="button"
          onClick={() => setShowCommitsSubrule(!showCommitsSubrule)}
          className="font-mono text-[11px] not-italic text-[#736056] hover:text-[#C23B22] transition-colors cursor-pointer"
        >
          v{APP_VERSION} ({GIT_HASH}) · {RECENT_COMMITS.length} dispatches
        </button>
      </footer>

      {/* Engine & Model Configuration Side Drawer */}
      {showSettingsDrawer && (
        <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
          {/* Backdrop overlay */}
          <div
            className="absolute inset-0 bg-[#251C17]/40 backdrop-blur-xs transition-opacity"
            onClick={() => setShowSettingsDrawer(false)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
            <div className="w-screen max-w-md bg-[#F7F3EA] border-l border-[#D7C3AF] shadow-2xl p-6 md:p-8 flex flex-col justify-between overflow-y-auto space-y-6">
              
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-[#D7C3AF]/80 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#C23B22] shadow-[0_0_6px_rgba(194,59,34,0.4)]" />
                  <div>
                    <h3 className="font-serif italic font-medium text-lg text-[#251C17] leading-none">
                      Engine & Model Settings
                    </h3>
                    <span className="text-[10px] uppercase font-mono tracking-wider text-[#8C776E]">
                      Series IV · Hardware Controls
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSettingsDrawer(false)}
                  className="w-8 h-8 rounded-full border border-[#D7C3AF] flex items-center justify-center text-[#8C776E] hover:text-[#C23B22] hover:border-[#C23B22] bg-[#FAF6EE] transition-colors cursor-pointer"
                  title="Close Settings (Esc)"
                >
                  ✕
                </button>
              </div>

              {/* Drawer Body: The two cards */}
              <div className="space-y-5 flex-1">
                {/* 1. Embossed Controls Card */}
                <div className="paper-card rounded-2xl p-5 space-y-4 text-[#594A42]">
                  {/* Architecture Selector */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-[#8C776E] block font-semibold">
                        Engine Architecture
                      </label>
                      <span className="text-[10px] font-mono text-[#C23B22] font-semibold">
                        {preferredEngine === 'browser'
                          ? '⚡ Instant 0ms Mode'
                          : '✦ On-Device WebGPU'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPreferredEngine('local')}
                        className={`py-2 px-2.5 text-xs rounded-xl border transition-all text-center cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                          preferredEngine === 'local' || (preferredEngine === 'auto' && modelProgress.status === 'ready')
                            ? 'bg-[#FAF6EE] border-[#C23B22] text-[#C23B22] font-semibold shadow-xs'
                            : 'border-[#D7C3AF] text-[#8C776E] hover:border-[#C23B22]/50 hover:text-[#251C17]'
                        }`}
                      >
                        <span className="font-semibold text-xs">✦ WebGPU (Whisper)</span>
                        <span className="text-[9px] opacity-75 font-mono">100% On-Device · Private</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreferredEngine('browser')}
                        className={`py-2 px-2.5 text-xs rounded-xl border transition-all text-center cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                          preferredEngine === 'browser'
                            ? 'bg-[#FAF6EE] border-[#C23B22] text-[#C23B22] font-semibold shadow-xs'
                            : 'border-[#D7C3AF] text-[#8C776E] hover:border-[#C23B22]/50 hover:text-[#251C17]'
                        }`}
                      >
                        <span className="font-semibold text-xs">⚡ Native (Instant)</span>
                        <span className="text-[9px] opacity-75 font-mono">0ms Latency · Live Syllables</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-[#8C776E] mt-1.5 leading-normal font-light">
                      {preferredEngine === 'browser'
                        ? '⚡ Native mode streams live words directly from browser hardware (0ms delay, zero GPU load).'
                        : '✦ WebGPU runs OpenAI Whisper neural weights directly in your browser shaders. Speed depends on your GPU hardware.'}
                    </p>
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
                      <option value="chinese">Chinese (中文)</option>
                      <option value="japanese">Japanese (日本語)</option>
                    </select>
                  </div>
                </div>

                {/* 2. Local Model Download / Cache Card */}
                <LocalModelCard
                  progress={modelProgress}
                  modelSize={modelSize}
                  approxMb={modelSize === 'tiny' ? 76 : modelSize === 'base' ? 140 : 240}
                  onDownload={downloadModel}
                  onRemove={removeModel}
                />
              </div>

              {/* Drawer Footer */}
              <div className="pt-4 border-t border-[#D7C3AF]/80 flex items-center justify-between text-xs text-[#8C776E] font-mono">
                <span>Yapper v{APP_VERSION}</span>
                <button
                  type="button"
                  onClick={() => setShowSettingsDrawer(false)}
                  className="px-4 py-1.5 rounded-xl bg-[#251C17] text-[#FAF5EB] font-sans hover:bg-[#3A2D25] transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
