import type { NormalizedRect } from '@cg/shared-schema';

interface PictureFit {
  readonly fill: NormalizedRect;
  readonly clip: NormalizedRect;
}

interface InputSlideStep {
  readonly frames: number;
  readonly incoming: PictureFit;
  readonly outgoing?: PictureFit;
}

/** Allow a source fit to differ from the authored aperture only by mixer pixel alignment. */
export function inputSlideAperture(
  aperture: NormalizedRect | undefined,
  incoming: NormalizedRect,
  outgoing: NormalizedRect,
  raster: { readonly width: number; readonly height: number },
): NormalizedRect | undefined {
  if (aperture === undefined) return undefined;
  const right = aperture.x + aperture.width;
  const bottom = aperture.y + aperture.height;
  const x = Math.min(aperture.x, incoming.x, outgoing.x);
  const y = Math.min(aperture.y, incoming.y, outgoing.y);
  const endX = Math.max(right, incoming.x + incoming.width, outgoing.x + outgoing.width);
  const endY = Math.max(bottom, incoming.y + incoming.height, outgoing.y + outgoing.height);
  if (
    aperture.x - x > 1 / raster.width ||
    endX - right > 1 / raster.width ||
    aperture.y - y > 1 / raster.height ||
    endY - bottom > 1 / raster.height
  )
    return undefined;
  return { x, y, width: endX - x, height: endY - y };
}

/**
 * The native polygon clip can tolerate too much spill along a shortening edge.
 * Limit movement to pictures that already fit across the stationary aperture axis.
 */
export function inputSlideFitsAcrossAperture(
  aperture: NormalizedRect,
  fills: readonly NormalizedRect[],
  direction: { readonly x: number; readonly y: number },
  raster: { readonly width: number; readonly height: number },
): boolean {
  const horizontal = direction.x !== 0;
  const coordinate = horizontal ? 'y' : 'x';
  const size = horizontal ? 'height' : 'width';
  const edgeRounding = 0.5 / raster[size];
  return fills.every(
    (fill) =>
      fill[coordinate] >= aperture[coordinate] - edgeRounding &&
      fill[coordinate] + fill[size] <= aperture[coordinate] + aperture[size] + edgeRounding,
  );
}

/** A native FILL/CLIP tween follows one straight segment between aperture crossings. */
export function planInputSlide(
  incoming: PictureFit,
  outgoing: PictureFit,
  aperture: NormalizedRect,
  direction: { readonly x: number; readonly y: number },
  push: boolean,
  frames: number,
): { initial: PictureFit; steps: InputSlideStep[] } {
  const horizontal = direction.x !== 0;
  const coordinate = horizontal ? 'x' : 'y';
  const size = horizontal ? 'width' : 'height';
  const low = aperture[coordinate];
  const high = low + aperture[size];
  const distance = aperture[size] * direction[coordinate];
  const clamp = (value: number) => Math.max(low, Math.min(high, value));
  // Keep even the empty edge clipped. A zero-area mixer CLIP can drop the clipping
  // at a native tween endpoint and expose the oversized source FILL for one frame.
  const closedEdge = Math.min(aperture[size], 0.00001);
  const translate = (fit: PictureFit, offset: number): PictureFit => {
    const start = clamp(fit.clip[coordinate] + offset);
    const end = clamp(fit.clip[coordinate] + fit.clip[size] + offset);
    const extent = Math.max(closedEdge, end - start);
    return {
      fill: { ...fit.fill, [coordinate]: fit.fill[coordinate] + offset },
      clip: { ...fit.clip, [coordinate]: Math.min(start, high - extent), [size]: extent },
    };
  };

  const boundaries = new Set([frames]);
  const markCrossings = ({ clip }: PictureFit, initialOffset: number) => {
    for (const edge of [low, high]) {
      for (const start of [clip[coordinate], clip[coordinate] + clip[size]]) {
        const fraction = (start + initialOffset - edge) / distance;
        const tick = Math.round(fraction * frames);
        if (tick > 0 && tick < frames) boundaries.add(tick);
      }
    }
  };
  markCrossings(incoming, distance);
  if (push) markCrossings(outgoing, 0);
  let last = 0;
  const steps = [...boundaries]
    .sort((a, b) => a - b)
    .map((tick) => {
      const progress = tick / frames;
      const step = {
        frames: tick - last,
        incoming: tick === frames ? incoming : translate(incoming, distance * (1 - progress)),
        ...(push && { outgoing: translate(outgoing, -distance * progress) }),
      };
      last = tick;
      return step;
    });
  return { initial: translate(incoming, distance), steps };
}
