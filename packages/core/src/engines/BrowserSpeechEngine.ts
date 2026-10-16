/**
 * @yapper/core
 * Browser Speech Recognition Engine (Web Speech API).
 * Zero-download, zero-RAM, instant speech recognition served natively by the browser.
 */

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
      throw new Error('Web Speech API is not supported in this browser environment.');
    }

    const recognition = new Recognition();
    recognition.lang = BROWSER_LANG_MAP[language] || language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    const finals: string[] = [];
    let interim = '';
    let ended = false;
    let cancelled = false;
    let resolveEnd: (() => void) | null = null;
    let error: string | null = null;

    const getFullTranscript = () =>
      [...finals, interim].join(' ').replace(/\s+/g, ' ').trim();

    recognition.onresult = (event: any) => {
      interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        if (item.isFinal) finals[i] = item[0].transcript;
        else interim += item[0].transcript;
      }
      if (!cancelled) onInterim?.(getFullTranscript());
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        error = event.error;
      }
    };

    recognition.onend = () => {
      ended = true;
      resolveEnd?.();
    };

    recognition.start();

    return {
      stop: (): Promise<string> =>
        new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            if (error && !getFullTranscript()) reject(new Error(error));
            else resolve(getFullTranscript());
          }, 3500);

          const finish = () => {
            clearTimeout(timeout);
            if (error && !getFullTranscript()) reject(new Error(error));
            else resolve(getFullTranscript());
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
        }),

      cancel: () => {
        cancelled = true;
        try {
          recognition.abort();
        } catch {}
      },
    };
  }
}
