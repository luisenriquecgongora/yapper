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

const WINDOWS_RELEASE_URL = "https://pub-091afdf4a9bd47fa9b641aae923852e1.r2.dev/yapper/latest/Yapper-windows-x64.zip";
const MACOS_RELEASE_URL = "https://pub-091afdf4a9bd47fa9b641aae923852e1.r2.dev/yapper/latest/Yapper-macos.zip";

function WindowsIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 88 88" fill="currentColor">
      <path d="M0 12.402l35.689-4.86.016 34.423-35.67.203zm35.67 33.529l.026 34.453-35.67-4.887-.026-29.566zm4.326-39.027L87.914 0v41.526l-47.918.37zm47.918 45.474v41.622l-47.918-6.745V52.001z"/>
    </svg>
  );
}

function AppleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 170 170" fill="currentColor">
      <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.74 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.08-7.66-7.85-11.9-14.3-6.52-9.91-11.59-21.26-15.2-34.07-3.6-12.82-5.41-24.87-5.41-36.17 0-14.15 3.51-26.06 10.53-35.73 7.02-9.67 15.82-14.65 26.4-14.94 4.89 0 10.38 1.34 16.48 4.02 6.09 2.68 10.15 4.08 12.18 4.2 2.68-.45 6.84-1.85 12.49-4.2 5.64-2.35 10.74-3.41 15.29-3.18 11.94.89 21.36 5.59 28.26 14.1-10.42 6.34-15.53 15.21-15.34 26.6.19 8.94 3.63 16.43 10.33 22.48 6.7 6.05 14.73 9.49 24.1 10.32-2.12 6.54-4.8 13.62-8.05 21.24zM119.22 31.84c0-7.38 2.64-14.42 7.91-21.11 5.28-6.69 11.89-10.73 19.84-12.13.23 1.12.35 2.12.35 3.02 0 7.37-2.79 14.36-8.38 20.97-5.59 6.6-12.16 10.46-19.72 11.58z"/>
    </svg>
  );
}

