import { useEffect } from 'react';
import { useTTS } from '@/hooks/useTTS';

interface ResponseDisplayProps {
  description: string | null;
  latencyMs: number | null;
  errorMessage: string | null;
  question?: string | null;
}

export function ResponseDisplay({
  description,
  latencyMs,
  errorMessage,
  question,
}: ResponseDisplayProps) {
  const { speak } = useTTS();

  useEffect(() => {
    // Speak only the answer — not the user's own question read back.
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
          {question && (
            <p className="mb-2 text-base text-slate-600">
              <span className="font-semibold text-slate-700">Q:</span> {question}
            </p>
          )}
          <p>
            {question && (
              <span className="font-semibold text-slate-700">A: </span>
            )}
            {description}
          </p>
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
