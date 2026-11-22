import {
  composeAffine,
  framePlacementFits,
  frameTransitionProgress,
  IDENTITY_AFFINE,
  invertAffine,
  transformToParent,
  type Affine,
  type FlatElement,
  type FrameTransitionPhase,
  type LiveFramePlacement,
  type LiveFrameTarget,
} from '@cg/shared-schema';
import type { RuntimeClock } from './types.js';
import { createPlateDepthMask } from './plate-depth-mask.js';

export const PLATE_EDGES_MOTION_RATIO = '--cg-plate-edges-motion-ratio';

interface FramePlacementRenderer {
  apply(placements: readonly LiveFramePlacement[], lookId: string | undefined): void;
  animate(phase: FrameTransitionPhase, lookId: string | undefined, look?: HTMLElement): void;
  cancel(): void;
}

export function createFramePlacementRenderer(
  container: HTMLElement,
  flattened: readonly FlatElement[],
  targets: ReadonlyMap<string, LiveFrameTarget>,
  presetTargets: ReadonlyMap<string, LiveFrameTarget>,
  clock?: RuntimeClock,
): FramePlacementRenderer {
  const view = container.ownerDocument.defaultView;
  const now = clock?.now ?? (() => view?.performance.now() ?? 0);
  const raf = clock?.raf ?? view?.requestAnimationFrame?.bind(view);
  const cancelRaf = clock?.cancel ?? view?.cancelAnimationFrame?.bind(view);
  const authored = new Map(flattened.map((entry) => [entry.key, entry]));
  const painted = new Map<HTMLElement, Affine>();
  const wrappers = new Map(
    Array.from(
      container.querySelectorAll<HTMLElement>('[data-cg-frame-artwork]'),
      (wrapper) => [wrapper.dataset['cgFrameArtwork'], wrapper] as const,
    ),
  );
  const plateEdgeWrappers = new Set(
    [...wrappers.values()].filter(
      (wrapper) => wrapper.querySelector('[data-cg-layout-plate-edges]') !== null,
    ),
  );
  const groupWrappers = new Map(
    Array.from(
      container.querySelectorAll<HTMLElement>('[data-cg-preset-departure-key]'),
      (wrapper) => [wrapper.dataset['cgPresetDepartureKey'], wrapper] as const,
    ),
  );

  function matrixFor(
    placement: LiveFramePlacement,
    authoredPreset = false,
  ): { wrapper: HTMLElement; matrix: Affine } | null {
    const target = (authoredPreset ? presetTargets : targets).get(placement.frameKey);
    if (target === undefined) return null;
    const plate = authored.get(target.frameKey);
    const artwork = authored.get(target.artworkKey);
    const wrapper = wrappers.get(target.artworkKey);
    if (plate === undefined || artwork === undefined || wrapper === undefined) return null;
    // A preset phase interpolates between already authored layouts. Its endpoints can
    // differ even when Designer locks the operator's arbitrary resize and move.
    if (
      !framePlacementFits(
        placement,
        plate.rect,
        authoredPreset ? 'free' : target.resize,
        authoredPreset || target.move !== false,
      )
    ) {
      return null;
    }
    const matrix = placementTransform(plate, artwork, placement.rect);
    return matrix === null ? null : { wrapper, matrix };
  }

  // Only move the wrapper. The authored nodes retain their own animations and media.
  function paint(wrapper: HTMLElement, matrix: Affine): void {
    painted.set(wrapper, matrix);
    wrapper.style.position = 'absolute';
    wrapper.style.transform = `matrix(${[matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].join(',')})`;
    if (plateEdgeWrappers.has(wrapper) && matrix.a !== 0) {
      wrapper.style.setProperty(PLATE_EDGES_MOTION_RATIO, String(Math.abs(matrix.d / matrix.a)));
    }
  }

  let animation: { handle?: number } | undefined;
  let depthMask: ReturnType<typeof createPlateDepthMask> | undefined;
  let restoreDecorations: (() => void) | undefined;
  const cancel = (): void => {
    depthMask?.clear();
    depthMask = undefined;
    restoreDecorations?.();
    restoreDecorations = undefined;
    if (animation?.handle !== undefined) cancelRaf?.(animation.handle);
    animation = undefined;
  };

  return {
    cancel,
    apply(placements, lookId) {
      cancel();
      painted.clear();
      for (const wrapper of wrappers.values()) {
        wrapper.style.position = '';
        wrapper.style.transform = '';
        wrapper.style.opacity = '';
      }
      for (const wrapper of plateEdgeWrappers)
        wrapper.style.removeProperty(PLATE_EDGES_MOTION_RATIO);
      for (const wrapper of groupWrappers.values()) wrapper.style.opacity = '';
      for (const placement of placements) {
        if (placement.lookId !== lookId) continue;
        const value = matrixFor(placement);
        if (value !== null) paint(value.wrapper, value.matrix);
      }
    },
    animate(phase, lookId, look) {
      cancel();
      const motion = phase.frames.flatMap(
        ({ frameKey, lookId: frameLook, from, to, fromOpacity, toOpacity }) => {
          if (frameLook !== lookId) return [];
          const start = matrixFor(
            { frameKey, lookId: frameLook, rect: from },
            phase.authoredPreset,
          );
          const end = matrixFor({ frameKey, lookId: frameLook, rect: to }, phase.authoredPreset);
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
      const groups = (phase.opacityArtwork ?? []).flatMap(({ key, lookId: id, ...opacity }) => {
        const wrapper = groupWrappers.get(key);
        return id === lookId && wrapper !== undefined ? [{ wrapper, ...opacity }] : [];
      });
      const fades = plateDecorationFades(look, phase.decorationOpacity);
      if (fades.length > 0) {
        restoreDecorations = () => {
          for (const { node, opacity } of fades) {
            node.style.opacity = opacity;
            node.removeAttribute('data-cg-decoration-fade');
          }
        };
      }
      if (phase.plateStack !== undefined) {
        const targetOf = (key: string) => {
          const target = presetTargets.get(key);
          return target === undefined ? undefined : wrappers.get(target.artworkKey);
        };
        depthMask = createPlateDepthMask(container, phase.plateStack, targetOf, (key) => {
          const target = presetTargets.get(key);
          const art = target && authored.get(target.artworkKey);
          const wrapper = targetOf(key);
          if (art === undefined || wrapper === undefined) return null;
          const elementInverse = invertAffine(transformToParent(art.element.transform));
          if (elementInverse === null) return null;
          const parent = composeAffine(art.toScene, elementInverse);
          return invertAffine(composeAffine(parent, painted.get(wrapper) ?? IDENTITY_AFFINE));
        });
      }
      if (
        motion.length === 0 &&
        groups.length === 0 &&
        fades.length === 0 &&
        depthMask === undefined
      )
        return;
      const startAt = now() + (phase.delayMs ?? 0);
      const active: { handle?: number } = {};
      const render = (): void => {
        if (animation !== active) return;
        // CasparCG's offscreen renderer supplies an external begin-frame timestamp.
        // Measure both ends of the interval with the same monotonic page clock.
        const elapsed = now() - startAt;
        const frameMs = phase.mixerFrameMs;
        const sample = frameMs === undefined ? elapsed : Math.floor(elapsed / frameMs) * frameMs;
        const progress =
          raf === undefined || elapsed >= phase.durationMs
            ? 1
            : elapsed <= 0
              ? 0
              : sample / phase.durationMs;
        const eased = frameTransitionProgress(phase.easing, progress);
        for (const { wrapper, from, to, fromOpacity, toOpacity } of motion) {
          paint(wrapper, interpolateMatrix(from, to, eased));
          const opacity = interpolate(fromOpacity, toOpacity, eased);
          wrapper.style.opacity = opacity === 1 ? '' : String(opacity);
        }
        for (const { wrapper, fromOpacity, toOpacity } of groups) {
          const opacity = interpolate(fromOpacity, toOpacity, eased);
          wrapper.style.opacity = opacity === 1 ? '' : String(opacity);
        }
        for (const { node, opacity, fromOpacity, toOpacity } of fades) {
          const authoredOpacity = opacity === '' ? 1 : Number(opacity);
          node.style.opacity = String(authoredOpacity * interpolate(fromOpacity, toOpacity, eased));
          node.setAttribute('data-cg-decoration-fade', '');
        }
        depthMask?.paint(eased);
        if (progress === 1) animation = undefined;
        else if (raf !== undefined) active.handle = raf(render);
      };
      animation = active;
      render();
    },
  };
}

function plateDecorationFades(
  look: HTMLElement | undefined,
  fades: FrameTransitionPhase['decorationOpacity'],
) {
  if (look === undefined || fades === undefined) return [];
  const byPlate = new Map(fades.map((fade) => [fade.plateId, fade]));
  return Array.from(
    look.querySelectorAll<HTMLElement>(
      '[data-cg-layout-plate-title], [data-cg-layout-plate-border]',
    ),
  ).flatMap((node) => {
    const border = node.dataset['cgLayoutPlateBorder'];
    const title = node.dataset['cgLayoutPlateTitle'];
    const fade =
      border !== undefined
        ? byPlate.get(border)?.border
        : title === undefined
          ? undefined
          : byPlate.get(title)?.title;
    return fade === undefined ? [] : [{ node, opacity: node.style.opacity, ...fade }];
  });
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