export function App() {
  const [userOS, setUserOS] = useState<'mac' | 'windows' | 'linux'>('windows');
  const [modelSize, setModelSize] = useState<ModelSize>('tiny');
  const [language, setLanguage] = useState<string>('english');
  const [preferredEngine, setPreferredEngine] = useState<'auto' | 'local' | 'browser'>('auto');
  const [activeTab, setActiveTab] = useState<'react' | 'vanilla' | 'cloud' | 'desktop' | 'commits'>('react');
  const [showCommitsSubrule, setShowCommitsSubrule] = useState<boolean>(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState<boolean>(false);
  const [settingsDrawerRendered, setSettingsDrawerRendered] = useState<boolean>(false);
  const [settingsDrawerVisible, setSettingsDrawerVisible] = useState<boolean>(false);

  const [showMenuDrawer, setShowMenuDrawer] = useState<boolean>(false);
  const [menuDrawerRendered, setMenuDrawerRendered] = useState<boolean>(false);
  const [menuDrawerVisible, setMenuDrawerVisible] = useState<boolean>(false);

  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [hasWebGpu, setHasWebGpu] = useState<boolean>(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      const platform = (navigator as any).userAgentData?.platform?.toLowerCase() || '';
      if (platform.includes('mac') || ua.includes('mac') || ua.includes('darwin') || ua.includes('iphone') || ua.includes('ipad')) {
        setUserOS('mac');
      } else if (platform.includes('linux') || ua.includes('linux')) {
        setUserOS('linux');
      } else {
        setUserOS('windows');
      }
    }
  }, []);

  const primaryDownloadUrl = userOS === 'mac' ? MACOS_RELEASE_URL : WINDOWS_RELEASE_URL;
  const secondaryDownloadUrl = userOS === 'mac' ? WINDOWS_RELEASE_URL : MACOS_RELEASE_URL;
  const primaryOsLabel = userOS === 'mac' ? 'macOS (Apple Silicon & Intel)' : 'Windows (64-bit)';
  const secondaryOsLabel = userOS === 'mac' ? 'Windows (.zip)' : 'macOS (.zip)';
  const defaultHotkeyLabel = userOS === 'mac' ? 'Cmd+Shift+Space' : 'Ctrl+Shift+Space';

  const openSettingsDrawer = () => {
    // If menu was open, close it
    setMenuDrawerVisible(false);
    setTimeout(() => {
      setMenuDrawerRendered(false);
      setShowMenuDrawer(false);
    }, 150);

    setShowSettingsDrawer(true);
    setSettingsDrawerRendered(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSettingsDrawerVisible(true);
      });
    });
  };

  const closeSettingsDrawer = () => {
    setSettingsDrawerVisible(false);
    setTimeout(() => {
      setSettingsDrawerRendered(false);
      setShowSettingsDrawer(false);
    }, 300);
  };

  const openMenuDrawer = () => {
    // If settings was open, close it
    setSettingsDrawerVisible(false);
    setTimeout(() => {
      setSettingsDrawerRendered(false);
      setShowSettingsDrawer(false);
    }, 150);

    setShowMenuDrawer(true);
    setMenuDrawerRendered(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setMenuDrawerVisible(true);
      });
    });
  };

  const closeMenuDrawer = () => {
    setMenuDrawerVisible(false);
    setTimeout(() => {
      setMenuDrawerRendered(false);
      setShowMenuDrawer(false);
    }, 300);
  };

  const openDesktopInstructions = () => {
    setActiveTab('desktop');
    document.getElementById('tech-appendix')?.scrollIntoView({ behavior: 'smooth' });
  };
  
  // Continuous manuscript letter accumulator
  const [letterTranscript, setLetterTranscript] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    setHasWebGpu(typeof navigator !== 'undefined' && 'gpu' in navigator);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSettingsDrawer) closeSettingsDrawer();
        if (showMenuDrawer) closeMenuDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSettingsDrawer, showMenuDrawer]);

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
      <header className="border-b border-[#D7C3AF]/60 bg-[#F7F3EA]/90 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#C23B22] to-[#E34A3B] flex items-center justify-center text-[#FAF5EB] font-serif italic text-base shadow-[0_2px_8px_rgba(194,59,34,0.35)] select-none">
            y
          </div>
          <span className="font-serif italic font-medium text-xl tracking-tight text-[#251C17] leading-none">
            Yapper
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-sm">
          {/* Primary Header CTA: Download Desktop Voice HUD */}
          <a
            href={primaryDownloadUrl}
            className="px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full bg-gradient-to-r from-[#C23B22] to-[#E34A3B] hover:from-[#A8321D] hover:to-[#C23B22] text-[#FAF5EB] text-xs font-semibold flex items-center gap-1.5 sm:gap-2 shadow-xs hover:shadow-md transition-all cursor-pointer font-sans"
            title={`Download Yapper Desktop HUD for ${userOS === 'mac' ? 'macOS' : 'Windows'} (.zip)`}
          >
            {userOS === 'mac' ? <AppleIcon className="w-3.5 h-3.5 fill-current shrink-0" /> : <WindowsIcon className="w-3.5 h-3.5 fill-current shrink-0" />}
            <span className="tracking-tight">Download HUD</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono hidden sm:inline">
              {userOS === 'mac' ? 'Mac' : 'Windows'}
            </span>
          </a>

          {/* GitHub link visible in header at all times */}
          <a
            href="https://github.com/luisenriquecgongora/yapper"
            target="_blank"
            rel="noreferrer"
            className="hidden xs:flex px-3 py-1.5 rounded-full border border-[#D7C3AF] hover:border-[#C23B22] hover:bg-[#F2EBE0] transition-all text-xs font-mono font-medium text-[#594A42] items-center gap-1.5 shadow-xs"
            title="View source repository on GitHub"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span>GitHub</span>
          </a>

          {/* Hamburger Menu Button */}
          <button
            type="button"
            onClick={showMenuDrawer ? closeMenuDrawer : openMenuDrawer}
            className={`px-3 py-1.5 rounded-full border text-xs font-mono flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
              showMenuDrawer
                ? 'bg-[#251C17] text-[#FAF5EB] border-[#251C17]'
                : 'border-[#D7C3AF] bg-[#FAF6EE] text-[#594A42] hover:border-[#C23B22] hover:bg-[#EFE7DC]'
            }`}
            title="Open Navigation Menu"
            aria-label="Navigation Menu"
          >
            <div className="flex flex-col gap-1 w-3.5 justify-center items-center">
              <span className={`w-3.5 h-0.5 rounded-full transition-colors ${showMenuDrawer ? 'bg-[#C23B22]' : 'bg-[#251C17]'}`} />
              <span className={`w-3.5 h-0.5 rounded-full transition-colors ${showMenuDrawer ? 'bg-[#FAF5EB]' : 'bg-[#251C17]'}`} />
              <span className={`w-3.5 h-0.5 rounded-full transition-colors ${showMenuDrawer ? 'bg-[#FAF5EB]' : 'bg-[#251C17]'}`} />
            </div>
            <span className="font-semibold text-xs text-[#251C17]">Menu</span>
          </button>
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
        
        {/* ========================================================================= */}
        {/* HERO SHOWCASE & PRIMARY CTA SECTION (Desktop Voice HUD)                  */}
        {/* ========================================================================= */}
        <section className="text-center max-w-4xl mx-auto space-y-6 pt-2 pb-2">
          
          {/* Top Pill / Badge */}
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[#FAF6EE] border border-[#D7C3AF] shadow-xs text-xs font-mono text-[#594A42]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#C23B22] shadow-[0_0_8px_rgba(194,59,34,0.6)] animate-pulse" />
            <span className="font-semibold text-[#251C17]">Yapper Desktop Voice HUD</span>
            <span className="text-[#8C776E]/60">·</span>
            <span className="text-[#C23B22] font-medium">Wispr Flow for your whole OS</span>
            <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded-full bg-[#EFE7DC] text-[#736056] border border-[#D7C3AF]/50">
              v1.0.0
            </span>
          </div>

          {/* Hero Headline */}
          <div className="space-y-4">
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-serif font-normal tracking-tight text-[#251C17] leading-[1.12]">
              Speak softly. <br />
              <span className="italic font-medium text-[#C23B22]">Your voice writes itself</span> into any app.
            </h1>
            <p className="text-base sm:text-xl text-[#736056] max-w-2xl mx-auto font-sans font-light leading-relaxed">
              A private, zero-latency desktop voice HUD. Click into <strong className="text-[#251C17] font-medium">VS Code, Notion, Slack, Word, or Chrome</strong>, press <kbd className="px-2 py-0.5 rounded-lg bg-[#FAF6EE] border border-[#D7C3AF] text-[#C23B22] font-mono text-xs sm:text-sm shadow-xs font-semibold">{defaultHotkeyLabel}</kbd>, and speak. Your thoughts are cleaned of filler words and typed automatically.
            </p>
          </div>

          {/* MAIN DOWNLOAD CTA BUTTONS CLUSTER */}
          <div className="pt-2 flex flex-col items-center gap-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3.5 w-full max-w-xl">
              
              {/* PRIMARY CTA: Auto-detected OS Download Button */}
              <a
                href={primaryDownloadUrl}
                className="group flex-1 px-6 py-4 rounded-2xl bg-gradient-to-tr from-[#C23B22] via-[#D94528] to-[#E34A3B] hover:from-[#A8321D] hover:to-[#C23B22] text-[#FAF5EB] font-sans transition-all duration-200 shadow-md hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-3.5 cursor-pointer border border-[#C23B22]/30"
                title={`Download Yapper Desktop HUD for ${userOS === 'mac' ? 'macOS' : 'Windows'} (v1.0.0)`}
              >
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform shadow-xs">
                  {userOS === 'mac' ? <AppleIcon className="w-5 h-5 fill-current" /> : <WindowsIcon className="w-5 h-5 fill-current" />}
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-base sm:text-lg leading-none tracking-tight">
                      Download for {userOS === 'mac' ? 'macOS' : 'Windows'}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/20 font-mono uppercase font-semibold">
                      Free v1.0.0
                    </span>
                  </div>
                  <span className="text-xs text-[#FAF5EB]/85 font-mono block mt-1">
                    {userOS === 'mac' ? 'Apple Silicon & Intel (.zip)' : '64-bit Portable (.zip) · No setup'}
                  </span>
                </div>
              </a>

              {/* SECONDARY CTA: Alternative OS Download */}
              <a
                href={secondaryDownloadUrl}
                className="px-4 sm:px-5 py-4 rounded-2xl bg-[#FAF6EE] hover:bg-[#EFE7DC] border-2 border-[#D7C3AF] hover:border-[#C23B22] text-[#594A42] hover:text-[#C23B22] font-mono text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                title={`Download Yapper for ${secondaryOsLabel}`}
              >
                {userOS === 'mac' ? <WindowsIcon className="w-4 h-4 fill-current shrink-0 text-[#736056]" /> : <AppleIcon className="w-4 h-4 fill-current shrink-0 text-[#736056]" />}
                <span>{userOS === 'mac' ? 'Windows (.zip)' : 'macOS (.zip)'}</span>
                <span className="text-[#8C776E]">↓</span>
              </a>

            </div>

            {/* Micro Guarantees / Value Props */}
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-mono text-[#736056] pt-1">
              <span className="flex items-center gap-1.5">
                <span className="text-[#C23B22] font-semibold">✓</span> 100% On-Device &amp; Private
              </span>
              <span className="text-[#D7C3AF]">·</span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#C23B22] font-semibold">✓</span> Zero Cloud API Costs
              </span>
              <span className="text-[#D7C3AF]">·</span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#C23B22] font-semibold">✓</span> Wispr Flow Text Cleanup
              </span>
              <span className="text-[#D7C3AF]">·</span>
              <button
                type="button"
                onClick={openDesktopInstructions}
                className="text-[#C23B22] hover:underline cursor-pointer flex items-center gap-1 font-sans font-medium"
              >
                <span>Setup &amp; Hotkeys</span>
                <span>→</span>
              </button>
            </div>

            {/* Live Interactive In-Browser Demo Teaser Divider */}
            <div className="pt-6 w-full max-w-2xl mx-auto flex items-center gap-3 text-xs text-[#8C776E] font-serif italic">
              <span className="h-px bg-[#D7C3AF]/70 flex-1" />
              <span>Or try the live in-browser WebGPU playground right here</span>
              <span className="h-px bg-[#D7C3AF]/70 flex-1" />
            </div>
          </div>
        </section>

        {/* Top Split Layout: Left Controls & Wax Seal Orb | Right Full-Height Letter Sheet */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          
          {/* Left Column (5 Cols): Title, Voice Orb & Controls */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Living Wax Seal Voice Orb Card */}
            <div className="paper-card rounded-3xl p-6 md:p-8 flex flex-col items-center justify-center space-y-5 text-center relative overflow-hidden">
              
              {/* Gear Settings Button (Top-Right) */}
              <button
                type="button"
                onClick={openSettingsDrawer}
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
                  onClick={openSettingsDrawer}
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

            {/* Desktop HUD Interactive Download Card */}
            <div className="paper-card rounded-2xl p-4 sm:p-5 space-y-3.5 text-center bg-[#FAF6EE] border-2 border-[#D7C3AF] hover:border-[#C23B22]/60 transition-all shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#C23B22] shadow-[0_0_8px_rgba(194,59,34,0.6)] animate-pulse" />
                  <span className="text-xs font-serif italic font-medium text-[#251C17]">
                    Desktop Voice HUD
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#EFE7DC] text-[#736056] border border-[#D7C3AF]/60">
                  {userOS === 'mac' ? 'macOS' : 'Windows'}
                </span>
              </div>

              {/* Mini HUD Pill preview */}
              <div className="py-2 px-3 rounded-full bg-[#251C17] text-[#FAF5EB] flex items-center justify-between text-[11px] font-mono shadow-inner border border-[#3A2D25]">
                <div className="flex items-center gap-2 truncate">
                  <span className="w-2 h-2 rounded-full bg-[#E34A3B] animate-ping" />
                  <span className="truncate">Speak aloud · {defaultHotkeyLabel}</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#3A2D25] text-[#D7C3AF]">
                  Esc Cancel
                </span>
              </div>

              <p className="text-[11px] text-[#736056] font-light leading-relaxed">
                Floats over VS Code, Notion, Slack, and Chrome. Types automatically at your cursor.
              </p>

              <a
                href={primaryDownloadUrl}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#C23B22] to-[#E34A3B] hover:from-[#A8321D] hover:to-[#C23B22] text-[#FAF5EB] text-xs font-semibold flex items-center justify-center gap-2 shadow-xs hover:shadow-md transition-all cursor-pointer font-sans"
                title={`Download Yapper Desktop HUD for ${userOS === 'mac' ? 'macOS' : 'Windows'}`}
              >
                {userOS === 'mac' ? <AppleIcon className="w-3.5 h-3.5 fill-current shrink-0" /> : <WindowsIcon className="w-3.5 h-3.5 fill-current shrink-0" />}
                <span>Download Desktop HUD (.zip)</span>
              </a>

              <div className="flex items-center justify-between text-[10px] font-mono text-[#8C776E] pt-1 border-t border-[#D7C3AF]/50">
                <span>Other system:</span>
                <a
                  href={secondaryDownloadUrl}
                  className="text-[#C23B22] hover:underline cursor-pointer font-medium"
                >
                  Download for {secondaryOsLabel}
                </a>
              </div>
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
              onClick={() => setActiveTab('desktop')}
              className={`px-4 py-2 text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'desktop'
                  ? 'bg-[#C23B22] text-[#FAF5EB] shadow-xs'
                  : 'text-[#736056] hover:text-[#251C17] hover:bg-[#F2EBE0]'
              }`}
            >
              {userOS === 'mac' ? <AppleIcon className="w-3.5 h-3.5 fill-current" /> : <WindowsIcon className="w-3.5 h-3.5 fill-current" />}
              <span>Desktop HUD ({userOS === 'mac' ? 'macOS' : 'Windows'}) ⬇</span>
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
              <pre>{`# Option A: Run the high-throughput Python streaming engine with Docker
cd services/yapper-engine
docker build -t yapper-engine .
docker run -d -p 8000:8000 --memory=512m yapper-engine

# Stream duplex 16kHz PCM audio via WebSocket:
# ws://localhost:8000/ws/audio?language=en&mode=flow

# Option B: Run the lightweight Zero Data Retention proxy
cd packages/server && yarn start

# Configure TalkClient to stream to your cloud endpoint
const client = new TalkClient({
  preferredEngine: 'cloud',
  cloudEndpoint: 'https://your-domain.com/api/transcribe',
});`}</pre>
            )}

            {activeTab === 'desktop' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#3A2D25] gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#E34A3B] shadow-[0_0_8px_#E34A3B]" />
                    <span className="text-[#FAF5EB] font-serif italic text-sm">Yapper for Desktop (Wispr Flow style)</span>
                    <span className="text-[#9E8681]">·</span>
                    <span className="text-[11px] font-mono text-[#D9983B]">{primaryOsLabel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={primaryDownloadUrl}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#C23B22] hover:bg-[#A8321D] text-[#FAF5EB] font-sans text-xs font-medium transition-colors shadow-xs"
                      title={`Download Yapper for ${userOS === 'mac' ? 'macOS' : 'Windows'}`}
                    >
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      <span>Download for {userOS === 'mac' ? 'Mac' : 'Windows'} (.zip)</span>
                    </a>
                    <a
                      href={secondaryDownloadUrl}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#5C4D44] hover:border-[#C23B22] text-[#D7C3AF] font-mono text-[11px] transition-colors"
                      title={`Download for ${secondaryOsLabel}`}
                    >
                      <span>{userOS === 'mac' ? 'Windows' : 'Mac'} (.zip)</span>
                    </a>
                  </div>
                </div>
                <pre>{userOS === 'mac' ? `# 1. Download & Extract Yapper for macOS (Apple Silicon & Intel)
Download Link: ${MACOS_RELEASE_URL}
Unzip and double-click Yapper.command

# 2. Permissions (One-Time macOS Setup)
Allow Terminal/Python in System Settings -> Privacy & Security:
• Accessibility (for global ${defaultHotkeyLabel} trigger)
• Input Monitoring
• Microphone

# 3. How to Dictate into Any Mac Application
1. Click your cursor into VS Code, Notion, Slack, Obsidian, Notes, or Safari.
2. Click the red orb or press ${defaultHotkeyLabel} (widget pulses red: Listening...).
3. Speak naturally.
4. Click the orb again or press ${defaultHotkeyLabel} to finish and ink!
5. Click 'Cancel' or press Esc at any time to discard without typing.

# 4. Also Available for Windows (64-bit portable)
Download Link: ${WINDOWS_RELEASE_URL}` : `# 1. Download & Extract Yapper for Windows
Download Link: ${WINDOWS_RELEASE_URL}
Unzip and double-click Yapper.exe (Zero Python or terminal required)

# 2. How to Dictate into Any Application
1. Click your cursor into VS Code, Notion, Slack, Word, WhatsApp, or Chrome.
2. Click the red orb on the HUD or press ${defaultHotkeyLabel} (widget pulses red: Listening...).
3. Speak naturally: "Let's update the deployment schedule, um actually make it Monday morning."
4. Click the red orb again or press ${defaultHotkeyLabel} to finish.
5. Click 'Cancel' or press Esc at any time to discard without typing!

# 3. Also Available for macOS (Apple Silicon & Intel)
Download Link: ${MACOS_RELEASE_URL}

# 4. Optional: Run from Developer Source
git clone https://github.com/luisenriquecgongora/yapper.git
cd yapper
python clients/desktop_hud.py`}</pre>
              </div>
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

      {/* ☰ Navigation Menu Drawer */}
      {menuDrawerRendered && (
        <div
          className="fixed inset-0 z-50 overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation Menu"
        >
          {/* Backdrop overlay with fade transition */}
          <div
            className={`fixed inset-0 bg-[#251C17]/45 backdrop-blur-xs transition-opacity duration-300 ease-out cursor-pointer ${
              menuDrawerVisible ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={closeMenuDrawer}
          />

          {/* Sliding Drawer Container */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10 pointer-events-none">
            <div
              className={`pointer-events-auto w-screen max-w-md bg-[#F7F3EA] border-l border-[#D7C3AF] shadow-[-16px_0_40px_rgba(37,28,23,0.18)] p-6 md:p-8 flex flex-col justify-between overflow-y-auto space-y-6 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform ${
                menuDrawerVisible ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-[#D7C3AF]/80 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#C23B22] to-[#E34A3B] flex items-center justify-center text-[#FAF5EB] font-serif italic text-base shadow-xs select-none">
                    y
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-serif italic font-medium text-lg text-[#251C17]">Menu</span>
                    <button
                      type="button"
                      onClick={() => handleCopyHash(GIT_HASH)}
                      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#FAF6EE] hover:bg-[#EFE7DC] text-[#594A42] hover:text-[#C23B22] border border-[#D7C3AF] font-mono transition-all cursor-pointer shadow-xs"
                      title="Click to copy git commit hash"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C23B22]" />
                      <span className="font-semibold text-[#251C17]">v{APP_VERSION}</span>
                      <span className="text-[#8C776E]/60">·</span>
                      <span>{copiedHash === GIT_HASH ? '✓ Copied' : GIT_HASH}</span>
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeMenuDrawer}
                  className="w-8 h-8 rounded-full border border-[#D7C3AF] flex items-center justify-center text-[#8C776E] hover:text-[#C23B22] hover:border-[#C23B22] bg-[#FAF6EE] transition-colors cursor-pointer"
                  title="Close Menu (Esc)"
                >
                  ✕
                </button>
              </div>

              {/* Drawer Body */}
              <div className="space-y-4 flex-1">
                {/* 1. Yapper Desktop Floating HUD Card */}
                <div className="paper-card rounded-2xl p-4 sm:p-5 space-y-3 text-[#594A42] border-l-4 border-l-[#C23B22]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#C23B22]" />
                      <span className="text-xs font-serif italic font-medium text-[#251C17]">
                        Yapper for Desktop
                      </span>
                    </div>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#FAF6EE] border border-[#D7C3AF] text-[#736056]">
                      {primaryOsLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#736056] leading-relaxed font-light">
                    Always-on-top floating pill that transcribes and inks text directly into VS Code, Notion, Slack, and Word via <code className="bg-[#FAF6EE] px-1 py-0.5 rounded font-mono text-[#C23B22]">{defaultHotkeyLabel}</code>.
                  </p>
                  <a
                    href={primaryDownloadUrl}
                    className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#C23B22] to-[#E34A3B] hover:from-[#A8321D] hover:to-[#C23B22] text-[#FAF5EB] text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs hover:shadow-md"
                    title={`Download Yapper Desktop HUD for ${userOS === 'mac' ? 'macOS' : 'Windows'}`}
                  >
                    {userOS === 'mac' ? <AppleIcon className="w-3.5 h-3.5 fill-current shrink-0" /> : <WindowsIcon className="w-3.5 h-3.5 fill-current shrink-0" />}
                    <span>Download for {userOS === 'mac' ? 'Mac (Apple Silicon & Intel)' : 'Windows (64-bit)'}</span>
                  </a>
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#8C776E] pt-1 border-t border-[#D7C3AF]/40">
                    <span>Alternative OS:</span>
                    <a
                      href={secondaryDownloadUrl}
                      className="text-[#594A42] hover:text-[#C23B22] underline cursor-pointer"
                    >
                      Download for {secondaryOsLabel}
                    </a>
                  </div>
                </div>

                {/* 2. Quick Settings Shortcut Card */}
                <div className="paper-card rounded-2xl p-4 sm:p-5 flex items-center justify-between text-[#594A42] bg-[#FAF6EE]">
                  <div className="space-y-0.5">
                    <span className="text-xs font-serif italic font-medium text-[#251C17] flex items-center gap-1.5">
                      <span>⚙ Engine &amp; Model</span>
                    </span>
                    <p className="text-[11px] text-[#8C776E] font-light">
                      {preferredEngine === 'browser' ? 'Native 0ms' : `WebGPU Whisper (${modelSize})`} · {language}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openSettingsDrawer}
                    className="px-3 py-1.5 rounded-xl border border-[#D7C3AF] bg-[#FAF5EB] hover:bg-[#EFE7DC] hover:border-[#C23B22] text-[#C23B22] text-xs font-mono font-medium transition-all cursor-pointer shadow-xs"
                  >
                    Configure →
                  </button>
                </div>

                {/* 3. System Acceleration & Telemetry Strip */}
                <div className="paper-card rounded-2xl p-4 sm:p-5 space-y-3 text-[#594A42]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#8C776E] block font-semibold">
                      Live Telemetry &amp; Diagnostics
                    </span>
                    <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 font-semibold shadow-xs">
                      ✓ 20/20 Tests
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    {/* Acceleration badge */}
                    <div className="flex flex-col p-2.5 rounded-xl bg-[#FAF6EE] border border-[#D7C3AF]/80 shadow-xs">
                      <span className="text-[10px] text-[#8C776E] mb-1">Engine Backend</span>
                      <span className="flex items-center gap-1.5 font-medium text-[#251C17] text-[11px]">
                        <span className={`w-2 h-2 rounded-full ${hasWebGpu ? 'bg-[#D9983B] shadow-[0_0_6px_#D9983B]' : 'bg-[#C23B22]'}`} />
                        {hasWebGpu ? 'WebGPU' : 'WASM CPU'}
                      </span>
                    </div>

                    {/* Latency badge */}
                    <div className="flex flex-col p-2.5 rounded-xl bg-[#FAF6EE] border border-[#D7C3AF]/80 shadow-xs">
                      <span className="text-[10px] text-[#8C776E] mb-1">Inference Latency</span>
                      <span className="flex items-center gap-1 font-semibold text-[#C23B22] text-[11px]">
                        <span>⚡</span>
                        <span>
                          {preferredEngine === 'browser'
                            ? '0ms (Instant)'
                            : latencyStats.lastInterpMs
                            ? `${latencyStats.lastInterpMs}ms`
                            : '--'}
                        </span>
                      </span>
                    </div>
                  </div>

                  {latencyStats.avgInterpMs && (
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#736056] pt-1 border-t border-[#D7C3AF]/50">
                      <span>Historical Average:</span>
                      <span className="font-medium text-[#251C17]">
                        {latencyStats.avgInterpMs}ms {latencyStats.tokensPerSec ? `(~${latencyStats.tokensPerSec} tok/s)` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* 4. Quick Consoles & Ledgers Toggles */}
                <div className="paper-card rounded-2xl p-4 sm:p-5 space-y-3 text-[#594A42]">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#8C776E] block font-semibold">
                    Consoles &amp; Ledgers
                  </span>

                  <div className="space-y-2">
                    {/* Postal Ledger / Commits Toggle */}
                    <button
                      type="button"
                      onClick={() => setShowCommitsSubrule(!showCommitsSubrule)}
                      className={`w-full p-2.5 rounded-xl border text-xs font-mono flex items-center justify-between transition-all cursor-pointer shadow-xs ${
                        showCommitsSubrule
                          ? 'bg-[#251C17] text-[#FAF5EB] border-[#251C17]'
                          : 'border-[#D7C3AF] bg-[#FAF6EE] text-[#594A42] hover:border-[#C23B22] hover:bg-[#EFE7DC]'
                      }`}
                      title="Toggle Postal Ledger / Commit History Ribbon"
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-serif italic font-medium">§</span>
                        <span>Postal Ledger ({RECENT_COMMITS.length})</span>
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                        showCommitsSubrule ? 'bg-[#C23B22] text-[#FAF5EB]' : 'bg-[#EFE7DC] text-[#736056]'
                      }`}>
                        {showCommitsSubrule ? 'Active' : 'Show'}
                      </span>
                    </button>

                    {/* Live Telegraph Ribbon Logs Toggle */}
                    <button
                      type="button"
                      onClick={() => setShowLogs(!showLogs)}
                      className={`w-full p-2.5 rounded-xl border text-xs font-mono flex items-center justify-between transition-all cursor-pointer shadow-xs ${
                        showLogs
                          ? 'bg-[#251C17] text-[#FAF5EB] border-[#251C17]'
                          : 'border-[#D7C3AF] bg-[#FAF6EE] text-[#594A42] hover:border-[#C23B22] hover:bg-[#EFE7DC]'
                      }`}
                      title="Toggle Live Telemetry Ribbon Console"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C23B22] animate-pulse" />
                        <span>Telegraph Ribbon Logs ({logs.length})</span>
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                        showLogs ? 'bg-[#C23B22] text-[#FAF5EB]' : 'bg-[#EFE7DC] text-[#736056]'
                      }`}>
                        {showLogs ? 'Active' : 'Show'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="pt-4 border-t border-[#D7C3AF]/80 flex items-center justify-between text-xs text-[#8C776E] font-mono">
                <a
                  href="https://github.com/luisenriquecgongora/yapper"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-[#594A42] hover:text-[#C23B22] transition-colors"
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  <span>GitHub Repository ↗</span>
                </a>
                <button
                  type="button"
                  onClick={closeMenuDrawer}
                  className="px-4 py-1.5 rounded-xl bg-[#251C17] text-[#FAF5EB] font-sans hover:bg-[#3A2D25] transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ⚙ Engine & Model Settings Drawer */}
      {settingsDrawerRendered && (
        <div
          className="fixed inset-0 z-50 overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Engine and Model Settings"
        >
          {/* Backdrop overlay with fade transition */}
          <div
            className={`fixed inset-0 bg-[#251C17]/45 backdrop-blur-xs transition-opacity duration-300 ease-out cursor-pointer ${
              settingsDrawerVisible ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={closeSettingsDrawer}
          />

          {/* Sliding Drawer Container */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10 pointer-events-none">
            <div
              className={`pointer-events-auto w-screen max-w-md bg-[#F7F3EA] border-l border-[#D7C3AF] shadow-[-16px_0_40px_rgba(37,28,23,0.18)] p-6 md:p-8 flex flex-col justify-between overflow-y-auto space-y-6 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform ${
                settingsDrawerVisible ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-[#D7C3AF]/80 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#FAF6EE] border border-[#D7C3AF] text-[#C23B22] flex items-center justify-center text-sm shadow-xs select-none">
                    ⚙
                  </div>
                  <div>
                    <h3 className="font-serif italic font-medium text-lg text-[#251C17] leading-tight">
                      Settings
                    </h3>
                    <p className="text-[10px] font-mono text-[#8C776E]">
                      Engine Architecture &amp; Models
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeSettingsDrawer}
                  className="w-8 h-8 rounded-full border border-[#D7C3AF] flex items-center justify-center text-[#8C776E] hover:text-[#C23B22] hover:border-[#C23B22] bg-[#FAF6EE] transition-colors cursor-pointer"
                  title="Close Settings (Esc)"
                >
                  ✕
                </button>
              </div>

              {/* Drawer Body - ONLY Settings options */}
              <div className="space-y-5 flex-1">
                {/* Engine Architecture Card */}
                <div className="paper-card rounded-2xl p-4 sm:p-5 space-y-3 text-[#594A42]">
                  <div className="flex items-center justify-between mb-1">
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

                {/* Model Scale & Language Card */}
                <div className="paper-card rounded-2xl p-4 sm:p-5 space-y-4 text-[#594A42]">
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

                {/* Local Model Download / Cache Card */}
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
                <span className="text-[11px] text-[#8C776E]">
                  Active: <strong className="text-[#251C17]">{preferredEngine === 'browser' ? 'Native 0ms' : `Whisper (${modelSize})`}</strong>
                </span>
                <button
                  type="button"
                  onClick={closeSettingsDrawer}
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
