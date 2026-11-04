import type { FrameRate } from '@cg/shared-schema';

/** Keep New Project's stored duration on its existing whole-frame contract. */
export function normalizeProjectFrames(frames: number): number {
  return Math.max(1, Math.round(Number.isFinite(frames) ? frames : 1));
}

/** Convert authored seconds to the closest duration the selected frame rate can represent. */
export function projectFramesFromSeconds(seconds: number, frameRate: FrameRate): number {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return normalizeProjectFrames(safeSeconds * frameRate);
}

/** Show the exact whole-frame duration without flooding the compact input with decimals. */
export function projectSecondsFromFrames(frames: number, frameRate: FrameRate): number {
  return Number((normalizeProjectFrames(frames) / frameRate).toFixed(3));
}
