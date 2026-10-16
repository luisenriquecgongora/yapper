/**
 * @yapper/core
 * Local in-browser Whisper engine using @huggingface/transformers.
 * Hardware-accelerated via WebGPU with automatic fallback to WebAssembly (WASM).
 */

import { decodeTo16kMono } from '../audio/audioProcessor';
import { LocalModelDownloadProgress, ModelSize } from '../types';

export const MODEL_REGISTRY: Record<ModelSize, { id: string; approxMb: number }> = {
  tiny: { id: 'onnx-community/whisper-tiny', approxMb: 40 },
  base: { id: 'onnx-community/whisper-base', approxMb: 75 },
  small: { id: 'onnx-community/whisper-small', approxMb: 245 },
};

const CACHE_NAME = 'transformers-cache';
const READY_STORAGE_PREFIX = 'plaato.talk.modelReady:';

// Phantom Whisper tokens produced during background noise
const HALLUCINATION_REGEX = /^(\[.*\]|\(.*\)|thank you for watching.*|subtitles by.*|\.+)$/i;

type ProgressListener = (progress: LocalModelDownloadProgress) => void;

export class LocalWhisperEngine {
  private modelSize: ModelSize;
  private modelHost?: string;
  private pipeline: any = null;
  private loadingPromise: Promise<any> | null = null;
  private progressListeners = new Set<ProgressListener>();

  private state: LocalModelDownloadProgress = {
    status: 'absent',
    progress: 0,
    loadedBytes: 0,
    totalBytes: 0,
  };

  constructor(modelSize: ModelSize = 'tiny', modelHost?: string) {
    this.modelSize = modelSize;
    this.modelHost = modelHost;
    this.state.status = this.checkIsDownloaded() ? 'ready' : 'absent';
  }

  public get modelId(): string {
    return MODEL_REGISTRY[this.modelSize].id;
  }

  public get approxMb(): number {
    return MODEL_REGISTRY[this.modelSize].approxMb;
  }

  public getState(): LocalModelDownloadProgress {
    return { ...this.state };
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

  public async load(isFirstDownload: boolean = false): Promise<any> {
    if (this.pipeline) return this.pipeline;
    if (this.loadingPromise) return this.loadingPromise;

    this.updateState({
      status: isFirstDownload ? 'downloading' : 'loading',
      progress: 0,
      loadedBytes: 0,
      totalBytes: 0,
    });

    const fileMap = new Map<string, { loaded: number; total: number }>();

    this.loadingPromise = (async () => {
      // Dynamic import so transformers.js is only loaded on demand
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = false;
      if (this.modelHost) {
        env.remoteHost = this.modelHost.replace(/\/?$/, '/');
      }

      const hasGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
      const asr = await (pipeline as any)('automatic-speech-recognition', this.modelId, {
        device: hasGpu ? 'webgpu' : 'wasm',
        dtype: hasGpu ? { encoder_model: 'fp16', decoder_model_merged: 'q4' } : 'q8',
        progress_callback: (event: any) => {
          if (event?.status !== 'progress' || !event.file) return;
          fileMap.set(event.file, { loaded: event.loaded ?? 0, total: event.total ?? 0 });
          let loaded = 0;
          let total = 0;
          fileMap.forEach((f) => {
            loaded += f.loaded;
            total += f.total;
          });
          this.updateState({
            loadedBytes: loaded,
            totalBytes: total,
            progress: total > 0 ? loaded / total : 0,
          });
        },
      });
      return asr;
    })();

    return this.loadingPromise.then(
      (asr) => {
        this.pipeline = asr;
        this.loadingPromise = null;
        this.setDownloadedFlag(true);
        this.updateState({ status: 'ready', progress: 1 });
        return asr;
      },
      (err) => {
        this.loadingPromise = null;
        if (isFirstDownload) this.setDownloadedFlag(false);
        this.updateState({ status: isFirstDownload ? 'error' : 'absent', progress: 0 });
        throw err;
      }
    );
  }

  public async transcribe(blob: Blob, language: string = 'english'): Promise<string> {
    const audio = await decodeTo16kMono(blob);
    // Suppress tiny blips or silence (< 0.15s of 16kHz audio)
    if (!audio || audio.length < 2400) {
      return '';
    }

    const asr = await this.load(false);
    const result = await asr(audio, {
      language,
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    const raw = Array.isArray(result) ? result.map((r: any) => r.text).join(' ') : result.text;
    const clean = (raw || '').trim();

    if (HALLUCINATION_REGEX.test(clean)) {
      return '';
    }
    return clean;
  }

  public async remove(): Promise<void> {
    this.pipeline = null;
    this.loadingPromise = null;
    this.setDownloadedFlag(false);
    try {
      if (typeof caches !== 'undefined') {
        await caches.delete(CACHE_NAME);
      }
    } catch {}
    this.updateState({ status: 'absent', progress: 0, loadedBytes: 0, totalBytes: 0 });
  }
}
