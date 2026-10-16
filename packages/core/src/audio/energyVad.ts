/**
 * @yapper/core
 * Energy-based Voice Activity Detection (VAD).
 * Continuously tracks speech energy to trigger hands-free auto-stop on silence.
 */

export interface VadOptions {
  /** Minimum RMS energy to qualify as human speech (default: 0.05) */
  speechThreshold?: number;
  /** Silence duration in milliseconds required to trigger silence callback (default: 1800ms) */
  silenceDurationMs?: number;
  /** Callback fired when user is speaking */
  onSpeechStart?: () => void;
  /** Callback fired when prolonged silence is detected */
  onSilenceDetected?: () => void;
  /** Progress toward silence trigger (0.0 to 1.0) */
  onSilenceProgress?: (progress: number) => void;
}

export class EnergyVad {
  private speechThreshold: number;
  private silenceDurationMs: number;
  private onSpeechStart?: () => void;
  private onSilenceDetected?: () => void;
  private onSilenceProgress?: (progress: number) => void;

  private isSpeaking: boolean = false;
  private lastSpeechTimestamp: number = 0;
  private checkIntervalTimer: any = null;

  constructor(options: VadOptions = {}) {
    this.speechThreshold = options.speechThreshold ?? 0.05;
    this.silenceDurationMs = options.silenceDurationMs ?? 1800;
    this.onSpeechStart = options.onSpeechStart;
    this.onSilenceDetected = options.onSilenceDetected;
    this.onSilenceProgress = options.onSilenceProgress;
  }

  /** Feed current audio level (0.0 to 1.0) into the VAD detector */
  public processLevel(level: number): void {
    const now = Date.now();
    if (level >= this.speechThreshold) {
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.onSpeechStart?.();
      }
      this.lastSpeechTimestamp = now;
      this.onSilenceProgress?.(0);
    } else if (this.isSpeaking) {
      const elapsed = now - this.lastSpeechTimestamp;
      const progress = Math.min(1, elapsed / this.silenceDurationMs);
      this.onSilenceProgress?.(progress);

      if (elapsed >= this.silenceDurationMs) {
        this.isSpeaking = false;
        this.onSilenceProgress?.(1);
        this.onSilenceDetected?.();
      }
    }
  }

  public get speaking(): boolean {
    return this.isSpeaking;
  }

  public reset(): void {
    this.isSpeaking = false;
    this.lastSpeechTimestamp = 0;
    this.onSilenceProgress?.(0);
  }
}
