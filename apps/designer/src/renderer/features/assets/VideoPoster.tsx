import { useEffect, useRef, type CSSProperties } from 'react';

/**
 * D-128 Phase 3 — a STORED video's poster frame, rendered as a PAUSED `<video>`
 * seeked to a mid-clip time (frame 0 is frequently transparent — decision (a)).
 * Real pixels with alpha, no PNG capture. Shared by the assets-panel thumbnail
 * and the Inspector; the canvas frame does the same seek in preview.ts. Pass
 * `atMs` = `phases.introEnd ?? durationMs/2` (a bare thumbnail with no element
 * just omits it and the component falls back to the loaded clip's midpoint).
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
    const seek = (): void => {
      const t =
        atMs !== undefined && atMs > 0
          ? atMs / 1000
          : Number.isFinite(v.duration)
            ? v.duration / 2
            : 0;
      try {
        v.currentTime = t;
      } catch {
        /* not seekable yet — the loadedmetadata listener will retry */
      }
    };
    if (v.readyState >= 1) seek();
    else v.addEventListener('loadedmetadata', seek, { once: true });
    return () => v.removeEventListener('loadedmetadata', seek);
  }, [url, atMs]);
  return (
    <video
      ref={ref}
      className={props.className}
      style={props.style}
      src={url}
      muted
      playsInline
      preload="metadata"
      aria-label={props.ariaLabel}
      draggable={props.draggable}
    />
  );
}
