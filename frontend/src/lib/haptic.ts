// Vibration API wrapper. Android Chrome / Firefox support it; iOS Safari
// doesn't (returns undefined for navigator.vibrate). Calls fail silently.

export function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // some browsers throw if vibration is blocked by user setting
    }
  }
}

export const haptic = {
  modeChange: () => vibrate(50),
  recordStart: () => vibrate([50, 50, 50]),
  recordEnd: () => vibrate(100),
  success: () => vibrate([30, 30, 30]),
  error: () => vibrate([200, 100, 200]),
};
