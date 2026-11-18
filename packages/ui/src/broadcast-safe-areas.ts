/** EBU R95 v1.1 note 5; HD percentages also match SMPTE ST 2046-1:2009 §5. */
export const BROADCAST_SAFE_AREA_TITLE =
  'EBU R95 · Action 93% · Graphics 90% · Preview guides only';

export interface BroadcastSafeArea {
  kind: 'action' | 'graphics';
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Concentric guides in active-picture pixels, never in the surrounding letterbox. */
export function broadcastSafeAreas(width: number, height: number): readonly BroadcastSafeArea[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  return (
    [
      ['action', 93, 'Action 93%'],
      ['graphics', 90, 'Graphics 90%'],
    ] as const
  ).map(([kind, percent, label]) => {
    // ST 2046-1 §5 rounds the protected width/height to whole raster samples.
    const protectedWidth = Math.max(1, Math.round((width * percent) / 100));
    const protectedHeight = Math.max(1, Math.round((height * percent) / 100));
    return {
      kind,
      label,
      x: (width - protectedWidth) / 2,
      y: (height - protectedHeight) / 2,
      width: protectedWidth,
      height: protectedHeight,
    };
  });
}
