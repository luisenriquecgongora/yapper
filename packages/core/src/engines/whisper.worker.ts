/**
 * @yapper/core
 * Dedicated Web Worker for on-device Whisper inference.
 * Offloads heavy WebGPU / WASM execution from the main UI thread.
 */

import { pipeline, env } from '@huggingface/transformers';

// ISO 639-1 code map
const LANGUAGE_CODE_MAP: Record<string, string> = {
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

let asrPipeline: any = null;
let currentModelId: string | null = null;
let isInitializing = false;
let initPromise: Promise<any> | null = null;

// Configure Hugging Face Transformers environment
env.allowLocalModels = false;

self.onmessage = async (event: MessageEvent) => {
  const data = event.data;
  if (!data || !data.type) return;

  switch (data.type) {
    case 'INIT': {
      const { id, modelId, modelHost, language } = data;
      try {
        if (asrPipeline && currentModelId === modelId) {
          self.postMessage({ type: 'INIT_RESULT', id, success: true, modelId });
          return;
        }

        if (isInitializing && initPromise) {
          await initPromise;
          self.postMessage({ type: 'INIT_RESULT', id, success: true, modelId: currentModelId });
          return;
        }

        isInitializing = true;
        initPromise = (async () => {
          if (modelHost) {
            env.remoteHost = modelHost.replace(/\/?$/, '/');
          }

          // Specialize to English-only model if language is English and model is tiny
          const normLang = language ? (LANGUAGE_CODE_MAP[language.toLowerCase()] || language) : '';
          let effectiveModelId = modelId;
          if (modelId === 'onnx-community/whisper-tiny' && (normLang === 'en' || language === 'english')) {
            effectiveModelId = 'onnx-community/whisper-tiny.en';
          }

          const fileMap = new Map<string, { loaded: number; total: number }>();
          const progressCb = (ev: any) => {
            if (ev?.status !== 'progress' || !ev.file) return;
            fileMap.set(ev.file, { loaded: ev.loaded ?? 0, total: ev.total ?? 0 });
            let loaded = 0;
            let total = 0;
            fileMap.forEach((f) => {
              loaded += f.loaded;
              total += f.total;
            });
            const progress = total > 0 ? loaded / total : 0;
            self.postMessage({
              type: 'PROGRESS',
              id,
              loadedBytes: loaded,
              totalBytes: total,
              progress,
              file: ev.file,
            });
          };

          const hasGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
          let selectedDevice = 'wasm';
          let selectedDtype: any = 'q8';

          if (hasGpu) {
            try {
              const adapter = await (navigator as any).gpu.requestAdapter();
              if (adapter) {
                selectedDevice = 'webgpu';
                const hasFp16 = adapter.features?.has('shader-f16');
                selectedDtype = {
                  encoder_model: hasFp16 ? 'fp16' : 'fp32',
                  decoder_model_merged: hasFp16 ? 'fp16' : 'fp32',
                };
              }
            } catch {
              selectedDevice = 'wasm';
              selectedDtype = 'q8';
            }
          }

          let asr: any;
          try {
            asr = await (pipeline as any)('automatic-speech-recognition', effectiveModelId, {
              device: selectedDevice,
              dtype: selectedDtype,
              progress_callback: progressCb,
            });
          } catch (primaryErr: any) {
            if (selectedDevice === 'webgpu') {
              selectedDevice = 'wasm';
              selectedDtype = 'q8';
              asr = await (pipeline as any)('automatic-speech-recognition', effectiveModelId, {
                device: 'wasm',
                dtype: 'q8',
                progress_callback: progressCb,
              });
            } else {
              throw primaryErr;
            }
          }

          // Pre-warm pipeline with rapid 0.2s dummy pass
          try {
            const dummyAudio = new Float32Array(3200);
            await asr(dummyAudio, { task: 'transcribe', max_new_tokens: 1, num_beams: 1, language: 'en' });
          } catch {}

          asrPipeline = asr;
          currentModelId = effectiveModelId;
          return asr;
        })();

        await initPromise;
        isInitializing = false;
        initPromise = null;
        self.postMessage({ type: 'INIT_RESULT', id, success: true, modelId: currentModelId });
      } catch (err: any) {
        isInitializing = false;
        initPromise = null;
        self.postMessage({
          type: 'INIT_RESULT',
          id,
          success: false,
          error: err?.message || String(err),
        });
      }
      break;
    }

    case 'TRANSCRIBE_CHUNK': {
      const { id, audio, language, isInterim } = data;
      try {
        if (!asrPipeline) {
          throw new Error('Inference pipeline has not been initialized. Call INIT first.');
        }

        const floatArray = audio instanceof Float32Array ? audio : new Float32Array(audio);
        if (!floatArray || floatArray.length < 4000) {
          self.postMessage({ type: 'TRANSCRIBE_RESULT', id, text: '', latencyMs: 0 });
          return;
        }

        const normLang = language ? (LANGUAGE_CODE_MAP[language.toLowerCase()] || language) : 'en';
        const options: any = {
          task: 'transcribe',
          num_beams: 1,
          max_new_tokens: isInterim ? 12 : 96,
          do_sample: false,
          temperature: 0,
          repetition_penalty: 1.25,
          no_repeat_ngram_size: 3,
          return_timestamps: false,
          language: normLang,
        };

        if (floatArray.length > 30 * 16000) {
          options.chunk_length_s = 30;
          options.stride_length_s = 5;
        }

        const t0 = performance.now();
        const result = await asrPipeline(floatArray, options);
        const latencyMs = Math.round(performance.now() - t0);
        const raw = Array.isArray(result) ? result.map((r: any) => r.text).join(' ') : result.text;
        const clean = (raw || '').trim();
        const text = clean && !HALLUCINATION_REGEX.test(clean) ? clean : '';

        self.postMessage({
          type: 'TRANSCRIBE_RESULT',
          id,
          text,
          latencyMs,
          audioDurationSec: Number((floatArray.length / 16000).toFixed(1)),
        });
      } catch (err: any) {
        self.postMessage({
          type: 'TRANSCRIBE_RESULT',
          id,
          text: '',
          latencyMs: 0,
          error: err?.message || String(err),
        });
      }
      break;
    }

    case 'DISPOSE': {
      const { id } = data;
      asrPipeline = null;
      currentModelId = null;
      isInitializing = false;
      initPromise = null;
      self.postMessage({ type: 'DISPOSE_RESULT', id, success: true });
      break;
    }

    default:
      break;
  }
};
