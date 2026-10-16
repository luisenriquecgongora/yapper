/**
 * @yapper/core
 * Unified TalkClient: Single entrypoint for browser, local Whisper, and cloud speech recognition.
 */

import { calculateRms, getOptimalMimeType, float32ToWav, downsampleTo16k } from './audio/audioProcessor';
import { EnergyVad } from './audio/energyVad';
import { BrowserSpeechEngine } from './engines/BrowserSpeechEngine';
import { CloudStreamEngine } from './engines/CloudStreamEngine';
import { LocalWhisperEngine } from './engines/LocalWhisperEngine';
import { LocalAgreementChunker } from './streaming/agreement';
import { TalkClientOptions, TalkSession, TalkStatus, VoiceEngine } from './types';

export class TalkClient {
  private options: TalkClientOptions;
  private localEngine: LocalWhisperEngine;
  private browserEngine: BrowserSpeechEngine;
  private cloudEngine?: CloudStreamEngine;
  private vad: EnergyVad;
  private agreementChunker = new LocalAgreementChunker();

  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private pcmChunks: Float32Array[] = [];
  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;

  private currentStatus: TalkStatus = 'idle';
  private activeSession: any = null;
  private streamIntervalId: any = null;
  private isProcessingChunk: boolean = false;

  constructor(options: TalkClientOptions = {}) {
    this.options = {
      preferredEngine: 'auto',
      language: 'english',
      modelSize: 'tiny',
      ...options,
    };

    this.localEngine = new LocalWhisperEngine(this.options.modelSize, this.options.modelHost);
    this.browserEngine = new BrowserSpeechEngine();

    if (this.options.cloudEndpoint) {
      this.cloudEngine = new CloudStreamEngine({
        endpoint: this.options.cloudEndpoint,
        headers: this.options.cloudHeaders,
        language: this.options.language,
      });
    }

    this.vad = new EnergyVad({
      silenceDurationMs: 4000,
      onSilenceDetected: () => {
        // Handled as passive silence marker
      },
    });

    if (this.options.onModelProgress) {
      this.localEngine.subscribeProgress(this.options.onModelProgress);
    }
  }

  public updateOptions(newOptions: Partial<TalkClientOptions>): void {
    this.options = { ...this.options, ...newOptions };
    if (newOptions.modelSize && newOptions.modelSize !== this.localEngine.modelSize) {
      this.localEngine = new LocalWhisperEngine(newOptions.modelSize, this.options.modelHost);
      if (this.options.onModelProgress) {
        this.localEngine.subscribeProgress(this.options.onModelProgress);
      }
    }
  }

  public get resolvedEngine(): VoiceEngine {
    const pref = this.options.preferredEngine;
    if (pref && pref !== 'auto') {
      return pref;
    }
    if (this.localEngine.getState().status === 'ready') {
      return 'local';
    }
    if (BrowserSpeechEngine.isSupported()) {
      return 'browser';
    }
    if (this.cloudEngine) {
      return 'cloud';
    }
    return 'none';
  }

  public get local(): LocalWhisperEngine {
    return this.localEngine;
  }

  private setStatus(status: TalkStatus): void {
    this.currentStatus = status;
    this.options.onStatusChange?.(status);
  }

