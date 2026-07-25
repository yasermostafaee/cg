import { useEffect, useRef, type CSSProperties } from 'react';
import { attachRobustVideoPoster } from '../../../shared/video-poster.js';

/**
 * D-128 Phase 3 — a STORED video's poster frame, rendered as a PAUSED `<video>`
 * seeked to a mid-clip time (frame 0 is frequently transparent — decision (a)).
 * Real pixels with alpha, no PNG capture. Shared by the assets-panel thumbnail
 * and the Inspector; the canvas frame runs the SAME routine in preview.ts. Pass
 * `atMs` = `phases.introEnd ?? durationMs/2` (a bare thumbnail with no element
 * just omits it and the routine falls back to the loaded clip's midpoint).
 *
 * The poster is produced by `attachRobustVideoPoster` (src/shared) — a plain
 * cold seek is a TERMINAL decode error on WebM clips whose alpha side-stream
 * keyframes misalign with the main stream's (the D-128 canvas-blank field bug);
 * the shared routine recovers via sequential decode, so a thumbnail can only be
 * blank when the clip cannot decode at all — and then it says so.
 */
export function VideoPoster(props: {
  url: string;
  atMs?: number | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  ariaLabel?: string | undefined;
  draggable?: boolean | undefined;
}): JSX.Element {
  const ref = useRef<HTMLVideoElement>(null);
  const { url, atMs } = props;
  useEffect(() => {
    const v = ref.current;
    if (v === null) return;
    const controller = new AbortController();
    void attachRobustVideoPoster(v, url, atMs, controller.signal).then((outcome) => {
      // Honest surfacing: a thumbnail that cannot produce its frame is a real
      // decode failure, never a silently blank tile.
      if (!outcome.ok && outcome.error !== 'superseded' && outcome.error !== 'aborted') {
        console.error(
          '[video-poster] stored clip failed to produce its poster frame:',
          outcome.error ?? 'unknown media error',
          url,
        );
      }
    });
    return () => controller.abort();
  }, [url, atMs]);
  return (
    <video
      ref={ref}
      className={props.className}
      style={props.style}
      muted
      playsInline
      aria-label={props.ariaLabel}
      draggable={props.draggable}
    />
  );
}
