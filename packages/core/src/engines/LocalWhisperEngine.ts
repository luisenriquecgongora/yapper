/**
 * @yapper/core
 * Local in-browser Whisper engine using @huggingface/transformers.
 * Hardware-accelerated via WebGPU with automatic fallback to WebAssembly (WASM).
 * Optimized with q4 quantization, greedy decoding, and bounded token generation for maximum speed.
 */

import { decodeTo16kMono } from '../audio/audioProcessor';
import { LocalModelDownloadProgress, ModelSize } from '../types';

export const MODEL_REGISTRY: Record<ModelSize, { id: string; approxMb: number }> = {
  tiny: { id: 'onnx-community/whisper-tiny', approxMb: 28 },
  base: { id: 'onnx-community/whisper-base', approxMb: 48 },
  small: { id: 'onnx-community/whisper-small', approxMb: 145 },
};

const CACHE_NAME = 'transformers-cache';
const READY_STORAGE_PREFIX = 'plaato.talk.modelReady:';

// Phantom Whisper tokens produced during background noise or silence
const HALLUCINATION_REGEX = /^(\[.*\]|\(.*\)|thank you for watching.*|subtitles by.*|you|\.+)$/i;

type ProgressListener = (progress: LocalModelDownloadProgress) => void;

export class LocalWhisperEngine {
  private _modelSize: ModelSize;
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
    this._modelSize = modelSize;
    this.modelHost = modelHost;
    const isDownloaded = this.checkIsDownloaded();
    this.state.status = isDownloaded ? 'loading' : 'absent';

    // If model was previously downloaded into Cache API, eagerly awaken in background
    if (isDownloaded && typeof window !== 'undefined') {
      const autoAwaken = () => {
        this.load(false).catch((err) => {
          console.warn('[yapper] Background auto-awakening failed:', err);
          this.updateState({ status: 'absent' });
        });
      };
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(autoAwaken, { timeout: 1500 });
      } else {
        setTimeout(autoAwaken, 200);
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
      const progressCb = (event: any) => {
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
      };

      let asr: any;
      try {
        if (hasGpu) {
          // Use 4-bit quantization on both encoder and decoder for maximum throughput and minimal memory bandwidth
          asr = await (pipeline as any)('automatic-speech-recognition', this.modelId, {
            device: 'webgpu',
            dtype: { encoder_model: 'q4', decoder_model_merged: 'q4' },
            progress_callback: progressCb,
          });
        } else {
          throw new Error('WebGPU not supported on this device');
        }
      } catch (gpuErr) {
        console.warn('[yapper] WebGPU initialization failed or unavailable, falling back to WASM:', gpuErr);
        asr = await (pipeline as any)('automatic-speech-recognition', this.modelId, {
          device: 'wasm',
          dtype: 'q8',
          progress_callback: progressCb,
        });
      }

      // Pre-warm pipeline with a rapid 0.1s dummy pass (1 token max) so WGSL shaders compile ahead of time
      try {
        const dummyAudio = new Float32Array(1600);
        await asr(dummyAudio, { task: 'transcribe', max_new_tokens: 1, num_beams: 1 });
      } catch (warmupErr) {
        console.warn('[yapper] Non-fatal shader warm-up notice:', warmupErr);
      }

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

  public async transcribe(input: Blob | Float32Array, language: string = 'english'): Promise<string> {
    const audio = input instanceof Float32Array ? input : await decodeTo16kMono(input);
    // Suppress tiny blips or silence (< 0.2s of 16kHz audio)
    if (!audio || audio.length < 3200) {
      return '';
    }

    const asr = await this.load(false);
    const options: any = {
      task: 'transcribe',
      num_beams: 1,       // Greedy decoding: 5x-10x faster than default beam search
      max_new_tokens: 64, // Fast bounded decoding (prevents runaway autoregressive loops)
      do_sample: false,   // Deterministic greedy pass
      temperature: 0,
      return_timestamps: false,
    };
    if (language) {
      options.language = language;
    }
    // Only chunk if audio exceeds 30 seconds
    if (audio.length > 30 * 16000) {
      options.chunk_length_s = 30;
      options.stride_length_s = 5;
    }

    try {
      const result = await asr(audio, options);
      const raw = Array.isArray(result) ? result.map((r: any) => r.text).join(' ') : result.text;
      const clean = (raw || '').trim();

      if (HALLUCINATION_REGEX.test(clean)) {
        return '';
      }
      return clean;
    } catch (err) {
      console.warn('[yapper] transcription error:', err);
      return '';
    }
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
