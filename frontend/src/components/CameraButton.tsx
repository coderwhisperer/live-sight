import type { Mode } from '@/api/types';
import { cn } from '@/lib/utils';

export type CapturePhase =
  | 'idle'
  | 'capturing' // single-tap describe modes: photo + describe in flight
  | 'recording' // ask mode: recording audio (tap again to stop)
  | 'transcribing' // ask mode: audio uploaded, awaiting transcript
  | 'querying'; // ask mode: image + transcript posted to /query (or /recall)

interface CameraButtonProps {
  mode: Mode;
  phase: CapturePhase;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  disabled?: boolean;
  onTap?: () => void;
}

// Mode-keyed border color. Inline-styled so Tailwind's purge can't drop them.
const MODE_BORDER: Record<Mode, string> = {
  navigate: '#1D9E75',
  read: '#BA7517',
  scene: '#378ADD',
  ask: '#7F77DD',
};

const IDLE_LABEL: Record<Mode, string> = {
  navigate: 'Tap to navigate',
  read: 'Tap to read',
  scene: 'Tap to describe',
  ask: 'Tap to ask',
};

const PHASE_LABEL: Record<Exclude<CapturePhase, 'idle'>, string> = {
  capturing: 'Looking…',
  recording: '🔴 Tap to stop',
  transcribing: 'Transcribing…',
  querying: 'Thinking…',
};

export function CameraButton({
  mode,
  phase,
  videoRef,
  disabled,
  onTap,
}: CameraButtonProps) {
  const recording = phase === 'recording';
  const busy = phase !== 'idle';
  // Disabled while transcribing/querying/capturing so a stray tap doesn't
  // re-enter the flow. The recording phase stays tappable so the user can
  // tap again to stop (the tap-to-toggle pattern).
  const isDisabled = disabled || (busy && !recording);

  function handleClick() {
    console.log('[CB] click', { phase, mode, disabled: isDisabled });
    if (isDisabled) return;
    onTap?.();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (isDisabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTap?.();
    }
  }

  const primaryLabel = busy
    ? PHASE_LABEL[phase as Exclude<CapturePhase, 'idle'>]
    : IDLE_LABEL[mode];

  return (
    <div
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={
        mode === 'ask'
          ? recording
            ? 'Tap to stop recording'
            : 'Tap to start recording a question'
          : `Tap to ${mode}`
      }
      aria-busy={busy ? 'true' : 'false'}
      aria-pressed={recording}
      style={{ borderColor: MODE_BORDER[mode] }}
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border-[3px] bg-slate-800',
        'select-none cursor-pointer',
        'transition-shadow shadow-lg',
        'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-400',
        isDisabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      {/* Camera viewfinder fills the entire box. The parent rounded
          corners + overflow-hidden clip the video to fit the colored
          border frame. */}
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
      </div>
    </div>
  );
}
