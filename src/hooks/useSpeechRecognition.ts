import { useState, useRef, useCallback } from 'react';

export type RecStatus = 'idle' | 'recording' | 'error';

export interface UseSpeechReturn {
  status: RecStatus;
  interimText: string;
  start: (onResult: (text: string) => void) => void;
  stop: () => void;
  supported: boolean;
}

/** Minimal subset of the Web Speech API we actually use */
interface SpeechRec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
}

type SpeechRecCtor = new () => SpeechRec;

function getSpeechRecognition(): SpeechRecCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as Record<string, unknown>;
  return (w['SpeechRecognition'] ?? w['webkitSpeechRecognition']) as SpeechRecCtor | undefined;
}

export function useSpeechRecognition(lang = 'ru-RU'): UseSpeechReturn {
  const [status, setStatus] = useState<RecStatus>('idle');
  const [interimText, setInterimText] = useState('');
  const recRef = useRef<SpeechRec | null>(null);
  const SR = getSpeechRecognition();

  const start = useCallback(
    (onResult: (text: string) => void) => {
      const Ctor = getSpeechRecognition();
      if (!Ctor) return;
      try { recRef.current?.stop(); } catch { /* noop */ }

      const rec = new Ctor();
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      recRef.current = rec;

      let final = '';

      rec.onstart = () => setStatus('recording');

      rec.onresult = (e: SpeechRecognitionEvent) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            final += e.results[i][0].transcript;
          } else {
            interim += e.results[i][0].transcript;
          }
        }
        setInterimText(final + interim);
      };

      rec.onend = () => {
        setStatus('idle');
        setInterimText('');
        onResult(final.trim());
      };

      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        setStatus(e.error !== 'no-speech' ? 'error' : 'idle');
        setInterimText('');
        onResult(final.trim());
      };

      try {
        rec.start();
      } catch {
        setStatus('error');
      }
    },
    [lang]
  );

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
  }, []);

  return { status, interimText, start, stop, supported: !!SR };
}
