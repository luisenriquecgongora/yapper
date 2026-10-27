/**
 * @yapper/core
 * AudioWorkletProcessor: pcm-downsampler-processor
 * Real-time downsampling on the dedicated audio render thread.
 * Decimates hardware DAC rates (44.1kHz, 48kHz, 96kHz) to exact 16,000Hz mono PCM
 * with linear interpolation and zero-copy Int16 ArrayBuffer transfers.
 */

class PcmDownsamplerProcessor extends AudioWorkletProcessor {
  private targetSampleRate = 16000;
  private inputSampleRate: number;
  private resampleRatio: number;
  private bufferSize = 2048; // ~128ms chunk at 16kHz
  private pcmBuffer: Float32Array;
  private bufferIndex = 0;
  private fractionalOffset = 0;

  constructor() {
    super();
    // Global sampleRate provided by the AudioWorkletGlobalScope
    this.inputSampleRate = typeof sampleRate !== 'undefined' ? sampleRate : 48000;
    this.resampleRatio = this.inputSampleRate / this.targetSampleRate;
    this.pcmBuffer = new Float32Array(this.bufferSize);

    this.port.onmessage = (event: MessageEvent) => {
      if (event.data?.command === 'RESET') {
        this.bufferIndex = 0;
        this.fractionalOffset = 0;
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channel0 = input[0];
    if (!channel0 || channel0.length === 0) return true;

    const frameCount = channel0.length;
    let monoSamples: Float32Array;

    if (input.length === 1) {
      monoSamples = channel0;
    } else {
      monoSamples = new Float32Array(frameCount);
      const channel1 = input[1];
      for (let i = 0; i < frameCount; i++) {
        monoSamples[i] = (channel0[i] + (channel1 ? channel1[i] : 0)) * 0.5;
      }
    }

    // Band-limited linear interpolation decimation
    let inIdx = this.fractionalOffset;
    while (inIdx < frameCount) {
      const idxFloor = Math.floor(inIdx);
      const idxCeil = Math.min(frameCount - 1, idxFloor + 1);
      const fraction = inIdx - idxFloor;

      const sample = monoSamples[idxFloor] * (1 - fraction) + monoSamples[idxCeil] * fraction;
      this.pcmBuffer[this.bufferIndex++] = sample;

      if (this.bufferIndex >= this.bufferSize) {
        // Build 16-bit PCM buffer
        const int16 = new Int16Array(this.bufferSize);
        for (let j = 0; j < this.bufferSize; j++) {
          const s = Math.max(-1, Math.min(1, this.pcmBuffer[j]));
          int16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        const floatCopy = new Float32Array(this.pcmBuffer);

        // Zero-copy transfer of int16 buffer
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

registerProcessor('pcm-downsampler-processor', PcmDownsamplerProcessor);
