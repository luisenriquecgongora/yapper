/**
 * @yapper/core
 * Browser Speech Recognition Engine (Web Speech API).
 * Zero-download, zero-RAM, instant speech recognition served natively by the browser.
 * Enhanced with auto-restart supervisor loop, cross-session transcript accumulation,
 * and comprehensive error telemetry.
 */

import { logger } from '../logger';

export const BROWSER_LANG_MAP: Record<string, string> = {
  english: 'en-US',
  en: 'en-US',
  spanish: 'es-ES',
  es: 'es-ES',
  polish: 'pl-PL',
  pl: 'pl-PL',
  german: 'de-DE',
  de: 'de-DE',
  french: 'fr-FR',
  fr: 'fr-FR',
  italian: 'it-IT',
  it: 'it-IT',
  ukrainian: 'uk-UA',
  uk: 'uk-UA',
  russian: 'ru-RU',
  ru: 'ru-RU',
  korean: 'ko-KR',
  ko: 'ko-KR',
  chinese: 'zh-CN',
  zh: 'zh-CN',
  japanese: 'ja-JP',
  ja: 'ja-JP',
  portuguese: 'pt-BR',
  pt: 'pt-BR',
};

export interface BrowserSessionOptions {
  language?: string;
  onInterim?: (text: string) => void;
}

export class BrowserSpeechEngine {
  public static isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    // Electron apps typically expose the constructor but Google refuses requests without a Chrome key
    if ((window as any).takiDesktop?.isDesktop || /Electron\//.test(navigator?.userAgent || '')) {
      return false;
    }
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  public startSession({ language = 'en', onInterim }: BrowserSessionOptions) {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      logger.error('stt', 'Web Speech API is not supported in this browser environment.');
      throw new Error('Web Speech API is not supported in this browser environment.');
    }

    const resolvedLang = BROWSER_LANG_MAP[language?.toLowerCase()] || language || 'en-US';
    logger.info('stt', `Initializing Web Speech Recognition in ${resolvedLang}...`);

    let shouldRun = true;
    let cancelled = false;
    let ended = false;
    let resolveEnd: (() => void) | null = null;
    let error: string | null = null;

    // Accumulators across continuous auto-restart segments
    let accumulatedFinals: string[] = [];
    let sessionFinals: string[] = [];
    let currentInterim: string = '';

    const getFullTranscript = () => {
      const parts = [...accumulatedFinals, ...sessionFinals, currentInterim].filter(Boolean);
      return parts.join(' ').replace(/\s+/g, ' ').trim();
    };

    let recognition: any;

    const setupRecognition = () => {
      try {
        recognition = new Recognition();
        recognition.lang = resolvedLang;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          logger.info('stt', 'Native Web Speech transducer is active and listening to vocal chords.');
        };

        recognition.onresult = (event: any) => {
          currentInterim = '';
          const newFinals: string[] = [];

          for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i];
            const transcript = result[0]?.transcript?.trim() || '';
            if (result.isFinal) {
              if (transcript) newFinals.push(transcript);
            } else {
              currentInterim += (currentInterim ? ' ' : '') + transcript;
            }
          }

          if (newFinals.length > 0) {
            sessionFinals = newFinals;
          }

          const full = getFullTranscript();
          if (!cancelled && full) {
            onInterim?.(full);
          }
        };

        recognition.onerror = (event: any) => {
          const err = event.error;
          if (err === 'no-speech') {
            logger.debug('stt', 'Native speech: brief silence window (no-speech).');
            return;
          }
          if (err === 'aborted') {
            logger.debug('stt', 'Native speech recognition pass aborted.');
            return;
          }

          logger.warn('stt', `Native speech recognition notice: ${err}`);
          error = err;

          if (err === 'not-allowed') {
            logger.error('stt', 'Microphone access denied or speech recognition service blocked by browser.');
            shouldRun = false;
          } else if (err === 'network') {
            logger.error('stt', 'Network error connecting to native speech recognition service.');
          }
        };

        recognition.onend = () => {
          // Flush current session finals into accumulated past finals before restarting
          if (sessionFinals.length > 0) {
            accumulatedFinals.push(...sessionFinals);
            sessionFinals = [];
          }

          if (shouldRun && !cancelled) {
            // Auto-restart loop to prevent Chrome from prematurely killing continuous recognition
            logger.debug('stt', 'Native speech cycle ended. Auto-refreshing session watchdog...');
            try {
              recognition.start();
            } catch {
              // Throttled restart
              setTimeout(() => {
                if (shouldRun && !cancelled) {
                  try {
                    recognition.start();
                  } catch {}
                }
              }, 150);
            }
          } else {
            ended = true;
            resolveEnd?.();
          }
        };

        recognition.start();
      } catch (err: any) {
        logger.error('stt', `Failed to start Web Speech Recognition: ${err?.message || err}`);
        throw err;
      }
    };

    setupRecognition();

    return {
      stop: (): Promise<string> => {
        shouldRun = false;
        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            const final = getFullTranscript();
            resolve(final);
          }, 1500);

          const finish = () => {
            clearTimeout(timeout);
            const final = getFullTranscript();
            resolve(final);
          };

          if (ended) {
            finish();
            return;
          }

          resolveEnd = finish;
          try {
            recognition.stop();
          } catch {
            finish();
          }
        });
      },

      cancel: () => {
        shouldRun = false;
        cancelled = true;
        try {
          recognition.abort();
        } catch {}
      },
    };
  }
}
