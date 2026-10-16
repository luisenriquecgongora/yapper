/**
 * @yapper/react
 * Unified React hook for real-time speech-to-text.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LocalModelDownloadProgress,
  TalkClient,
  TalkClientOptions,
  TalkStatus,
  VoiceEngine,
} from '@yapper/core';

export interface UseTalkOptions extends TalkClientOptions {
  /** Automatically request mic permission when initialized */
  autoInit?: boolean;
}

export function useTalk(options: UseTalkOptions = {}) {
  const [status, setStatus] = useState<TalkStatus>('idle');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [interimText, setInterimText] = useState<string>('');
  const [finalText, setFinalText] = useState<string>('');
  const [modelProgress, setModelProgress] = useState<LocalModelDownloadProgress>({
    status: 'absent',
    progress: 0,
    loadedBytes: 0,
    totalBytes: 0,
  });

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const clientRef = useRef<TalkClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = new TalkClient({
      ...options,
      onStatusChange: (s) => {
        setStatus(s);
        optionsRef.current.onStatusChange?.(s);
      },
      onAudioLevel: (l) => {
        setAudioLevel(l);
        optionsRef.current.onAudioLevel?.(l);
      },
      onInterim: (text) => {
        setInterimText(text);
        optionsRef.current.onInterim?.(text);
      },
      onFinal: (text) => {
        setFinalText(text);
        setInterimText('');
        optionsRef.current.onFinal?.(text);
      },
      onModelProgress: (p) => {
        setModelProgress(p);
        optionsRef.current.onModelProgress?.(p);
      },
    });
  }

  const client = clientRef.current;

  // Keep dynamic configuration synchronized
  useEffect(() => {
    client.updateOptions({
      modelSize: options.modelSize,
      language: options.language,
      preferredEngine: options.preferredEngine,
      cloudEndpoint: options.cloudEndpoint,
      cloudHeaders: options.cloudHeaders,
    });
  }, [
    client,
    options.modelSize,
    options.language,
    options.preferredEngine,
    options.cloudEndpoint,
    options.cloudHeaders,
  ]);

  const start = useCallback(async () => {
    setInterimText('');
    return client.start();
  }, [client]);

  const stop = useCallback(async () => {
    return client.stop();
  }, [client]);

  const cancel = useCallback(() => {
    client.cancel();
    setInterimText('');
  }, [client]);

  const downloadModel = useCallback(async () => {
    return client.local.load(true);
  }, [client]);

  const removeModel = useCallback(async () => {
    return client.local.remove();
  }, [client]);

  useEffect(() => {
    return () => {
      client.cancel();
    };
  }, [client]);

  return {
    status,
    isListening: status === 'listening',
    isTranscribing: status === 'transcribing',
    engine: client.resolvedEngine,
    audioLevel,
    interimText,
    finalText,
    modelProgress,
    start,
    stop,
    cancel,
    downloadModel,
    removeModel,
  };
}

export type UseTalkReturn = ReturnType<typeof useTalk>;
export type UseYapperReturn = UseTalkReturn;
export type UseYapperOptions = UseTalkOptions;
export const useYapper = useTalk;
export const useYap = useTalk;
