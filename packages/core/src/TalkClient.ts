/**
 * @yapper/core
 * Unified TalkClient: Single entrypoint for browser, local Whisper, and cloud speech recognition.
 */

import { calculateRms, getOptimalMimeType } from './audio/audioProcessor';
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
  private audioContext: AudioContext | null = null;
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
      onSilenceDetected: () => {
        this.stop();
      },
    });

    if (this.options.onModelProgress) {
      this.localEngine.subscribeProgress(this.options.onModelProgress);
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

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);
    }

    const mimeType = getOptimalMimeType();
    this.mediaRecorder = new MediaRecorder(this.mediaStream, {
      mimeType: mimeType || undefined,
      audioBitsPerSecond: 64000,
    });

    this.audioChunks = [];
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };
    this.mediaRecorder.start(250);

    this.agreementChunker.reset();
    this.vad.reset();
    this.setStatus('listening');

    // Start audio level loop
    const levelLoop = () => {
      if (!this.analyser) return;
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      const level = calculateRms(data);
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
      // Periodic streaming passes using accumulated audio chunks
      this.streamIntervalId = setInterval(async () => {
        if (this.isProcessingChunk || this.audioChunks.length === 0) return;
        const currentBlob = new Blob(this.audioChunks, { type: mimeType });
        if (currentBlob.size < 1024) return;

        this.isProcessingChunk = true;
        try {
          const text = await this.localEngine.transcribe(currentBlob, this.options.language);
          if (text) {
            const { committed, interim } = this.agreementChunker.step(text);
            const display = [committed, interim].filter(Boolean).join(' ');
            this.options.onInterim?.(display);
          }
        } catch {
        } finally {
          this.isProcessingChunk = false;
        }
      }, 1200);
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

    let finalBlob: Blob | null = null;
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      finalBlob = await new Promise((resolve) => {
        if (!this.mediaRecorder) return resolve(null);
        this.mediaRecorder.onstop = () => {
          resolve(new Blob(this.audioChunks, { type: getOptimalMimeType() }));
        };
        this.mediaRecorder.stop();
      });
    }

    this.cleanupAudio();

    let finalText = '';
    const engine = this.resolvedEngine;

    try {
      if (engine === 'browser' && session) {
        finalText = await session.stop();
      } else if (engine === 'local' && finalBlob) {
        finalText = await this.localEngine.transcribe(finalBlob, this.options.language);
      } else if (engine === 'cloud' && this.cloudEngine && finalBlob) {
        finalText = await this.cloudEngine.transcribe(finalBlob);
      }
    } catch (err: any) {
      this.setStatus('error');
      throw err;
    }

    finalText = (finalText || this.agreementChunker.flush()).trim();
    this.setStatus('idle');
    this.options.onFinal?.(finalText);
    return finalText;
  }

  /** Cancel active recording and discard audio */
  public cancel(): void {
    if (this.streamIntervalId) {
      clearInterval(this.streamIntervalId);
      this.streamIntervalId = null;
    }
    this.activeSession?.cancel();
    this.activeSession = null;
    this.cleanupAudio();
    this.setStatus('idle');
  }

  private cleanupAudio(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
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
  }
}