  public getAccumulatedPcm(): Float32Array {
    if (this.pcmChunks.length === 0) return new Float32Array(0);
    let total = 0;
    for (const c of this.pcmChunks) total += c.length;
    const merged = new Float32Array(total);
    let offset = 0;
    for (const c of this.pcmChunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    const sampleRate = this.audioContext?.sampleRate || 16000;
    return downsampleTo16k(merged, sampleRate);
  }

  /** Start recording and listening with real-time streaming */
  public async start(): Promise<TalkSession> {
    if (this.currentStatus === 'listening') {
      return { stop: () => this.stop(), cancel: () => this.cancel() };
    }

    const engine = this.resolvedEngine;
    if (engine === 'none') {
      this.setStatus('needsModel');
      throw new Error('No voice engine is ready. Please download the local model or configure a cloud endpoint.');
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
    } catch {
      this.setStatus('denied');
      throw new Error('Microphone access denied by user.');
    }

    // Set up Web Audio Context (resuming if suspended by browser autoplay policy)
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      try {
        this.audioContext = new AudioCtx({ sampleRate: 16000 });
      } catch {
        this.audioContext = new AudioCtx();
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.5;

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);

      // Raw PCM accumulator via ScriptProcessorNode
      this.pcmChunks = [];
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.scriptProcessor.onaudioprocess = (e) => {
        if (this.currentStatus !== 'listening') return;
        const channel = e.inputBuffer.getChannelData(0);
        this.pcmChunks.push(new Float32Array(channel));
      };
      source.connect(this.scriptProcessor);

      // Connect through a zero-gain node to destination to keep ScriptProcessor running without feedback
      const muteGain = this.audioContext.createGain();
      muteGain.gain.value = 0;
      this.scriptProcessor.connect(muteGain);
      muteGain.connect(this.audioContext.destination);
    }

    // Start fallback MediaRecorder
    const mimeType = getOptimalMimeType();
    if (mimeType && typeof MediaRecorder !== 'undefined') {
      try {
        this.mediaRecorder = new MediaRecorder(this.mediaStream, {
          mimeType,
          audioBitsPerSecond: 64000,
        });
        this.audioChunks = [];
        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) this.audioChunks.push(e.data);
        };
        this.mediaRecorder.start(250);
      } catch {}
    }

    this.agreementChunker.reset();
    this.vad.reset();
    this.setStatus('listening');

    // Real-time audio level loop (~60fps)
    const timeData = new Float32Array(this.analyser?.fftSize || 512);
    const freqData = new Uint8Array(this.analyser?.frequencyBinCount || 256);

    const levelLoop = () => {
      if (!this.analyser || this.currentStatus !== 'listening') return;

      let level = 0;
      if (typeof this.analyser.getFloatTimeDomainData === 'function') {
        this.analyser.getFloatTimeDomainData(timeData);
        level = calculateRms(timeData);
      } else {
        this.analyser.getByteFrequencyData(freqData);
        level = calculateRms(freqData);
      }

      this.options.onAudioLevel?.(level);
      this.vad.processLevel(level);

      this.animFrameId = requestAnimationFrame(levelLoop);
    };
    this.animFrameId = requestAnimationFrame(levelLoop);

    // Launch streaming session based on engine
    if (engine === 'browser') {
      try {
        this.activeSession = this.browserEngine.startSession({
          language: this.options.language,
          onInterim: (text) => this.options.onInterim?.(text),
        });
      } catch {
        this.activeSession = null;
      }
    } else if (engine === 'local') {
      // Periodic streaming passes using direct Float32Array PCM samples
      this.streamIntervalId = setInterval(async () => {
        if (this.isProcessingChunk) return;
        const pcm = this.getAccumulatedPcm();
        if (pcm.length < 4800) return; // Need at least 0.3s of 16kHz audio

        this.isProcessingChunk = true;
        try {
          const text = await this.localEngine.transcribe(pcm, this.options.language);
          if (text) {
            this.options.onInterim?.(text);
          }
        } catch (err) {
          console.warn('[yapper] interim streaming pass error:', err);
        } finally {
          this.isProcessingChunk = false;
        }
      }, 1000);
    }

    return {
      stop: () => this.stop(),
      cancel: () => this.cancel(),
    };
  }

  /** Stop recording, finalize transcription, and emit result */
  public async stop(): Promise<string> {
    if (this.currentStatus !== 'listening') return '';
    this.setStatus('transcribing');

    if (this.streamIntervalId) {
      clearInterval(this.streamIntervalId);
      this.streamIntervalId = null;
    }

    const session = this.activeSession;
    this.activeSession = null;

    // Get final raw PCM samples before teardown
    const finalPcm = this.getAccumulatedPcm();

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }

    this.cleanupAudio();

    let finalText = '';
    const engine = this.resolvedEngine;

    try {
      if (engine === 'browser' && session) {
        finalText = await session.stop();
      } else if (engine === 'local') {
        if (finalPcm.length >= 2400) {
          finalText = await this.localEngine.transcribe(finalPcm, this.options.language);
        }
      } else if (engine === 'cloud' && this.cloudEngine) {
        const wavBlob = float32ToWav(finalPcm);
        finalText = await this.cloudEngine.transcribe(wavBlob);
      }
    } catch (err: any) {
      this.setStatus('error');
      throw err;
    }

    this.setStatus('idle');
    if (finalText) {
      this.options.onFinal?.(finalText);
    }
    return finalText;
  }

  /** Cancel active recording and discard captured audio */
  public cancel(): void {
    if (this.activeSession) {
      this.activeSession.cancel();
      this.activeSession = null;
    }
    this.cleanupAudio();
    this.setStatus('idle');
  }

  private cleanupAudio(): void {
    if (this.streamIntervalId) {
      clearInterval(this.streamIntervalId);
      this.streamIntervalId = null;
    }
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.scriptProcessor) {
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.pcmChunks = [];
  }
}
