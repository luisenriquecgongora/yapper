import { describe, it, expect } from 'vitest';
import {
  downsampleTo16k,
  calculateRms,
  float32ToWav,
  getOptimalMimeType,
  TARGET_SAMPLE_RATE,
} from './audioProcessor';

describe('audioProcessor', () => {
  describe('downsampleTo16k', () => {
    it('returns empty array when input is empty', () => {
      const empty = new Float32Array(0);
      expect(downsampleTo16k(empty, 48000).length).toBe(0);
    });

    it('returns the same array if already at target 16kHz', () => {
      const input = new Float32Array([0.1, 0.2, 0.3]);
      const output = downsampleTo16k(input, TARGET_SAMPLE_RATE);
      expect(output).toBe(input);
    });

    it('returns input if sample rate is below 16kHz', () => {
      const input = new Float32Array([0.1, 0.2, 0.3]);
      const output = downsampleTo16k(input, 8000);
      expect(output).toBe(input);
    });

    it('correctly reduces sample count from 48kHz to 16kHz', () => {
      // 48,000 samples at 48kHz is exactly 1 second, which should downsample to 16,000 samples
      const input48k = new Float32Array(48000).fill(0.5);
      const result = downsampleTo16k(input48k, 48000);

      expect(result.length).toBe(16000);
      expect(result[0]).toBeCloseTo(0.5, 4);
    });

    it('handles 44.1kHz standard DAC rate', () => {
      const input44k = new Float32Array(44100).fill(0.25);
      const result = downsampleTo16k(input44k, 44100);

      expect(result.length).toBe(16000);
      expect(result[0]).toBeCloseTo(0.25, 4);
    });
  });

  describe('calculateRms', () => {
    it('returns 0 for empty samples', () => {
      expect(calculateRms(new Float32Array(0))).toBe(0);
      expect(calculateRms(new Uint8Array(0))).toBe(0);
    });

    it('returns 0 for silence (all zeros)', () => {
      const silence = new Float32Array(512);
      expect(calculateRms(silence)).toBe(0);
    });

    it('computes positive amplified RMS for Float32Array signal', () => {
      const signal = new Float32Array(512).fill(0.2);
      const rms = calculateRms(signal);
      expect(rms).toBeGreaterThan(0);
      expect(rms).toBeLessThanOrEqual(1.0);
    });

    it('clamps RMS output to maximum 1.0 on loud signal', () => {
      const loudSignal = new Float32Array(512).fill(0.9);
      expect(calculateRms(loudSignal)).toBe(1.0);
    });

    it('computes RMS for Uint8Array frequency data', () => {
      const freqData = new Uint8Array(256).fill(128);
      const rms = calculateRms(freqData);
      expect(rms).toBeGreaterThan(0);
      expect(rms).toBeLessThanOrEqual(1.0);
    });
  });

  describe('float32ToWav', () => {
    it('creates a valid 16-bit PCM WAV Blob with 44-byte header', () => {
      const samples = new Float32Array(16000); // 1 second of audio
      const wavBlob = float32ToWav(samples, 16000);

      expect(wavBlob).toBeDefined();
      expect(wavBlob.type).toBe('audio/wav');
      // 44-byte RIFF/WAVE header + (16000 samples * 2 bytes per 16-bit sample)
      expect(wavBlob.size).toBe(44 + 16000 * 2);
    });
  });

  describe('getOptimalMimeType', () => {
    it('returns empty string gracefully when MediaRecorder is undefined', () => {
      expect(getOptimalMimeType()).toBe('');
    });
  });
});
