import type { NormalizedRect } from './live-layers.js';

const full = { x: 0, y: 0, width: 1, height: 1 } as const;
// The 1080i mixer ignores a zero-sized viewport. Keep a real viewport off screen.
export const parkedArtworkClip = { x: 2, y: 2, width: 1, height: 1 } as const;

function insideFrame(box: NormalizedRect): boolean {
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.width > 0 &&
    box.height > 0 &&
    box.x + box.width <= 1 + 1e-7 &&
    box.y + box.height <= 1 + 1e-7
  );
}

/** Route takes the producer's untransformed pixels. Map its original aperture
 * onto the moving picture and clip the rest of the shared foreground away. */
export function routedArtworkFit(source: NormalizedRect, destination: NormalizedRect) {
  const width = destination.width / source.width;
  const height = destination.height / source.height;
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)))
    return undefined;
  return {
    fill: {
      x: destination.x - source.x * width,
      y: destination.y - source.y * height,
      width,
      height,
    },
    clip: destination,
  };
}

/** Keep all unaffected plates on the original foreground without exposing the
 * routed plate twice. A centre insert or overlapping artwork cannot be split
 * with one native clip, in which case the resident HTML owns that effect. */
export function remainingArtworkClip(source: NormalizedRect, others: readonly NormalizedRect[]) {
  if (!insideFrame(source)) return undefined;
  if (!others.length) return parkedArtworkClip;
  const right = source.x + source.width;
  const bottom = source.y + source.height;
  const candidates = [
    { ...full, height: source.y },
    { ...full, width: source.x },
    { ...full, y: bottom, height: 1 - bottom },
    { ...full, x: right, width: 1 - right },
  ];
  return candidates
    .filter(
      (clip) =>
        clip.width > 0 &&
        clip.height > 0 &&
        others.every(
          (rect) =>
            rect.x >= clip.x - 1e-7 &&
            rect.y >= clip.y - 1e-7 &&
            rect.x + rect.width <= clip.x + clip.width + 1e-7 &&
            rect.y + rect.height <= clip.y + clip.height + 1e-7,
        ),
    )
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

/** A single retained group can stay on the original foreground during the
 * selective arrival/departure of several disjoint plate surfaces. */
export function artworkGroupRemainder(
  sources: readonly NormalizedRect[],
  others: readonly NormalizedRect[],
) {
  const first = sources[0];
  if (!first || !sources.every(insideFrame)) return undefined;
  if (sources.length === 1) return remainingArtworkClip(first, others);
  const overlaps = (a: NormalizedRect, b: NormalizedRect) =>
    a.x < b.x + b.width - 1e-7 &&
    a.x + a.width > b.x + 1e-7 &&
    a.y < b.y + b.height - 1e-7 &&
    a.y + a.height > b.y + 1e-7;
  if (sources.some((rect, i) => sources.slice(i + 1).some((other) => overlaps(rect, other))))
    return undefined;
  if (others.length === 0) return parkedArtworkClip;
  const x = Math.min(...others.map((r) => r.x));
  const y = Math.min(...others.map((r) => r.y));
  const hull = {
    x,
    y,
    width: Math.max(...others.map((r) => r.x + r.width)) - x,
    height: Math.max(...others.map((r) => r.y + r.height)) - y,
  };
  return sources.some((rect) => overlaps(rect, hull)) ? undefined : hull;
}
