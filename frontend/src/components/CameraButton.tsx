import { cn } from '@/lib/utils';

interface CameraButtonProps {
  onTap: () => void;
  disabled?: boolean;
  inFlight?: boolean;
}

export function CameraButton({ onTap, disabled, inFlight }: CameraButtonProps) {
  const isDisabled = disabled || inFlight;
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={isDisabled}
      aria-label="Capture and describe"
      aria-busy={inFlight ? 'true' : 'false'}
      className={cn(
        'flex h-44 w-44 items-center justify-center rounded-full',
        'bg-blue-600 text-white text-xl font-semibold shadow-lg',
        'transition-transform active:scale-95',
        'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-300',
        'disabled:opacity-60',
        inFlight && 'animate-pulse',
      )}
    >
      {inFlight ? 'Looking…' : 'Tap to see'}
    </button>
  );
}
