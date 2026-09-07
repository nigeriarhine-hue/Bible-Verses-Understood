import { useCallback, useEffect, useRef, useState } from 'react';
import { trackEvent } from '../lib/analytics';

/**
 * Text-to-speech for Scripture and explanations, using the browser's own
 * speech synthesis. Nothing plays until the reader asks for it.
 */
export function useSpeech() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const currentId = useRef<string | null>(null);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const stop = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    currentId.current = null;
    setSpeakingId(null);
  }, []);

  const speak = useCallback(
    (id: string, text: string, kind: 'scripture' | 'explanation' | 'devotional' = 'scripture') => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

      if (currentId.current === id) {
        stop();
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.slice(0, 30_000));
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.lang = 'en-US';
      utterance.onend = () => {
        if (currentId.current === id) {
          currentId.current = null;
          setSpeakingId(null);
        }
      };
      utterance.onerror = () => {
        currentId.current = null;
        setSpeakingId(null);
      };

      currentId.current = id;
      setSpeakingId(id);
      window.speechSynthesis.speak(utterance);
      trackEvent('audio_play', { kind });
    },
    [stop],
  );

  return { speak, stop, speakingId, supported };
}
