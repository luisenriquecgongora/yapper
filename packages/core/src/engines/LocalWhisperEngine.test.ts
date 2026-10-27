import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalWhisperEngine, MODEL_REGISTRY } from './LocalWhisperEngine';

describe('LocalWhisperEngine', () => {
  let mockWorker: any;
  let originalWorker: any;

  beforeEach(() => {
    originalWorker = (globalThis as any).Worker;

    mockWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };

    (globalThis as any).Worker = vi.fn().mockImplementation(() => mockWorker);
  });

  afterEach(() => {
    (globalThis as any).Worker = originalWorker;
    vi.restoreAllMocks();
  });

  it('exposes correct model properties from registry', () => {
    const tinyEngine = new LocalWhisperEngine('tiny');
    expect(tinyEngine.modelSize).toBe('tiny');
    expect(tinyEngine.modelId).toBe(MODEL_REGISTRY.tiny.id);
    expect(tinyEngine.approxMb).toBe(MODEL_REGISTRY.tiny.approxMb);

    const baseEngine = new LocalWhisperEngine('base');
    expect(baseEngine.modelSize).toBe('base');
    expect(baseEngine.modelId).toBe(MODEL_REGISTRY.base.id);
  });

  it('manages state and notifies progress subscribers', () => {
    const engine = new LocalWhisperEngine('tiny');
    const subscriber = vi.fn();
    const unsubscribe = engine.subscribeProgress(subscriber);

    expect(subscriber).toHaveBeenCalledWith(engine.getState());
    unsubscribe();
  });

  it('initializes worker and transitions state on load()', async () => {
    const engine = new LocalWhisperEngine('tiny');

    const loadPromise = engine.load(true);

    expect((globalThis as any).Worker).toHaveBeenCalledTimes(1);
    expect(mockWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'INIT',
        modelId: 'onnx-community/whisper-tiny',
      })
    );

    // Simulate progress message from worker
    const initCall = mockWorker.postMessage.mock.calls[0][0];
    mockWorker.onmessage({
      data: {
        type: 'PROGRESS',
        id: initCall.id,
        loadedBytes: 50,
        totalBytes: 100,
        progress: 0.5,
      },
    });

    expect(engine.getState().progress).toBe(0.5);

    // Simulate successful initialization
    mockWorker.onmessage({
      data: {
        type: 'INIT_RESULT',
        id: initCall.id,
        success: true,
      },
    });

    const result = await loadPromise;
    expect(result).toBe(true);
    expect(engine.getState().status).toBe('ready');
  });

  it('transcribes audio via worker and filters hallucinations', async () => {
    const engine = new LocalWhisperEngine('tiny');

    // Auto-resolve load
    const loadPromise = engine.load(false);
    const initCall = mockWorker.postMessage.mock.calls[0][0];
    mockWorker.onmessage({
      data: {
        type: 'INIT_RESULT',
        id: initCall.id,
        success: true,
      },
    });
    await loadPromise;

    // Run transcribe with 0.5s audio (8000 samples)
    const audio = new Float32Array(8000).fill(0.1);
    const transcribePromise = engine.transcribe(audio, 'english');
    await Promise.resolve(); // allow microtasks to flush

    const txCall = mockWorker.postMessage.mock.calls[1][0];
    expect(txCall.type).toBe('TRANSCRIBE_CHUNK');
    expect(txCall.language).toBe('english');

    mockWorker.onmessage({
      data: {
        type: 'TRANSCRIBE_RESULT',
        id: txCall.id,
        text: 'hello world from worker',
        latencyMs: 42,
      },
    });

    const text = await transcribePromise;
    expect(text).toBe('hello world from worker');
  });

  it('cleans up worker on remove()', async () => {
    const engine = new LocalWhisperEngine('tiny');
    await engine.remove();

    // Now trigger load to instantiate worker
    const loadPromise = engine.load(false);
    const initCall = mockWorker.postMessage.mock.calls[0][0];
    mockWorker.onmessage({
      data: { type: 'INIT_RESULT', id: initCall.id, success: true },
    });
    await loadPromise;

    await engine.remove();
    expect(mockWorker.terminate).toHaveBeenCalledTimes(1);
    expect(engine.getState().status).toBe('absent');
  });
});
