import { flattenElements, type Element, type Scene, type Transform } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { ASPECT_TOLERANCE, effectiveAspect, sizeRatioForAspect } from './aspect-presets.js';

/** The referenced raster's ratio for an instance that carries one rendered live frame. */
export function liveFrameCompositionAspect(
  scene: Scene | null,
  element: Element,
): number | undefined {
  if (element.type !== 'composition' || scene === null) return undefined;
  const composition = scene.compositions?.find(({ id }) => id === element.compositionId);
  if (composition === undefined) return undefined;
  const flattened = flattenElements({ ...scene, layers: composition.layers });
  const containers = new Set(
    flattened.filter(({ element }) => element.type === 'container').map(({ key }) => key),
  );
  const frames = flattened.filter(
    ({ element, ancestorKeys }) =>
      element.type === 'video-placeholder' && !ancestorKeys.some((key) => containers.has(key)),
  );
  const { width, height } = composition.resolution;
  return frames.length === 1 && width > 0 && height > 0 ? width / height : undefined;
}

export function compositionSizeRatio(aspect: number, scale: Transform['scale']): number | null {
  return sizeRatioForAspect(aspect, { x: Math.abs(scale.x), y: Math.abs(scale.y) });
}

/** Repair the visible ratio inside the current footprint, keeping the transform anchor fixed. */
export function restoreCompositionAspect(
  transform: Transform,
  aspect: number,
): Pick<Transform, 'size' | 'position'> | null {
  const ratio = compositionSizeRatio(aspect, transform.scale);
  const { size, position, anchor } = transform;
  if (ratio === null || size.w <= 0 || size.h <= 0) return null;
  if (Math.abs(Math.abs(effectiveAspect(transform)) - aspect) <= ASPECT_TOLERANCE) return null;
  const w = Math.min(size.w, size.h * ratio);
  const h = w / ratio;
  return {
    size: { w, h },
    position: { x: position.x + (size.w - w) * anchor.x, y: position.y + (size.h - h) * anchor.y },
  };
}

export function commitCompositionDimension(
  id: string,
  axis: 'size.w' | 'size.h',
  value: number,
  ratio: number | null,
): void {
  designerStore.commitAnimatable(id, axis, value);
  if (ratio === null) return;
  if (axis === 'size.w') designerStore.commitAnimatable(id, 'size.h', value / ratio);
  else designerStore.commitAnimatable(id, 'size.w', value * ratio);
}
