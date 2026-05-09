import { useEffect, useRef } from 'react';
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

const LONG_PRESS_MS = 400;

// Primary action when idle (drives the big inside-circle label).
const PRIMARY_IDLE_LABEL: Record<Mode, string> = {
  navigate: 'Tap to navigate',
  read: 'Tap to read',
  scene: 'Tap to describe',
  ask: '🎤 Hold to ask',
};

// Secondary hint below the circle when idle. Reminds the user the OTHER
// gesture is also available.
const SECONDARY_IDLE_LABEL: Record<Mode, string> = {
  navigate: 'Hold to ask a question',
  read: 'Hold to ask a question',
  scene: 'Hold to ask a question',
  ask: 'Tap to describe scene',
};

const PHASE_LABEL: Record<Exclude<CapturePhase, 'idle'>, string> = {
  capturing: 'Looking…',
  recording: '🔴 Listening…',
  transcribing: 'Transcribing…',
  querying: 'Thinking…',
};

export function CameraButton({
  mode,
  phase,
  disabled,
  onTap,
  onPressStart,
  onPressEnd,
}: CameraButtonProps) {
  // Long-press detection: pointerdown starts a 400ms timer; if pointerup
  // fires before the timer, it's a tap → onTap. If the timer fires first,
  // we set isLongPress=true and call onPressStart; pointerup then calls
  // onPressEnd.
  const longPressTimerRef = useRef<number | null>(null);
  const isLongPressRef = useRef(false);

  // Cancel a pending timer on unmount so we don't fire onPressStart on a
  // dead component.
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const recording = phase === 'recording';
  const busy = phase !== 'idle';
  const isDisabled = disabled || (busy && !recording);

  function handlePointerDown() {
    if (isDisabled) return;
    isLongPressRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      isLongPressRef.current = true;
      longPressTimerRef.current = null;
      onPressStart?.();
    }, LONG_PRESS_MS);
  }

  function handlePointerUp() {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      onPressEnd?.();
    } else {
      // Released before the long-press threshold → it's a tap.
      onTap?.();
    }
  }

  function handlePointerLeave() {
    // Finger slid off mid-press. If we'd already started a long-press,
    // end it cleanly so the mic LED doesn't stay on. If we hadn't, just
    // cancel the pending timer — no action fires.
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      onPressEnd?.();
    }
  }

  const insideLabel = busy
    ? PHASE_LABEL[phase as Exclude<CapturePhase, 'idle'>]
    : PRIMARY_IDLE_LABEL[mode];

  const outsideLabel = busy ? null : SECONDARY_IDLE_LABEL[mode];

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
      disabled={isDisabled}
      aria-label={
        mode === 'ask'
          ? 'Hold to ask a question, tap to describe scene'
          : `Tap to ${mode}, hold to ask a question`
      }
      aria-busy={busy ? 'true' : 'false'}
      aria-pressed={recording}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-3',
        'rounded-2xl py-6 select-none',
        'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-300',
        'disabled:opacity-60 disabled:cursor-not-allowed',
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          'flex h-60 w-60 items-center justify-center rounded-full',
          'text-white text-2xl font-semibold shadow-lg text-center px-4',
          'transition-transform active:scale-95',
          recording
            ? 'bg-red-600 animate-pulse'
            : busy
              ? 'bg-blue-600 animate-pulse'
              : 'bg-blue-600',
        )}
      >
        {insideLabel}
      </div>
      {outsideLabel && (
        <p className="text-base text-slate-600">{outsideLabel}</p>
      )}
    </button>
  );
}
