/**
 * @yapper/core
 * Audio processing utilities: 16 kHz mono downsampling, safe blob decoding,
 * and audio level metering.
 */

export const TARGET_SAMPLE_RATE = 16000;

/** Decode any audio blob into 16 kHz single-channel Float32Array PCM */
export async function decodeTo16kMono(blob: Blob): Promise<Float32Array> {
  const buffer = await blob.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) return new Float32Array(0);

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return new Float32Array(0);

  const ctx = new AudioCtx({ sampleRate: TARGET_SAMPLE_RATE });
  try {
    const audio = await ctx.decodeAudioData(buffer);
    if (audio.numberOfChannels === 1) {
      return audio.getChannelData(0);
    }
    const left = audio.getChannelData(0);
    const right = audio.getChannelData(1);
    const mono = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) {
      mono[i] = (left[i] + right[i]) / 2;
    }
    return mono;
  } catch {
    // Non-fatal: if a partial audio chunk cannot be decoded, return empty
    return new Float32Array(0);
  } finally {
    ctx.close().catch(() => {});
  }
}

/** Calculate Root-Mean-Square (RMS) volume level between 0.0 and 1.0 */
export function calculateRms(samples: Float32Array | Uint8Array): number {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  if (samples instanceof Float32Array) {
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.min(1, Math.sqrt(sum / samples.length) * 2.5);
  } else {
    for (let i = 0; i < samples.length; i++) {
      const normalized = (samples[i] - 128) / 128;
      sum += normalized * normalized;
    }
    return Math.min(1, Math.sqrt(sum / samples.length) * 2.0);
  }
}

/** Detect optimal audio mime type supported by the client browser */
export function getOptimalMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/wav',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}
