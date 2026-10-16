/**
 * @yapper/core
 * Cloud Speech Engine.
 * Sends recorded audio to a cloud endpoint (OpenAI, Groq, PlaatoOS, or self-hosted Faster-Whisper).
 */

export interface CloudEngineOptions {
  endpoint: string;
  headers?: Record<string, string>;
  language?: string;
}

export class CloudStreamEngine {
  private endpoint: string;
  private headers: Record<string, string>;
  private language: string;

  constructor(options: CloudEngineOptions) {
    this.endpoint = options.endpoint;
    this.headers = options.headers || {};
    this.language = options.language || 'en';
  }

  public async transcribe(blob: Blob): Promise<string> {
    const formData = new FormData();
    const ext = blob.type.includes('webm')
      ? 'webm'
      : blob.type.includes('ogg')
      ? 'ogg'
      : blob.type.includes('wav')
      ? 'wav'
      : 'webm';

    formData.append('file', blob, `audio.${ext}`);
    formData.append('language', this.language);

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        ...this.headers,
      },
      body: formData,
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.message || `Cloud transcription failed with status ${response.status}`);
    }

    const data = await response.json();
    return (data.text || '').trim();
  }
}
