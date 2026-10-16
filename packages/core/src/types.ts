/**
 * @yapper/core
 * Core type definitions for Plaato Talk universal speech-to-text engine.
 */

export type VoiceEngine = 'local' | 'browser' | 'cloud' | 'none';

export type ModelSize = 'tiny' | 'base' | 'small';

export type TalkStatus =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'noSpeech'
  | 'denied'
  | 'unavailable'
  | 'needsModel'
  | 'error';

export interface LocalModelDownloadProgress {
  status: 'absent' | 'downloading' | 'loading' | 'ready' | 'error' | 'unsupported';
  progress: number; // 0 - 1
  loadedBytes: number;
  totalBytes: number;
}

export interface EngineCapabilities {
  hasWebGpu: boolean;
  hasWebAssembly: boolean;
  hasBrowserSpeech: boolean;
  hasAudioContext: boolean;
}

export interface TalkChunkResult {
  /** Running interim text as user speaks */
  interim: string;
  /** Stable confirmed text produced by local agreement */
  committed: string;
}

export interface TalkSession {
  /** Stop listening, process remaining audio buffers, and resolve with the final text */
  stop: () => Promise<string>;
  /** Cancel listening and discard audio */
  cancel: () => void;
}

export interface TalkClientOptions {
  /** Preferred engine. Defaults to 'auto' (picks best supported engine) */
  preferredEngine?: 'auto' | VoiceEngine;
  /** ISO 639-1 or full language name (e.g., 'en', 'pl', 'es', 'korean') */
  language?: string;
  /** In-browser model size. Defaults to 'tiny' for fast download, or 'small' for maximum accuracy */
  modelSize?: ModelSize;
  /** Custom remote host URL for model weights (e.g., Cloudflare R2 mirror) */
  modelHost?: string;
  /** Cloud endpoint URL for 'cloud' engine mode */
  cloudEndpoint?: string;
  /** Custom auth headers for cloud requests (e.g. Bearer token, X-Business-Id) */
  cloudHeaders?: Record<string, string>;
  /** Real-time callback providing live running transcript while user speaks */
  onInterim?: (text: string) => void;
  /** Callback fired when final transcription is emitted */
  onFinal?: (text: string) => void;
  /** Callback fired when audio input level changes (0 - 1) */
  onAudioLevel?: (level: number) => void;
  /** Callback fired when engine status changes */
  onStatusChange?: (status: TalkStatus) => void;
  /** Callback fired on model download progress */
  onModelProgress?: (progress: LocalModelDownloadProgress) => void;
}

export type YapperClientOptions = TalkClientOptions;
export type YapperSession = TalkSession;
export type YapperStatus = TalkStatus;
