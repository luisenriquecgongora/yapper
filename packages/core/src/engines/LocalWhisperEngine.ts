/**
 * @yapper/core
 * Local in-browser Whisper engine offloaded to a dedicated Web Worker.
 * Hardware-accelerated via WebGPU with automatic fallback to WebAssembly (WASM).
 * Isolates neural inference from the main thread to ensure smooth 60 FPS UI rendering.
 */

import { decodeTo16kMono } from '../audio/audioProcessor';
import { logger } from '../logger';
import { LocalModelDownloadProgress, ModelSize } from '../types';

export const MODEL_REGISTRY: Record<ModelSize, { id: string; approxMb: number }> = {
  tiny: { id: 'onnx-community/whisper-tiny', approxMb: 76 },
  base: { id: 'onnx-community/whisper-base', approxMb: 140 },
  small: { id: 'onnx-community/whisper-small', approxMb: 240 },
};

const CACHE_NAME = 'transformers-cache';
const READY_STORAGE_PREFIX = 'plaato.talk.modelReady.v2:';

// ISO 639-1 code map to prevent Whisper language auto-detection delays
export const LANGUAGE_CODE_MAP: Record<string, string> = {
  english: 'en',
  en: 'en',
  spanish: 'es',
  es: 'es',
  french: 'fr',
  fr: 'fr',
  german: 'de',
  de: 'de',
  italian: 'it',
  it: 'it',
  portuguese: 'pt',
  pt: 'pt',
  polish: 'pl',
  pl: 'pl',
  russian: 'ru',
  ru: 'ru',
  korean: 'ko',
  ko: 'ko',
  chinese: 'zh',
  zh: 'zh',
  japanese: 'ja',
  ja: 'ja',
  ukrainian: 'uk',
  uk: 'uk',
};

// Phantom Whisper tokens produced during background noise or silence
const HALLUCINATION_REGEX = /^(\[.*\]|\(.*\)|thank you for watching.*|subtitles by.*|you|\.+)$/i;

type ProgressListener = (progress: LocalModelDownloadProgress) => void;

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

export class LocalWhisperEngine {
  private _modelSize: ModelSize;
  private modelHost?: string;
  private worker: Worker | null = null;
  private loadingPromise: Promise<any> | null = null;
  private isLoaded: boolean = false;
  private progressListeners = new Set<ProgressListener>();
  private loadFailed: boolean = false;
  private lastLoadError: Error | null = null;
  private reqSeq: number = 0;
  private pendingRequests = new Map<string, PendingRequest>();

  private state: LocalModelDownloadProgress = {
    status: 'absent',
    progress: 0,
    loadedBytes: 0,
    totalBytes: 0,
  };

