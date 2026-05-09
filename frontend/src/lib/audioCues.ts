// Short Web Audio tones for state transitions. Distinct frequencies so
// blind users can tell capture-start, record-start, record-end, response,
// and error apart by ear without TTS overhead.
//
// AudioContext is lazily created on first use because Chrome blocks
// construction before the first user gesture; the first cue always fires
// from a tap/click handler so this is safe.

type AudioCtxCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor: AudioCtxCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtxCtor })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
): void {
  const c = getCtx();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.frequency.value = frequency;
    osc.type = type;
    gain.gain.setValueAtTime(0.2, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + duration);
    osc.start();
    osc.stop(c.currentTime + duration);
  } catch (err) {
    console.warn('audioCue failed:', err);
  }
}

export const audioCue = {
  captureStart: () => playTone(800, 0.15),
  recordStart: () => playTone(440, 0.2),
  recordEnd: () => playTone(660, 0.15),
  responseReady: () => playTone(300, 0.3),
  error: () => playTone(200, 0.4, 'square'),
};
