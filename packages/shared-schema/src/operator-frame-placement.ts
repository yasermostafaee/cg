import type { Element, VideoPlaceholderElement } from './elements.js';
import type { LiveFrameTarget } from './live-fit.js';
import { lookGroupOf } from './looks.js';
import { flattenElements, type FlatElement } from './scene-flatten.js';
import type { Scene } from './scene.js';

/** Resolve a plate's placement and the nearest single-plate composition that owns its artwork. */
export function collectOperatorFrameTargets(
  scene: Scene,
  flattened = flattenElements(scene),
): ReadonlyMap<string, LiveFrameTarget> {
  const canAdjust = (element: Element): element is VideoPlaceholderElement =>
    element.type === 'video-placeholder' &&
    (element.operatorPlacement !== undefined || element.operatorMove === true);
  if (!flattened.some(({ element }) => canAdjust(element))) return new Map();
  return collectFrameTargets(flattened, ({ element }) => canAdjust(element));
}

/** Resolve the plates authored inside a preset, including frames locked against operator edits. */
export function collectPresetFrameTargets(
  scene: Scene,
  flattened?: readonly FlatElement[],
): ReadonlyMap<string, LiveFrameTarget> {
  const instances = new Set(lookGroupOf(scene)?.looks.map(({ instanceId }) => instanceId));
  if (instances.size === 0) return new Map();
  return collectFrameTargets(
    flattened ?? flattenElements(scene),
    ({ element, ancestorKeys, ancestry }) => {
      const instance = ancestorKeys[0];
      return (
        element.type === 'video-placeholder' &&
        element.routeKey !== undefined &&
        element.visible &&
        instance !== undefined &&
        instances.has(instance) &&
        ancestry.every(({ id, visible }) => visible || id === instance)
      );
    },
  );
}

function collectFrameTargets(
  flattened: readonly FlatElement[],
  includes: (entry: FlatElement) => boolean,
): ReadonlyMap<string, LiveFrameTarget> {
  const targets = new Map<string, LiveFrameTarget>();
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

  for (const entry of renderedPlates) {
    const { element, key, ancestorKeys } = entry;
    if (element.type !== 'video-placeholder' || !includes(entry)) continue;
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
