import {
  composeAffine,
  framePlacementFits,
  invertAffine,
  transformToParent,
  type Affine,
  type FlatElement,
  type LiveFramePlacement,
  type LiveFrameTarget,
} from '@cg/shared-schema';

export function createFramePlacementRenderer(
  container: HTMLElement,
  flattened: readonly FlatElement[],
  targets: ReadonlyMap<string, LiveFrameTarget>,
): (placements: readonly LiveFramePlacement[], lookId: string | undefined) => void {
  if (targets.size === 0) return () => undefined;
  const authored = new Map(flattened.map((entry) => [entry.key, entry]));
  const wrappers = new Map(
    Array.from(
      container.querySelectorAll<HTMLElement>('[data-cg-frame-artwork]'),
      (wrapper) => [wrapper.dataset['cgFrameArtwork'], wrapper] as const,
    ),
  );

  return (placements, lookId) => {
    for (const wrapper of wrappers.values()) {
      wrapper.style.position = '';
      wrapper.style.transform = '';
    }
    for (const placement of placements) {
      if (placement.lookId !== lookId) continue;
      const target = targets.get(placement.frameKey);
      if (target === undefined) continue;
      const plate = authored.get(target.frameKey);
      const artwork = authored.get(target.artworkKey);
      const wrapper = wrappers.get(target.artworkKey);
      if (plate === undefined || artwork === undefined || wrapper === undefined) continue;
      if (!framePlacementFits(placement, plate.rect, target.resize)) continue;
      const matrix = placementTransform(plate, artwork, placement.rect);
      if (matrix === null) continue;

      // The authored nodes stay mounted, so animations and media keep running.
      wrapper.style.position = 'absolute';
      wrapper.style.transform = `matrix(${[matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].join(',')})`;
    }
  };
}

function placementTransform(
  plate: FlatElement,
  artwork: FlatElement,
  rect: LiveFramePlacement['rect'],
): Affine | null {
  const inverseLocal = invertAffine(transformToParent(artwork.element.transform));
  if (inverseLocal === null) return null;
  const parentToScene = composeAffine(artwork.toScene, inverseLocal);
  const sceneToParent = invertAffine(parentToScene);
  if (sceneToParent === null) return null;
  const scaleX = rect.width / plate.rect.width;
  const scaleY = rect.height / plate.rect.height;
  return composeAffine(
    sceneToParent,
    composeAffine(
      {
        a: scaleX,
        b: 0,
        c: 0,
        d: scaleY,
        e: rect.x - scaleX * plate.rect.x,
        f: rect.y - scaleY * plate.rect.y,
      },
      parentToScene,
    ),
  );
}
