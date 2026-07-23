/**
 * D-128 — read a STORED video asset's metadata (duration + intrinsic
 * dimensions) via a `<video>` element. Light and WASM-FREE, unlike the ffmpeg
 * probe of a raw SOURCE: the stored clip is already the canonical WebM, so the
 * browser decodes its metadata directly. Kept out of `video-convert.ts` on
 * purpose — that module eagerly imports `@ffmpeg/*`, and neither the
 * drag-from-assets drop nor the import modal's "use existing" path should drag
 * the 32 MB core in just to read a duration.
 *
 * Shared by the drag-from-assets drop (CanvasOverlay) and the modal's
 * duplicate "use existing" action. Resolves null when the asset can't decode.
 */
export function probeStoredVideo(
  url: string,
): Promise<{ durationMs: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () =>
      resolve({
        durationMs: Math.round(v.duration * 1000),
        width: v.videoWidth,
        height: v.videoHeight,
      });
    v.onerror = () => resolve(null);
    v.src = url;
  });
}
