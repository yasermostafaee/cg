import {
  flattenElements,
  sceneRect,
  type Element,
  type LiveSourceLayoutItem,
  type LiveSourceLayoutSource,
  type LiveSourceRect,
  type Scene,
  type Transform,
  type VideoPlaceholderElement,
} from '@cg/shared-schema';

type LayoutTarget = LiveSourceLayoutSource &
  (
    | { kind: 'plate' }
    | { kind: 'composition' | 'visual'; transform: Transform; bounds: LiveSourceRect }
  );

export function plateLayoutSource(
  { id, expectedAspect }: VideoPlaceholderElement,
  transform: Transform,
): LiveSourceLayoutSource {
  if (expectedAspect !== undefined && expectedAspect > 0) return { id, aspect: expectedAspect };

  const width = Math.abs(transform.size.w * transform.scale.x);
  const height = Math.abs(transform.size.h * transform.scale.y);
  return { id, aspect: height > 0 ? width / height : 16 / 9 };
}

/** A single-plate composition is laid out by its live frame, even on a large transparent canvas. */
function compositionPlateBounds(
  scene: Scene,
  compositionInstances: ReadonlyMap<string, Element>,
): ReadonlyMap<string, LiveSourceRect | null> {
  if (compositionInstances.size === 0) return new Map();
  const selectedScene: Scene = {
    ...scene,
    layers: scene.layers.map((layer) => ({
      ...layer,
      children: layer.children.flatMap(({ id }) => compositionInstances.get(id) ?? []),
    })),
  };
  const flattened = flattenElements(selectedScene);
  const containers = new Set(
    flattened.filter(({ element }) => element.type === 'container').map(({ key }) => key),
  );
  const bounds = new Map<string, LiveSourceRect | null>();
  for (const { element, rect, ancestorKeys } of flattened) {
    const instance = ancestorKeys[0];
    if (
      element.type !== 'video-placeholder' ||
      instance === undefined ||
      ancestorKeys.some((key) => containers.has(key))
    ) {
      continue;
    }
    bounds.set(instance, bounds.has(instance) ? null : rect);
  }
  return bounds;
}

export function autoLayoutTargets(
  scene: Scene,
  elements: readonly Element[],
  transformOf: (element: Element) => Transform,
): LayoutTarget[] {
  const visuals = elements
    .filter((element) => element.type !== 'audio' && !element.locked)
    .map((element) => {
      const transform = transformOf(element);
      // The position of an auto-sized RTL text is its right edge.
      const x =
        element.type === 'text' && element.fitMode === 'autosize' && element.direction === 'rtl'
          ? -transform.size.w
          : 0;
      return { ...element, transform: { ...transform, position: { x, y: 0 } } };
    });
  const instances = new Map(
    visuals
      .filter((element) => element.type === 'composition')
      .map((element) => [element.id, element]),
  );
  const plateBounds = compositionPlateBounds(scene, instances);
  const targets: LayoutTarget[] = [];
  for (const element of visuals) {
    const { id, transform } = element;
    if (element.type === 'video-placeholder') {
      targets.push({ kind: 'plate', ...plateLayoutSource(element, transform) });
      continue;
    }
    const bounds = plateBounds.get(id) ?? sceneRect(element, []);
    const aspect = bounds.width / bounds.height;
    if (bounds.width <= 0 || bounds.height <= 0 || !Number.isFinite(aspect)) continue;
    targets.push({
      kind: element.type === 'composition' ? 'composition' : 'visual',
      id,
      aspect,
      bounds,
      transform,
    });
  }
  return targets;
}

export function autoLayoutTransform(
  target: LayoutTarget,
  { x, y, width, height }: LiveSourceLayoutItem,
): Pick<Transform, 'position'> & Partial<Pick<Transform, 'size' | 'scale' | 'rotation'>> {
  if (target.kind === 'plate') {
    return {
      position: { x, y },
      size: { w: width, h: height },
      scale: { x: 1, y: 1 },
      rotation: 0,
    };
  }

  const { bounds, transform } = target;
  const factor = width / bounds.width;
  if (target.kind === 'composition') {
    // Instance size scales the nested pixels AND the instance's anchor. Only this
    // reference changes, so the same child can be reused elsewhere at its original size.
    return {
      position: { x: x - bounds.x * factor, y: y - bounds.y * factor },
      size: { w: transform.size.w * factor, h: transform.size.h * factor },
    };
  }
  const anchorX = transform.position.x + transform.anchor.x * transform.size.w;
  const anchorY = transform.position.y + transform.anchor.y * transform.size.h;
  return {
    position: {
      x: x - anchorX - (bounds.x - anchorX) * factor,
      y: y - anchorY - (bounds.y - anchorY) * factor,
    },
    scale: { x: transform.scale.x * factor, y: transform.scale.y * factor },
  };
}
