/**
 * @yapper/core
 * Audio processing utilities: AudioWorklet registration, 16 kHz mono downsampling,
 * safe blob decoding, and audio level metering.
 */

export const TARGET_SAMPLE_RATE = 16000;
export const PCM_DOWNSAMPLER_WORKLET_NAME = 'pcm-downsampler-processor';

/**
 * Raw AudioWorkletProcessor script string for inline Blob URL registration.
 * Eliminates bundler asset resolution errors in Next.js, Vite, Webpack, and Rollup.
 */
export const PCM_DOWNSAMPLER_WORKLET_CODE = `
class PcmDownsamplerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.inputSampleRate = typeof sampleRate !== 'undefined' ? sampleRate : 48000;
    this.resampleRatio = this.inputSampleRate / this.targetSampleRate;
    this.bufferSize = 2048;
    this.pcmBuffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.fractionalOffset = 0;

    this.port.onmessage = (event) => {
      if (event.data?.command === 'RESET') {
        this.bufferIndex = 0;
        this.fractionalOffset = 0;
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channel0 = input[0];
    if (!channel0 || channel0.length === 0) return true;

    const frameCount = channel0.length;
    let monoSamples;

    if (input.length === 1) {
      monoSamples = channel0;
    } else {
      monoSamples = new Float32Array(frameCount);
      const channel1 = input[1];
      for (let i = 0; i < frameCount; i++) {
        monoSamples[i] = (channel0[i] + (channel1 ? channel1[i] : 0)) * 0.5;
      }
    }

    let inIdx = this.fractionalOffset;
    while (inIdx < frameCount) {
      const idxFloor = Math.floor(inIdx);
      const idxCeil = Math.min(frameCount - 1, idxFloor + 1);
      const fraction = inIdx - idxFloor;

      const sample = monoSamples[idxFloor] * (1 - fraction) + monoSamples[idxCeil] * fraction;
      this.pcmBuffer[this.bufferIndex++] = sample;

      if (this.bufferIndex >= this.bufferSize) {
        const int16 = new Int16Array(this.bufferSize);
        for (let j = 0; j < this.bufferSize; j++) {
          const s = Math.max(-1, Math.min(1, this.pcmBuffer[j]));
          int16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        const floatCopy = new Float32Array(this.pcmBuffer);
        this.port.postMessage(
          {
            type: 'PCM_DATA',
            float32: floatCopy,
            int16: int16.buffer,
          },
          [int16.buffer]
        );

        this.bufferIndex = 0;
      }

      inIdx += this.resampleRatio;
    }

    this.fractionalOffset = inIdx - frameCount;
    return true;
  }
}

registerProcessor('${PCM_DOWNSAMPLER_WORKLET_NAME}', PcmDownsamplerProcessor);
`;

const registeredWorkletContexts = new WeakSet<AudioContext>();

/**
 * Register the PCM downsampler AudioWorklet with the provided AudioContext.
 * Uses an inline Blob URL so no asset bundling or static file copying is required.
 */
export async function registerPcmWorklet(audioContext: AudioContext): Promise<void> {
  if (!audioContext || !audioContext.audioWorklet) {
    throw new Error('AudioWorklet is not supported in this browser or audio context environment.');
  }

  if (registeredWorkletContexts.has(audioContext)) {
    return;
  }

  const blob = new Blob([PCM_DOWNSAMPLER_WORKLET_CODE], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);

  try {
    await audioContext.audioWorklet.addModule(blobUrl);
    registeredWorkletContexts.add(audioContext);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/** Downsample Float32Array audio from any native sample rate to 16 kHz mono PCM */
export function downsampleTo16k(input: Float32Array, inputSampleRate: number): Float32Array {
  if (!input || input.length === 0) return new Float32Array(0);
  if (inputSampleRate === TARGET_SAMPLE_RATE) return input;
  if (inputSampleRate < TARGET_SAMPLE_RATE) return input;

  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetInput = 0;

  while (offsetResult < result.length) {
    const nextOffsetInput = Math.round((offsetResult + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let i = offsetInput; i < nextOffsetInput && i < input.length; i++) {
      sum += input[i];
      count++;
    }
    result[offsetResult] = count > 0 ? sum / count : input[offsetInput] || 0;
    offsetResult++;
    offsetInput = nextOffsetInput;
  }

  return result;
}

/** Decode any audio blob into 16 kHz single-channel Float32Array PCM */
export async function decodeTo16kMono(blob: Blob): Promise<Float32Array> {
  const buffer = await blob.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) return new Float32Array(0);

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return new Float32Array(0);

  let ctx: AudioContext;
  try {
    ctx = new AudioCtx({ sampleRate: TARGET_SAMPLE_RATE });
  } catch {
    ctx = new AudioCtx();
  }

  try {
    const audio = await ctx.decodeAudioData(buffer);
    let mono: Float32Array;
    if (audio.numberOfChannels === 1) {
      mono = audio.getChannelData(0);
    } else {
      const left = audio.getChannelData(0);
      const right = audio.getChannelData(1);
      mono = new Float32Array(left.length);
      for (let i = 0; i < left.length; i++) {
        mono[i] = (left[i] + right[i]) / 2;
      }
    }
    return downsampleTo16k(mono, audio.sampleRate);
  } catch (err) {
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
    // Time domain PCM samples (-1.0 to 1.0, 0 is silence)
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / samples.length);
    // Human voice RMS sits around 0.008 to 0.08. Amplify to cover 0.0 - 1.0 smoothly.
    return Math.min(1, Math.max(0, rms * 8.0));
  } else {
    // Frequency data bins from 0 to 255 (0 = silence, 255 = maximum magnitude)
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / samples.length) / 255;
    return Math.min(1, Math.max(0, rms * 5.0));
  }
}

/** Convert raw Float32Array PCM samples into a standard 16-bit 16kHz WAV Blob */
export function float32ToWav(samples: Float32Array, sampleRate = 16000): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // 16 bits
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
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
