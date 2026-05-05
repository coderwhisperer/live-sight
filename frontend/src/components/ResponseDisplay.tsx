import { useEffect } from 'react';
import { useTTS } from '@/hooks/useTTS';

interface ResponseDisplayProps {
  description: string | null;
  latencyMs: number | null;
  errorMessage: string | null;
}

export function ResponseDisplay({
  description,
  latencyMs,
  errorMessage,
}: ResponseDisplayProps) {
  const { speak } = useTTS();

  useEffect(() => {
    if (description) speak(description);
  }, [description, speak]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="min-h-32 w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5 text-lg leading-relaxed text-slate-900 shadow-sm"
    >
      {errorMessage ? (
        <p className="text-red-700">{errorMessage}</p>
      ) : description ? (
        <>
          <p>{description}</p>
          {latencyMs !== null && (
            <p className="mt-3 text-sm text-slate-500">{latencyMs} ms</p>
          )}
        </>
      ) : (
        <p className="text-slate-500">Tap the button to describe what you see.</p>
      )}
    </div>
  );
}
