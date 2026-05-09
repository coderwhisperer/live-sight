import { useRef } from 'react';
import type { Mode } from '@/api/types';
import { cn } from '@/lib/utils';

interface ModePillProps {
  value: Mode;
  onChange: (mode: Mode) => void;
}

const MODES: Mode[] = ['navigate', 'read', 'scene', 'ask'];

export const MODE_LABELS: Record<Mode, string> = {
  navigate: 'Navigate',
  read: 'Read',
  scene: 'Scene',
  ask: 'Ask',
};

const SWIPE_THRESHOLD_PX = 50;

export function ModePill({ value, onChange }: ModePillProps) {
  // Pointer events fire for mouse + touch — works on phone AND when
  // testing with a click-and-drag on the laptop dev server.
  const startXRef = useRef<number | null>(null);

  function handlePointerDown(e: React.PointerEvent) {
    startXRef.current = e.clientX;
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (startXRef.current === null) return;
    const dx = e.clientX - startXRef.current;
    startXRef.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    // swipe left = next, swipe right = previous; wrap around the list.
    const direction = dx < 0 ? 1 : -1;
    const currentIdx = MODES.indexOf(value);
    const newIdx = (currentIdx + direction + MODES.length) % MODES.length;
    onChange(MODES[newIdx]);
  }

  function handlePointerCancel() {
    startXRef.current = null;
  }

  const currentIdx = MODES.indexOf(value);

  return (
    <div
      role="radiogroup"
      aria-label="Description mode"
      className="w-full select-none touch-pan-y"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div
        aria-live="polite"
        className="text-center text-4xl font-semibold text-white py-1 tracking-tight"
      >
        {MODE_LABELS[value]}
      </div>
      <div className="flex justify-center gap-3 py-2">
        {MODES.map((m, i) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={i === currentIdx}
            onClick={() => onChange(m)}
            className={cn(
              'h-2.5 w-2.5 rounded-full transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400',
              i === currentIdx ? 'bg-blue-500' : 'bg-slate-500 hover:bg-slate-400',
            )}
            aria-label={`${MODE_LABELS[m]} mode`}
          />
        ))}
      </div>
      <div
        aria-hidden="true"
        className="text-center text-xs text-slate-400"
      >
        swipe to change mode
      </div>
    </div>
  );
}
