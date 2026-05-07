import type { Mode } from '@/api/types';
import { cn } from '@/lib/utils';

export type CapturePhase =
  | 'idle'
  | 'capturing' // single-tap modes: photo + describe in flight
  | 'recording' // ask mode: holding mic, recording audio
  | 'transcribing' // ask mode: audio uploaded, awaiting transcript
  | 'querying'; // ask mode: image + transcript posted to /query

interface CameraButtonProps {
  mode: Mode;
  phase: CapturePhase;
  disabled?: boolean;
  onTap?: () => void;
  onPressStart?: () => void;
  onPressEnd?: () => void;
}

const NON_ASK_LABEL: Record<Exclude<CapturePhase, 'recording'>, string> = {
  idle: 'Tap to see',
  capturing: 'Looking…',
  transcribing: 'Looking…',
  querying: 'Looking…',
};

const ASK_LABEL: Record<CapturePhase, string> = {
  idle: '🎤 Hold to ask',
  recording: '🔴 Listening…',
  transcribing: 'Transcribing…',
  querying: 'Thinking…',
  capturing: 'Thinking…',
};

export function CameraButton({
  mode,
  phase,
  disabled,
  onTap,
  onPressStart,
  onPressEnd,
}: CameraButtonProps) {
  const isAsk = mode === 'ask';
  const recording = phase === 'recording';
  const busy = phase !== 'idle';
  const isDisabled = disabled || (busy && !recording);

  const label = isAsk
    ? ASK_LABEL[phase]
    : NON_ASK_LABEL[phase === 'recording' ? 'idle' : phase];

  return (
    <button
      type="button"
      onClick={isAsk ? undefined : onTap}
      onPointerDown={isAsk ? onPressStart : undefined}
      onPointerUp={isAsk ? onPressEnd : undefined}
      onPointerLeave={isAsk ? onPressEnd : undefined}
      disabled={isDisabled}
      aria-label={isAsk ? 'Hold to ask a question' : 'Capture and describe'}
      aria-busy={busy ? 'true' : 'false'}
      aria-pressed={recording}
      className={cn(
        'flex h-44 w-44 items-center justify-center rounded-full',
        'text-white text-xl font-semibold shadow-lg select-none',
        'transition-transform active:scale-95',
        'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-300',
        'disabled:opacity-60',
        recording
          ? 'bg-red-600 animate-pulse'
          : busy
            ? 'bg-blue-600 animate-pulse'
            : 'bg-blue-600',
      )}
    >
      {label}
    </button>
  );
}
