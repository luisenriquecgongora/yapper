/**
 * @yapper/core
 * Local in-browser Whisper engine using @huggingface/transformers.
 * Hardware-accelerated via WebGPU with automatic fallback to WebAssembly (WASM).
 * Optimized with bounded greedy decoding, safe shader compilation, and backoff telemetry.
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

export class LocalWhisperEngine {
  private _modelSize: ModelSize;
  private modelHost?: string;
  private pipeline: any = null;
  private loadingPromise: Promise<any> | null = null;
  private progressListeners = new Set<ProgressListener>();
  private loadFailed: boolean = false;
  private lastLoadError: Error | null = null;

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
        logger.info('model', `Auto-awakening cached pipeline for ${this.modelId} in background...`);
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

  public async load(isFirstDownload: boolean = false, isSilentBackground: boolean = false): Promise<any> {
    if (this.pipeline) return this.pipeline;
    if (this.loadingPromise) return this.loadingPromise;

    if (!isSilentBackground || this.state.status !== 'ready') {
      this.updateState({
        status: isFirstDownload ? 'downloading' : 'loading',
        progress: 0,
        loadedBytes: 0,
        totalBytes: 0,
      });
    }

    const fileMap = new Map<string, { loaded: number; total: number }>();

    this.loadingPromise = (async () => {
      logger.info('model', `Beginning pipeline load for ${this.modelId}...`);
      
      // Dynamic import so transformers.js is only loaded on demand
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = false;
      if (this.modelHost) {
        env.remoteHost = this.modelHost.replace(/\/?$/, '/');
      }

      const hasGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
      let selectedDevice = 'wasm';
      let selectedDtype: any = 'q8';

      if (hasGpu) {
        try {
          const adapter = await (navigator as any).gpu.requestAdapter();
          if (adapter) {
            selectedDevice = 'webgpu';
            const hasFp16 = adapter.features?.has('shader-f16');
            // Full native half-precision FP16 on WebGPU eliminates per-token q4 dequantization overhead
            selectedDtype = {
              encoder_model: hasFp16 ? 'fp16' : 'fp32',
              decoder_model_merged: hasFp16 ? 'fp16' : 'fp32',
            };
            logger.info('hardware', `WebGPU adapter verified. shader-f16: ${!!hasFp16}`);
          } else {
            logger.warn('hardware', 'navigator.gpu present but requestAdapter returned null');
          }
        } catch (err: any) {
          logger.warn('hardware', 'Error requesting WebGPU adapter, defaulting to WASM:', err?.message || err);
        }
      } else {
        logger.info('hardware', 'WebGPU not detected in browser navigator. Falling back to WASM CPU.');
      }

      const progressCb = (event: any) => {
        if (event?.status !== 'progress' || !event.file) return;
        fileMap.set(event.file, { loaded: event.loaded ?? 0, total: event.total ?? 0 });
        let loaded = 0;
        let total = 0;
        fileMap.forEach((f) => {
          loaded += f.loaded;
          total += f.total;
        });
        const fraction = total > 0 ? loaded / total : 0;
        if (isFirstDownload || !isSilentBackground) {
          this.updateState({
            loadedBytes: loaded,
            totalBytes: total,
            progress: fraction,
          });
        }
      };

      let asr: any;
      try {
        logger.info('model', `Initializing ASR pipeline (${selectedDevice}, dtype: ${JSON.stringify(selectedDtype)})...`);
        asr = await (pipeline as any)('automatic-speech-recognition', this.modelId, {
          device: selectedDevice,
          dtype: selectedDtype,
          progress_callback: progressCb,
        });
        logger.info('model', `ASR pipeline created successfully via ${selectedDevice}`);
      } catch (primaryErr: any) {
        logger.warn('model', `ASR initialization with ${selectedDevice} failed: ${primaryErr?.message || primaryErr}. Attempting WASM fallback...`);
        if (selectedDevice === 'webgpu') {
          try {
            selectedDevice = 'wasm';
            selectedDtype = 'q8';
            asr = await (pipeline as any)('automatic-speech-recognition', this.modelId, {
              device: 'wasm',
              dtype: 'q8',
              progress_callback: progressCb,
            });
            logger.info('model', 'Fallback to WASM pipeline succeeded');
          } catch (wasmErr: any) {
            logger.error('model', 'WASM fallback also failed:', wasmErr?.message || wasmErr);
            throw wasmErr;
          }
        } else {
          throw primaryErr;
        }
      }

      // Pre-warm pipeline with a rapid 0.2s dummy pass (1 token max) so WGSL shaders compile ahead of time
      try {
        logger.info('model', 'Pre-warming pipeline shaders with 0.2s dummy audio...');
        const dummyAudio = new Float32Array(3200);
        await asr(dummyAudio, { task: 'transcribe', max_new_tokens: 1, num_beams: 1, language: 'en' });
        logger.info('model', 'Pipeline shaders compiled and ready in GPU memory');
      } catch (warmupErr: any) {
        logger.debug('model', 'Non-fatal shader warm-up notice:', warmupErr?.message || warmupErr);
      }

      return asr;
    })();

    return this.loadingPromise.then(
      (asr) => {
        this.pipeline = asr;
        this.loadingPromise = null;
        this.loadFailed = false;
        this.lastLoadError = null;
        this.setDownloadedFlag(true);
        this.updateState({ status: 'ready', progress: 1 });
        return asr;
      },
      (err) => {
        this.loadingPromise = null;
        this.loadFailed = true;
        this.lastLoadError = err;
        logger.error('model', `Pipeline load failed completely: ${err?.message || err}`);
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

    let asr: any;
    try {
      asr = await this.load(false);
    } catch (err) {
      // Mark as failed so subsequent interval passes do not hammer retries
      this.loadFailed = true;
      return '';
    }

    // Resolve ISO 639-1 language code to eliminate language-detection pipeline delay
    const normalizedLang = language ? (LANGUAGE_CODE_MAP[language.toLowerCase()] || language) : 'en';

    const options: any = {
      task: 'transcribe',
      num_beams: 1,        // Greedy decoding: 5x-10x faster than default beam search
      max_new_tokens: isInterim ? 12 : 96, // Tightly bounded tokens for interim (~3-4 words) avoids decoder runaway loops
      do_sample: false,    // Deterministic greedy pass
      temperature: 0,
      repetition_penalty: 1.25, // Prevents looping on dots "...." or repetitive phantom tokens on low audio
      no_repeat_ngram_size: 3,  // Halts autoregressive loop if 3-grams repeat
      return_timestamps: false,
      language: normalizedLang,
    };
    // Only chunk if audio exceeds 30 seconds
    if (audio.length > 30 * 16000) {
      options.chunk_length_s = 30;
      options.stride_length_s = 5;
    }

    const t0 = performance.now();
    try {
      const result = await asr(audio, options);
      const latencyMs = Math.round(performance.now() - t0);
      const audioDurationSec = (audio.length / 16000).toFixed(1);
      const raw = Array.isArray(result) ? result.map((r: any) => r.text).join(' ') : result.text;
      const clean = (raw || '').trim();
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
      logger.warn('stt', `Whisper transcription step notice: ${err?.message || err}`);
      return '';
    }
  }

  public async remove(): Promise<void> {
    this.pipeline = null;
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
    logger.info('model', `Cache released for ${this.modelId}`);
  }
}
