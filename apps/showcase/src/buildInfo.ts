export interface CommitEntry {
  hash: string;
  message: string;
  date: string;
  author: string;
}

declare const __APP_VERSION__: string;
declare const __GIT_HASH__: string;
declare const __GIT_COMMITS__: CommitEntry[];

const FALLBACK_COMMITS: CommitEntry[] = [
  {
    hash: 'd63a0a9',
    message: 'feat: add 3-phase timing telemetry and Architecture & Speed Anatomy guide',
    date: '2026-10-17',
    author: 'Luis Enrique',
  },
  {
    hash: 'f8f98fc',
    message: 'perf: accelerate WebGPU Whisper streaming with FP16 and reactive voice orb',
    date: '2026-10-16',
    author: 'Luis Enrique',
  },
  {
    hash: 'd3371b5',
    message: 'chore: add showcase gitignore',
    date: '2026-10-16',
    author: 'Luis Enrique',
  },
  {
    hash: '5876711',
    message: 'fix(engine): safe WebGPU dtype detection, robust error recovery, telemetry logs, and bundle Tailwind',
    date: '2026-10-16',
    author: 'Luis Enrique',
  },
  {
    hash: '2efe423',
    message: 'docs: comprehensive README and repo description for WebGPU Whisper SDK',
    date: '2026-10-16',
    author: 'Luis Enrique',
  },
  {
    hash: '337520f',
    message: 'feat(ui): full-screen cotton paper background and desktop split letter manuscript',
    date: '2026-10-16',
    author: 'Luis Enrique',
  },
  {
    hash: '928cf6e',
    message: 'perf: 4-bit q4 quantization, greedy decoding, and engine architecture toggle',
    date: '2026-10-16',
    author: 'Luis Enrique',
  },
  {
    hash: 'efeabb6',
    message: 'fix(engine): eager background awakening, WebGPU shader warm-up, and continuous 800ms streaming',
    date: '2026-10-16',
    author: 'Luis Enrique',
  },
  {
    hash: '99a2759',
    message: 'fix(audio): direct 16kHz PCM streaming and AudioContext level metering',
    date: '2026-10-16',
    author: 'Luis Enrique',
  },
  {
    hash: 'e41224e',
    message: 'feat(ui): realistic cotton paper stationery and letterpress styling inspired by Her',
    date: '2026-10-16',
    author: 'Luis Enrique',
  },
  {
    hash: '72bcfae',
    message: 'feat(ui): redesign showcase and components in Her-inspired poetic aesthetic',
    date: '2026-10-16',
    author: 'Luis Enrique',
  },
  {
    hash: 'd2851d5',
    message: 'chore: add yarn.lock for deterministic builds',
    date: '2026-10-16',
    author: 'Luis Enrique',
  },
];

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
export const GIT_HASH = typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : 'd63a0a9';
export const RECENT_COMMITS: CommitEntry[] =
  typeof __GIT_COMMITS__ !== 'undefined' && Array.isArray(__GIT_COMMITS__) && __GIT_COMMITS__.length > 0
    ? __GIT_COMMITS__
    : FALLBACK_COMMITS;