  constructor(modelSize: ModelSize = 'tiny', modelHost?: string) {
    this._modelSize = modelSize;
    this.modelHost = modelHost;
    const isDownloaded = this.checkIsDownloaded();
    // Maintain 'ready' if previously cached so UI stays serene
    this.state.status = isDownloaded ? 'ready' : 'absent';

    // If model was previously downloaded into Cache API, eagerly awaken in background silently
    if (isDownloaded && typeof window !== 'undefined') {
      const autoAwaken = () => {
        logger.info('model', `Auto-awakening cached pipeline for ${this.modelId} in worker...`);
        this.load(false, true).catch((err) => {
          logger.warn('model', `Background pre-warm notice for ${this.modelId}:`, err?.message || err);
        });
      };
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(autoAwaken, { timeout: 2500 });
      } else {
        setTimeout(autoAwaken, 300);
      }
    }
  }

  public get modelSize(): ModelSize {
    return this._modelSize;
  }

  public get modelId(): string {
    return MODEL_REGISTRY[this._modelSize].id;
  }

  public get approxMb(): number {
    return MODEL_REGISTRY[this._modelSize].approxMb;
  }

  public getState(): LocalModelDownloadProgress {
    return { ...this.state };
  }

  public get isFailed(): boolean {
    return this.loadFailed;
  }

  public subscribeProgress(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    listener(this.state);
    return () => this.progressListeners.delete(listener);
  }

  private updateState(patch: Partial<LocalModelDownloadProgress>): void {
    this.state = { ...this.state, ...patch };
    this.progressListeners.forEach((l) => l(this.state));
  }

  private checkIsDownloaded(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem(`${READY_STORAGE_PREFIX}${this.modelId}`) === 'true';
    } catch {
      return false;
    }
  }

  private setDownloadedFlag(ready: boolean): void {
    if (typeof localStorage === 'undefined') return;
    try {
      if (ready) localStorage.setItem(`${READY_STORAGE_PREFIX}${this.modelId}`, 'true');
      else localStorage.removeItem(`${READY_STORAGE_PREFIX}${this.modelId}`);
    } catch {}
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;

    if (typeof Worker === 'undefined') {
      throw new Error('Web Workers are not supported in this runtime environment.');
    }

    this.worker = new Worker(
      new URL('./whisper.worker.ts', import.meta.url),
      { type: 'module' }
    );

    this.worker.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;

      switch (data.type) {
        case 'PROGRESS': {
          this.updateState({
            loadedBytes: data.loadedBytes ?? 0,
            totalBytes: data.totalBytes ?? 0,
            progress: data.progress ?? 0,
          });
          break;
        }

        case 'INIT_RESULT': {
          const req = this.pendingRequests.get(data.id);
          if (req) {
            this.pendingRequests.delete(data.id);
            if (data.success) {
              req.resolve(data);
            } else {
              req.reject(new Error(data.error || 'Failed to initialize Whisper worker pipeline'));
            }
          }
          break;
        }

        case 'TRANSCRIBE_RESULT': {
          const req = this.pendingRequests.get(data.id);
          if (req) {
            this.pendingRequests.delete(data.id);
            if (data.error) {
              logger.warn('stt', `Worker transcription notice: ${data.error}`);
              req.resolve({ text: '', latencyMs: 0 });
            } else {
              req.resolve(data);
            }
          }
          break;
        }

        case 'DISPOSE_RESULT': {
          const req = this.pendingRequests.get(data.id);
          if (req) {
            this.pendingRequests.delete(data.id);
            req.resolve(true);
          }
          break;
        }

        default:
          break;
      }
    };

    this.worker.onerror = (err) => {
      logger.error('model', 'Whisper Web Worker unhandled error:', err?.message || err);
      this.loadFailed = true;
      this.updateState({ status: 'error' });
      // Reject any pending requests
      this.pendingRequests.forEach((req) => {
        req.reject(new Error(`Whisper Worker error: ${err?.message || 'Worker encountered an error'}`));
      });
      this.pendingRequests.clear();
    };

    return this.worker;
  }

  public async load(isFirstDownload: boolean = false, isSilentBackground: boolean = false): Promise<any> {
    if (this.isLoaded) return true;
    if (this.loadingPromise) return this.loadingPromise;

    if (!isSilentBackground || this.state.status !== 'ready') {
      this.updateState({
        status: isFirstDownload ? 'downloading' : 'loading',
        progress: 0,
        loadedBytes: 0,
        totalBytes: 0,
      });
    }

    this.loadingPromise = (async () => {
      logger.info('model', `Beginning worker pipeline load for ${this.modelId}...`);
      const worker = this.getWorker();
      const reqId = `init_${Date.now()}_${++this.reqSeq}`;

      return new Promise((resolve, reject) => {
        this.pendingRequests.set(reqId, { resolve, reject });
        worker.postMessage({
          type: 'INIT',
          id: reqId,
          modelId: this.modelId,
          modelHost: this.modelHost,
        });
      });
    })();

    return this.loadingPromise.then(
      () => {
        this.isLoaded = true;
        this.loadingPromise = null;
        this.loadFailed = false;
        this.lastLoadError = null;
        this.setDownloadedFlag(true);
        this.updateState({ status: 'ready', progress: 1 });
        logger.info('model', `Worker Whisper pipeline ready for ${this.modelId}`);
        return true;
      },
      (err) => {
        this.loadingPromise = null;
        this.loadFailed = true;
        this.lastLoadError = err;
        logger.error('model', `Worker pipeline load failed: ${err?.message || err}`);
        if (isFirstDownload) this.setDownloadedFlag(false);
        this.updateState({ status: isFirstDownload ? 'error' : 'absent', progress: 0 });
        throw err;
      }
    );
  }

  public async transcribe(
    input: Blob | Float32Array,
    language: string = 'english',
    isInterim: boolean = false
  ): Promise<string> {
    if (this.loadFailed) {
      return '';
    }

    const audio = input instanceof Float32Array ? input : await decodeTo16kMono(input);
    // Suppress tiny blips or silence (< 0.25s of 16kHz audio)
    if (!audio || audio.length < 4000) {
      return '';
    }

    try {
      await this.load(false);
    } catch {
      this.loadFailed = true;
      return '';
    }

    const worker = this.getWorker();
    const reqId = `tx_${Date.now()}_${++this.reqSeq}`;

    // Transfer zero-copy copy to worker
    const transferBuffer = audio.slice();

    const resultPromise = new Promise<{ text: string; latencyMs: number; audioDurationSec?: number }>(
      (resolve, reject) => {
        this.pendingRequests.set(reqId, { resolve, reject });
        worker.postMessage(
          {
            type: 'TRANSCRIBE_CHUNK',
            id: reqId,
            audio: transferBuffer,
            language,
            isInterim,
          },
          [transferBuffer.buffer]
        );
      }
    );

    try {
      const result = await resultPromise;
      const clean = (result.text || '').trim();
      const latencyMs = result.latencyMs || 0;
      const audioDurationSec = result.audioDurationSec || (audio.length / 16000).toFixed(1);
      const approxTokens = clean ? Math.max(1, Math.round(clean.length / 3.8)) : 0;
      const msPerToken = approxTokens > 0 ? Math.round(latencyMs / approxTokens) : latencyMs;

      if (clean && !HALLUCINATION_REGEX.test(clean)) {
        logger.info(
          'stt',
          `[Interpreting] ${audioDurationSec}s audio transcribed in ${latencyMs}ms (~${msPerToken}ms/token, ${clean.length} chars) → "${clean.substring(0, 45)}${clean.length > 45 ? '...' : ''}"`
        );
        return clean;
      }
      return '';
    } catch (err: any) {
      logger.warn('stt', `Whisper worker transcription step error: ${err?.message || err}`);
      return '';
    }
  }

  public async remove(): Promise<void> {
    if (this.worker) {
      const reqId = `disp_${Date.now()}_${++this.reqSeq}`;
      try {
        await new Promise((resolve, reject) => {
          this.pendingRequests.set(reqId, { resolve, reject });
          this.worker?.postMessage({ type: 'DISPOSE', id: reqId });
          setTimeout(() => resolve(true), 200);
        });
      } catch {}

      this.worker.terminate();
      this.worker = null;
    }

    this.isLoaded = false;
    this.loadingPromise = null;
    this.loadFailed = false;
    this.lastLoadError = null;
    this.setDownloadedFlag(false);

    try {
      if (typeof caches !== 'undefined') {
        await caches.delete(CACHE_NAME);
      }
    } catch {}

    this.updateState({ status: 'absent', progress: 0, loadedBytes: 0, totalBytes: 0 });
    logger.info('model', `Cache and worker released for ${this.modelId}`);
  }
}
