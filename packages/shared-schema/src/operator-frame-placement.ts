import type { Element, VideoPlaceholderElement } from './elements.js';
import type { LiveFrameTarget } from './live-fit.js';
import { flattenElements } from './scene-flatten.js';
import type { Scene } from './scene.js';

/** Resolve a plate's placement and the nearest single-plate composition that owns its artwork. */
export function collectOperatorFrameTargets(
  scene: Scene,
  flattened = flattenElements(scene),
): ReadonlyMap<string, LiveFrameTarget> {
  const targets = new Map<string, LiveFrameTarget>();
  const canAdjust = (element: Element): element is VideoPlaceholderElement =>
    element.type === 'video-placeholder' &&
    (element.operatorPlacement !== undefined || element.operatorMove === true);
  if (!flattened.some(({ element }) => canAdjust(element))) return targets;
  const typeByKey = new Map(flattened.map(({ key, element }) => [key, element.type]));
  const renderedPlates = flattened.filter(
    ({ element, ancestorKeys }) =>
      element.type === 'video-placeholder' &&
      // Container descendants are flattened for geometry but have no nodes in the page builder.
      !ancestorKeys.some((key) => typeByKey.get(key) === 'container'),
  );
  const countByAncestor = new Map<string, number>();
  for (const { ancestorKeys } of renderedPlates) {
    for (const key of ancestorKeys) countByAncestor.set(key, (countByAncestor.get(key) ?? 0) + 1);
  }

  for (const { element, key, ancestorKeys } of renderedPlates) {
    if (!canAdjust(element)) continue;
    // All remaining ancestors are rendered composition instances.
    const artworkKey =
      [...ancestorKeys].reverse().find((ancestor) => countByAncestor.get(ancestor) === 1) ?? key;
    targets.set(key, {
      frameKey: key,
      artworkKey,
      resize: element.operatorPlacement ?? 'move-only',
      ...(element.operatorMove === false && { move: false }),
    });
  }
  return targets;
}
