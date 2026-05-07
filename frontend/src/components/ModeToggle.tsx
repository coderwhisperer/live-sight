import type { Mode } from '@/api/types';
import { cn } from '@/lib/utils';

interface ModeToggleProps {
  value: Mode;
  onChange: (mode: Mode) => void;
}

const MODES: { value: Mode; label: string }[] = [
  { value: 'navigate', label: 'Navigate' },
  { value: 'read', label: 'Read' },
  { value: 'scene', label: 'Scene' },
  { value: 'ask', label: 'Ask' },
];

export function ModeToggle({ value, onChange }: ModeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Description mode"
      className="flex gap-2"
    >
      {MODES.map((mode) => {
        const selected = value === mode.value;
        return (
          <button
            key={mode.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(mode.value)}
            className={cn(
              'rounded-md border-2 px-4 py-2 text-base font-medium',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
              selected
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-transparent text-blue-700 border-blue-600 hover:bg-blue-50',
            )}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
