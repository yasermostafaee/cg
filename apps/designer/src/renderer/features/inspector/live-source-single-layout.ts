import type { Transform, VideoPlaceholderElement } from '@cg/shared-schema';
import { effectiveAspect } from './aspect-presets.js';

export interface SingleLiveSourceLayout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly margin: number;
}

/**
 * D-169 — fit one Live Source into the active composition, optionally inset from every edge.
 *
 * The declared source aspect wins; without one, the plate's current rendered aspect is retained.
 * This is deliberately a FIT rather than a stretch: a portrait guest must not become 16:9 merely
 * because the author asked for the largest useful placement. The result is centred on the axis
 * that has spare room and always remains inside the composition.
 */
export function calculateSingleLiveSourceLayout(
  element: VideoPlaceholderElement,
  resolution: { readonly width: number; readonly height: number },
  requestedMargin: number,
): SingleLiveSourceLayout | null {
  if (!(resolution.width > 0) || !(resolution.height > 0)) return null;

  const maximumMargin = Math.max(0, Math.min(resolution.width, resolution.height) / 2 - 1);
  const margin = Math.min(maximumMargin, Math.max(0, requestedMargin));
  const availableWidth = resolution.width - margin * 2;
  const availableHeight = resolution.height - margin * 2;
  if (!(availableWidth > 0) || !(availableHeight > 0)) return null;

  const renderedAspect = effectiveAspect(element.transform);
  const aspect =
    element.expectedAspect !== undefined && element.expectedAspect > 0
      ? element.expectedAspect
      : Number.isFinite(renderedAspect) && renderedAspect > 0
        ? renderedAspect
        : availableWidth / availableHeight;

  const availableAspect = availableWidth / availableHeight;
  const width = availableAspect > aspect ? availableHeight * aspect : availableWidth;
  const height = availableAspect > aspect ? availableHeight : availableWidth / aspect;

  return {
    x: margin + (availableWidth - width) / 2,
    y: margin + (availableHeight - height) / 2,
    width,
    height,
    margin,
  };
}

/** One transform value for the store write; quick layout also normalises old scale/rotation. */
export function singleLiveSourceTransform(
  current: Transform,
  layout: SingleLiveSourceLayout,
): Transform {
  return {
    ...current,
    position: { x: layout.x, y: layout.y },
    size: { w: layout.width, h: layout.height },
    scale: { x: 1, y: 1 },
    rotation: 0,
  };
}
