import { describe, it, expect, vi } from 'vitest';
import { EnergyVad } from './energyVad';

describe('EnergyVad', () => {
  it('detects speech when level crosses threshold', () => {
    const onSpeechStart = vi.fn();
    const vad = new EnergyVad({ speechThreshold: 0.05, onSpeechStart });

    expect(vad.speaking).toBe(false);

    // Below threshold
    vad.processLevel(0.02);
    expect(vad.speaking).toBe(false);
    expect(onSpeechStart).not.toHaveBeenCalled();

    // Above threshold
    vad.processLevel(0.1);
    expect(vad.speaking).toBe(true);
    expect(onSpeechStart).toHaveBeenCalledOnce();
  });

  it('triggers silence detection after silenceDurationMs elapses', () => {
    vi.useFakeTimers();
    const onSilenceDetected = vi.fn();
    const vad = new EnergyVad({
      speechThreshold: 0.05,
      silenceDurationMs: 1000,
      onSilenceDetected,
    });

    // Start speaking
    vad.processLevel(0.1);
    expect(vad.speaking).toBe(true);

    // Advance time during silence
    vi.advanceTimersByTime(500);
    vad.processLevel(0.01);
    expect(vad.speaking).toBe(true);
    expect(onSilenceDetected).not.toHaveBeenCalled();

    // Cross the 1000ms silence threshold
    vi.advanceTimersByTime(600);
    vad.processLevel(0.01);
    expect(vad.speaking).toBe(false);
    expect(onSilenceDetected).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  it('resets speech state', () => {
    const vad = new EnergyVad({ speechThreshold: 0.05 });
    vad.processLevel(0.2);
    expect(vad.speaking).toBe(true);

    vad.reset();
    expect(vad.speaking).toBe(false);
  });
});
