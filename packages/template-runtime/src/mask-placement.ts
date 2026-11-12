import {
  livePlateMaskRegions,
  lookContaining,
  maskRectsWithPlacements,
  sameLiveMaskRect,
  type FlatElement,
  type LiveMaskPlacement,
  type LivePlateMask,
  type LookGroup,
} from '@cg/shared-schema';

export function drawPlateMaskClip(clip: SVGClipPathElement, mask: LivePlateMask): void {
  clip.textContent = '';
  for (const region of livePlateMaskRegions(mask)) {
    const rect = clip.ownerDocument.createElementNS(clip.namespaceURI, 'rect');
    rect.setAttribute('x', String(region.x));
    rect.setAttribute('y', String(region.y));
    rect.setAttribute('width', String(region.width));
    rect.setAttribute('height', String(region.height));
    clip.appendChild(rect);
  }
}

/** Change only the fallback's clipping windows. The plate and its media stay mounted. */
export function createMaskPlacementRenderer(
  container: HTMLElement,
  flattened: readonly FlatElement[],
  group: LookGroup | undefined,
): (placements: readonly LiveMaskPlacement[], activeLookId: string | undefined) => void {
  if (flattened.length === 0) return () => undefined;
  const clips = new Map(
    Array.from(
      container.querySelectorAll<SVGClipPathElement>('[data-cg-editable-mask]'),
      (clip) => [clip.getAttribute('data-cg-editable-mask'), clip] as const,
    ),
  );
  const targets = flattened.flatMap(({ key, element, ancestry }) => {
    const clip = clips.get(key);
    if (
      clip === undefined ||
      element.type !== 'video-placeholder' ||
      element.allowOperatorMaskEdit !== true ||
      element.routeKey === undefined ||
      element.liveMask === undefined
    )
      return [];
    const look =
      group === undefined
        ? undefined
        : lookContaining(
            group,
            ancestry.map(({ id }) => id),
          );
    return [
      {
        clip,
        plateId: element.routeKey,
        lookId: look?.id,
        mask: element.liveMask,
        current: element.liveMask.rects,
      },
    ];
  });

  return (placements, activeLookId) => {
    for (const target of targets) {
      const rects =
        target.lookId === undefined || target.lookId === activeLookId
          ? maskRectsWithPlacements(target.mask.rects, placements, {
              lookId: activeLookId,
              plateId: target.plateId,
              kind: 'mask',
            })
          : target.mask.rects;
      if (
        rects.every((rect, index) => {
          const current = target.current[index];
          return current !== undefined && sameLiveMaskRect(rect, current);
        })
      )
        continue;
      drawPlateMaskClip(target.clip, { ...target.mask, rects });
      target.current = rects;
    }
  };
}
