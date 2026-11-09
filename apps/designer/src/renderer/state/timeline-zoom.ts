/** B-416 — timeline zoom bounds shared by the store and the status-bar control. */
export const TIMELINE_ZOOM_MIN = 1;
export const TIMELINE_ZOOM_BASE_MAX = 20;
export const TIMELINE_FRAMES_AT_MAX_ZOOM = 12;

/**
 * Keep the historical 20× range for ordinary compositions, but let long compositions zoom until
 * no more than 12 frames occupy the viewport. That leaves room for a number and grid line at each
 * frame, even for large frame numbers in a compact workspace.
 */
export function timelineZoomMax(frameIn: number, frameOut: number): number {
  const span = Math.max(1, frameOut - frameIn);
  return Math.max(TIMELINE_ZOOM_BASE_MAX, Math.ceil(span / TIMELINE_FRAMES_AT_MAX_ZOOM));
}

export function clampTimelineZoom(z: number, frameIn: number, frameOut: number): number {
  const finite = Number.isFinite(z) ? z : TIMELINE_ZOOM_MIN;
  return Math.max(TIMELINE_ZOOM_MIN, Math.min(timelineZoomMax(frameIn, frameOut), finite));
}
