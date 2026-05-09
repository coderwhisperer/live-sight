import { useEffect, useRef } from 'react';
import type { Mode } from '@/api/types';
import { cn } from '@/lib/utils';

export type CapturePhase =
  | 'idle'
  | 'capturing' // single-tap: photo + describe in flight
  | 'recording' // ask flow: holding the viewfinder, recording audio
  | 'transcribing' // ask flow: audio uploaded, awaiting transcript
  | 'querying'; // ask flow: image + transcript posted to /query

interface CameraButtonProps {
  mode: Mode;
  phase: CapturePhase;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  disabled?: boolean;
  onTap?: () => void;
  onPressStart?: () => void;
  onPressEnd?: () => void;
}

const LONG_PRESS_MS = 400;

// Mode-keyed border color. Inline-styled so Tailwind's purge can't drop them.
const MODE_BORDER: Record<Mode, string> = {
  navigate: '#1D9E75',
  read: '#BA7517',
  scene: '#378ADD',
  ask: '#7F77DD',
};

// Idle labels split into primary (large, on top) and secondary (smaller,
// below) inside the bottom band. In Ask mode the hold-to-ask is primary;
// in the others, tap-to-X is primary.
const IDLE_LABEL: Record<Mode, { primary: string; secondary: string }> = {
  navigate: { primary: 'Tap to navigate', secondary: 'Hold to ask a question' },
  read: { primary: 'Tap to read', secondary: 'Hold to ask a question' },
  scene: { primary: 'Tap to describe', secondary: 'Hold to ask a question' },
  ask: { primary: 'Hold to ask a question', secondary: 'Tap to describe' },
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
  videoRef,
  disabled,
  onTap,
  onPressStart,
  onPressEnd,
}: CameraButtonProps) {
  // Long-press detection: pointerdown starts a 400ms timer; if pointerup
  // fires before the timer, it's a tap → onTap. If the timer fires first,
  // we set isLongPress=true and call onPressStart; pointerup then calls
  // onPressEnd. Pointer-leave during a hold ends the recording cleanly so
  // a finger sliding off the viewfinder doesn't strand the mic LED on.
  const longPressTimerRef = useRef<number | null>(null);
  const isLongPressRef = useRef(false);

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

  function handlePointerDown(e: React.PointerEvent) {
    console.log('[CB] pointerdown', {
      phase,
      mode,
      pointerType: e.pointerType,
      pointerId: e.pointerId,
      isPrimary: e.isPrimary,
    });
    if (isDisabled) {
      console.log('[CB] pointerdown ignored — disabled');
      return;
    }
    isLongPressRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      console.log('[CB] longpress timer fired (400ms reached)');
      isLongPressRef.current = true;
      longPressTimerRef.current = null;
      onPressStart?.();
    }, LONG_PRESS_MS);
  }

  function handlePointerUp(e: React.PointerEvent) {
    console.log('[CB] pointerup', {
      phase,
      isLongPress: isLongPressRef.current,
      hasTimer: longPressTimerRef.current !== null,
      pointerId: e.pointerId,
    });
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (isLongPressRef.current) {
      console.log('[CB] -> calling onPressEnd');
      isLongPressRef.current = false;
      onPressEnd?.();
    } else {
      console.log('[CB] -> calling onTap');
      onTap?.();
    }
  }

  function handlePointerLeave(e: React.PointerEvent) {
    console.log('[CB] pointerleave', {
      phase,
      isLongPress: isLongPressRef.current,
      pointerId: e.pointerId,
    });
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (isLongPressRef.current) {
      console.log('[CB] -> calling onPressEnd from leave');
      isLongPressRef.current = false;
      onPressEnd?.();
    }
  }

  function handlePointerCancel(e: React.PointerEvent) {
    console.log('[CB] pointercancel', {
      phase,
      isLongPress: isLongPressRef.current,
      pointerId: e.pointerId,
    });
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (isLongPressRef.current) {
      console.log('[CB] -> calling onPressEnd from cancel');
      isLongPressRef.current = false;
      onPressEnd?.();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (isDisabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTap?.();
    }
  }

  const idleLabel = IDLE_LABEL[mode];
  const primaryLabel = busy
    ? PHASE_LABEL[phase as Exclude<CapturePhase, 'idle'>]
    : idleLabel.primary;
  const secondaryLabel = busy ? null : idleLabel.secondary;

  return (
    <div
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      aria-label={
        mode === 'ask'
          ? 'Hold to ask a question, tap to describe scene'
          : `Tap to ${mode}, hold to ask a question`
      }
      aria-busy={busy ? 'true' : 'false'}
      aria-pressed={recording}
      style={{ borderColor: MODE_BORDER[mode] }}
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border-[3px] bg-slate-800',
        'select-none cursor-pointer touch-none',
        'transition-shadow shadow-lg',
        'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-400',
        isDisabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      {/* Camera viewfinder fills the entire box at a 4:3 aspect. The
          parent rounded corners + overflow-hidden clip the video to fit
          the colored border frame. */}
      <div className="aspect-[4/5] w-full bg-slate-800">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-hidden="true"
          className="h-full w-full object-cover"
        />
      </div>

      {/* Overlay band at the bottom of the viewfinder. Camera shows
          through where the band isn't; backdrop-blur softens whatever
          the camera is pointed at so the text stays legible. */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 px-4 py-3 text-center',
          'backdrop-blur-sm transition-colors',
          recording
            ? 'bg-red-700/70 animate-pulse'
            : busy
              ? 'bg-black/65'
              : 'bg-black/55',
        )}
      >
        <p className="text-white text-xl font-semibold leading-tight">
          {primaryLabel}
        </p>
        {secondaryLabel && (
          <p className="mt-0.5 text-sm text-white/75 leading-tight">
            {secondaryLabel}
          </p>
        )}
      </div>
    </div>
  );
}
