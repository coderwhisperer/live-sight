import { useCallback } from 'react';

export interface UseTTSResult {
  speak: (text: string) => void;
  cancel: () => void;
  supported: boolean;
}

export function useTTS(): UseTTSResult {
  const supported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.0;
      utter.pitch = 1.0;
      window.speechSynthesis.speak(utter);
    },
    [supported],
  );

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return { speak, cancel, supported };
}
