import {
  composeAffine,
  framePlacementFits,
  frameTransitionProgress,
  invertAffine,
  transformToParent,
  type Affine,
  type FlatElement,
  type FrameTransitionPhase,
  type LiveFramePlacement,
  type LiveFrameTarget,
} from '@cg/shared-schema';
import type { RuntimeClock } from './types.js';

interface FramePlacementRenderer {
  apply(placements: readonly LiveFramePlacement[], lookId: string | undefined): void;
  animate(phase: FrameTransitionPhase, lookId: string | undefined): void;
  cancel(): void;
}

export function createFramePlacementRenderer(
  container: HTMLElement,
  flattened: readonly FlatElement[],
  targets: ReadonlyMap<string, LiveFrameTarget>,
  clock?: RuntimeClock,
): FramePlacementRenderer {
  const view = container.ownerDocument.defaultView;
  const now = clock?.now ?? (() => view?.performance.now() ?? 0);
  const raf = clock?.raf ?? view?.requestAnimationFrame?.bind(view);
  const cancelRaf = clock?.cancel ?? view?.cancelAnimationFrame?.bind(view);
  const authored = new Map(flattened.map((entry) => [entry.key, entry]));
  const wrappers = new Map(
    Array.from(
      container.querySelectorAll<HTMLElement>('[data-cg-frame-artwork]'),
      (wrapper) => [wrapper.dataset['cgFrameArtwork'], wrapper] as const,
    ),
  );

  function matrixFor(
    placement: LiveFramePlacement,
  ): { wrapper: HTMLElement; matrix: Affine } | null {
    const target = targets.get(placement.frameKey);
    if (target === undefined) return null;
    const plate = authored.get(target.frameKey);
    const artwork = authored.get(target.artworkKey);
    const wrapper = wrappers.get(target.artworkKey);
    if (plate === undefined || artwork === undefined || wrapper === undefined) return null;
    if (!framePlacementFits(placement, plate.rect, target.resize, target.move !== false))
      return null;
    const matrix = placementTransform(plate, artwork, placement.rect);
    return matrix === null ? null : { wrapper, matrix };
  }

  // Only move the wrapper. The authored nodes retain their own animations and media.
  function paint(wrapper: HTMLElement, matrix: Affine): void {
    wrapper.style.position = 'absolute';
    wrapper.style.transform = `matrix(${[matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].join(',')})`;
  }

  let animation: { handle?: number } | undefined;
  const cancel = (): void => {
    if (animation?.handle !== undefined) cancelRaf?.(animation.handle);
    animation = undefined;
  };

  return {
    cancel,
    apply(placements, lookId) {
      cancel();
      for (const wrapper of wrappers.values()) {
        wrapper.style.position = '';
        wrapper.style.transform = '';
        wrapper.style.opacity = '';
      }
      for (const placement of placements) {
        if (placement.lookId !== lookId) continue;
        const value = matrixFor(placement);
        if (value !== null) paint(value.wrapper, value.matrix);
      }
    },
    animate(phase, lookId) {
      cancel();
      const motion = phase.frames.flatMap(
        ({ frameKey, lookId: frameLook, from, to, fromOpacity, toOpacity }) => {
          if (frameLook !== lookId) return [];
          const start = matrixFor({ frameKey, lookId: frameLook, rect: from });
          const end = matrixFor({ frameKey, lookId: frameLook, rect: to });
          return start === null || end === null
            ? []
            : [
                {
                  wrapper: start.wrapper,
                  from: start.matrix,
                  to: end.matrix,
                  fromOpacity,
                  toOpacity,
                },
              ];
        },
      );
      if (motion.length === 0) return;
      const startAt = now() + (phase.delayMs ?? 0);
      const active: { handle?: number } = {};
      const render = (time: number): void => {
        if (animation !== active) return;
        const elapsed = time - startAt;
        const progress =
          raf === undefined || (phase.durationMs === 0 && elapsed >= 0)
            ? 1
            : elapsed <= 0
              ? 0
              : Math.min(1, elapsed / phase.durationMs);
        const eased = frameTransitionProgress(phase.easing, progress);
        for (const { wrapper, from, to, fromOpacity, toOpacity } of motion) {
          paint(wrapper, interpolateMatrix(from, to, eased));
          const opacity = interpolate(fromOpacity, toOpacity, eased);
          wrapper.style.opacity = opacity === 1 ? '' : String(opacity);
        }
        if (progress === 1) animation = undefined;
        else if (raf !== undefined) active.handle = raf(render);
      };
      animation = active;
      render(now());
    },
  };
}

function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function interpolateMatrix(from: Affine, to: Affine, progress: number): Affine {
  return {
    a: interpolate(from.a, to.a, progress),
    b: interpolate(from.b, to.b, progress),
    c: interpolate(from.c, to.c, progress),
    d: interpolate(from.d, to.d, progress),
    e: interpolate(from.e, to.e, progress),
    f: interpolate(from.f, to.f, progress),
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
