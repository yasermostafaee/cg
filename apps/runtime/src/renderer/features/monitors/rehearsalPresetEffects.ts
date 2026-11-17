import {
  frameTransitionPhases,
  presetDepartureRect,
  presetTransitionDurations,
  type FrameTransition,
  type FrameTransitionPhase,
  type LiveFrameTarget,
  type LiveSourceRect,
} from '@cg/shared-schema';
import type { TemplateLook } from '@cg/shared-ipc';
import type { PlatePlacement } from './livePlateGeometry.js';

interface PresetView {
  look: TemplateLook;
  rects: Readonly<Record<string, LiveSourceRect>>;
  plates: readonly PlatePlacement[];
}

function artworkGroups(
  look: TemplateLook,
  changing: ReadonlySet<string>,
  opacity: Pick<ArtworkOpacity, 'fromOpacity' | 'toOpacity'>,
): ArtworkOpacity[] {
  const groups = Object.entries(look.transitionDepartureGroups ?? {}).filter(
    ([, ids]) => ids.length > 0 && ids.every((id) => changing.has(id)),
  );
  return groups.flatMap(([key]) =>
    groups.some(([parent]) => key.startsWith(parent + '/'))
      ? []
      : [{ key, lookId: look.id, ...opacity }],
  );
}

function blendRect(from: LiveSourceRect, to: LiveSourceRect, progress: number): LiveSourceRect {
  return {
    x: from.x + progress * (to.x - from.x),
    y: from.y + progress * (to.y - from.y),
    width: from.width + progress * (to.width - from.width),
    height: from.height + progress * (to.height - from.height),
  };
}

function sameRect(a: LiveSourceRect, b: LiveSourceRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

type ArtworkOpacity = NonNullable<FrameTransitionPhase['opacityArtwork']>[number];
type FrameMove = Pick<
  FrameTransitionPhase['frames'][number],
  'frameKey' | 'lookId' | 'from' | 'to'
>;

function movementPhases(
  moves: readonly FrameMove[],
  effect: FrameTransition,
  ticks: number,
  periodMs = 1,
): FrameTransitionPhase[] {
  if (ticks === 0 || moves.length === 0) return [];
  let progress = 0;
  let opacity = 1;
  return frameTransitionPhases(effect, ticks).map((step) => {
    const phase = {
      durationMs: step.frames * periodMs,
      easing: step.easing,
      frames: moves.map(({ from, to, ...frame }) => ({
        ...frame,
        from: blendRect(from, to, progress),
        to: blendRect(from, to, step.progress),
        fromOpacity: opacity,
        toOpacity: step.opacity,
      })),
    };
    progress = step.progress;
    opacity = step.opacity;
    return phase;
  });
}

export function rehearsalPlacementPhases(
  lookId: string | undefined,
  targets: Readonly<Record<string, LiveFrameTarget>>,
  before: Readonly<Record<string, LiveSourceRect>>,
  after: Readonly<Record<string, LiveSourceRect>>,
  effect: FrameTransition,
): FrameTransitionPhase[] {
  const moves = Object.entries(targets).flatMap(([plateId, target]) => {
    const from = before[plateId];
    const to = after[plateId];
    return from === undefined || to === undefined || sameRect(from, to)
      ? []
      : [{ frameKey: target.frameKey, ...(lookId === undefined ? {} : { lookId }), from, to }];
  });
  return movementPhases(moves, effect, effect.durationMs);
}

interface PresetPlan {
  exit: FrameTransitionPhase[];
  enter?: FrameTransitionPhase | undefined;
  prepareEnter?: FrameTransitionPhase;
  retained: string[];
}

function slidingArtworkFrames(
  view: PresetView,
  groups: readonly ArtworkOpacity[],
  direction: FrameTransition['exitDirection'],
  raster: Pick<LiveSourceRect, 'width' | 'height'>,
  arriving = false,
): FrameTransitionPhase['frames'] {
  if (direction === undefined) return [];
  return groups.flatMap(({ key }) => {
    const routes = view.look.transitionDepartureGroups?.[key] ?? [];
    const frames = routes.flatMap((plateId) => {
      const rect = view.rects[plateId];
      const artwork = view.look.transitionFrames?.[plateId];
      if (rect === undefined || artwork === undefined) return [];
      const offstage = presetDepartureRect(rect, direction, raster);
      return [
        {
          frameKey: artwork.frameKey,
          lookId: view.look.id,
          from: arriving ? offstage : rect,
          to: arriving ? rect : offstage,
          fromOpacity: 1,
          toOpacity: 1,
        },
      ];
    });
    return frames.length === routes.length ? frames : [];
  });
}

/** The picture and its artwork share each preset's normal placement animation. */
export function rehearsalPresetPlan(
  before: PresetView,
  after: PresetView,
  effect: FrameTransition,
  periodMs: number,
  holdTitles: boolean,
  raster: Pick<LiveSourceRect, 'width' | 'height'>,
): PresetPlan | undefined {
  const oldInputs = new Map(before.plates.map(({ plateId, sourceId }) => [plateId, sourceId]));
  const newInputs = new Map(after.plates.map(({ plateId, sourceId }) => [plateId, sourceId]));
  const retainedIds = new Set<string>();
  const retained: string[] = [];
  const shared = Object.entries(before.look.transitionFrames ?? {}).flatMap(([id, prior]) => {
    const next = after.look.transitionFrames?.[id];
    const from = before.rects[id];
    const to = after.rects[id];
    if (
      next === undefined ||
      prior.elementId !== next.elementId ||
      prior.artworkId !== next.artworkId ||
      from === undefined ||
      to === undefined ||
      oldInputs.get(id) !== newInputs.get(id)
    ) {
      return [];
    }
    retainedIds.add(id);
    retained.push(prior.frameKey);
    return [{ frameKey: prior.frameKey, lookId: before.look.id, from, to }];
  });
  const departing = new Set(
    Object.keys(before.look.transitionFrames ?? {}).filter((id) => !retainedIds.has(id)),
  );
  const arriving = new Set(
    Object.keys(after.look.transitionFrames ?? {}).filter((id) => !retainedIds.has(id)),
  );
  const outgoing = artworkGroups(before.look, departing, { fromOpacity: 1, toOpacity: 0 });
  const incoming = artworkGroups(after.look, arriving, { fromOpacity: 0, toOpacity: 1 });
  const moves = shared.filter(({ from, to }) => effect.fade || !sameRect(from, to));
  const ticks = presetTransitionDurations(effect.durationMs / periodMs, {
    exit: outgoing.length > 0,
    move: moves.length > 0 && (effect.motion !== 'cut' || effect.fade),
    enter: incoming.length > 0,
  });
  if (ticks.exit + ticks.move + ticks.enter === 0) return undefined;
  const titlePlateIds = [...new Set([...Object.keys(before.rects), ...Object.keys(after.rects)])];
  const titleHold =
    holdTitles && titlePlateIds.length > 0 ? { hidePresetTitlePlateIds: titlePlateIds } : {};
  const exit: FrameTransitionPhase[] = [];
  if (ticks.exit > 0) {
    const departingFrames = slidingArtworkFrames(before, outgoing, effect.exitDirection, raster);
    exit.push({
      authoredPreset: true,
      destinationLookId: after.look.id,
      ...titleHold,
      durationMs: ticks.exit * periodMs,
      easing: 'linear',
      frames: [
        ...shared.map(({ from, ...frame }) => ({
          ...frame,
          from,
          to: from,
          fromOpacity: 1,
          toOpacity: 1,
        })),
        ...(shared.length + departingFrames.length <= 128 ? departingFrames : []),
      ],
      opacityArtwork: outgoing,
    });
  }
  for (const phase of movementPhases(moves, effect, ticks.move, periodMs)) {
    exit.push({
      ...phase,
      authoredPreset: true,
      destinationLookId: after.look.id,
      ...titleHold,
      ...(outgoing.length > 0 && { hidePresetArtworkKeys: outgoing.map(({ key }) => key) }),
    });
  }
  const arrivingFrames =
    ticks.enter > 0
      ? slidingArtworkFrames(after, incoming, effect.enterDirection, raster, true)
      : [];
  const slideArrival = arrivingFrames.length > 0 && arrivingFrames.length <= 128;
  return {
    exit,
    enter:
      ticks.enter === 0 && titleHold.hidePresetTitlePlateIds === undefined
        ? undefined
        : {
            authoredPreset: true,
            ...titleHold,
            durationMs: ticks.enter * periodMs,
            easing: 'linear',
            frames: slideArrival ? arrivingFrames : [],
            ...(ticks.enter > 0 && { opacityArtwork: incoming }),
          },
    ...(slideArrival && {
      prepareEnter: {
        authoredPreset: true,
        ...titleHold,
        durationMs: 0,
        easing: 'linear',
        frames: [],
        opacityArtwork: incoming.map((group) => ({ ...group, toOpacity: 0 })),
      },
    }),
    retained,
  };
}

/** Queue browser-local page updates. A replacement can cancel without committing the old target. */
export function runRehearsalEffect(
  entries: readonly (() => number)[],
  settled: (commit: boolean) => void,
): (commit?: boolean) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cursor = 0;
  let done = false;
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    settled(commit);
  };
  const next = () => {
    while (cursor < entries.length && !done) {
      const delay = entries[cursor++]?.() ?? 0;
      if (delay > 0) {
        timer = setTimeout(next, delay);
        return;
      }
    }
    finish(true);
  };
  next();
  return (commit = false) => finish(commit);
}

/** The deepest authored artwork wrapper that owns a frame's path. */
export function presetFrameArtwork(
  wrappers: Iterable<HTMLElement>,
  path: string,
): HTMLElement | undefined {
  let result: HTMLElement | undefined;
  let depth = 0;
  for (const wrapper of wrappers) {
    const key = wrapper.dataset['cgFrameArtwork'];
    if (key !== undefined && key.length > depth && (path === key || path.startsWith(key + '/'))) {
      result = wrapper;
      depth = key.length;
    }
  }
  return result;
}

/** Lift only the retained branches above the departing artwork in a local rehearsal. */
export function retainPresetArtwork(doc: Document, plan: PresetPlan): () => void {
  const restore: (() => void)[] = [];
  const wrappers = doc.querySelectorAll<HTMLElement>('[data-cg-frame-artwork]');
  const departingKeys = new Set((plan.exit[0]?.opacityArtwork ?? []).map(({ key }) => key));
  const departing = Array.from(
    doc.querySelectorAll<HTMLElement>('[data-cg-preset-departure-key]'),
  ).filter((node) => departingKeys.has(node.dataset['cgPresetDepartureKey'] ?? ''));
  const lifted = new Set<HTMLElement>();
  for (const frame of plan.retained) {
    const current = presetFrameArtwork(wrappers, frame);
    if (current === undefined) continue;
    if (departing.length === 0) continue;
    for (
      let node: HTMLElement | null = current;
      node !== null && !departing.some((branch) => branch === node || node?.contains(branch));
      node = node.parentElement
    ) {
      if (
        lifted.has(node) ||
        (node !== current &&
          node.style.position !== 'absolute' &&
          !node.classList.contains('cg-element') &&
          !node.hasAttribute('data-cg-frame-artwork'))
      )
        continue;
      const zIndex = node.style.zIndex;
      node.style.zIndex = '2147483647';
      lifted.add(node);
      restore.push(() => {
        node.style.zIndex = zIndex;
      });
    }
  }
  return () => {
    for (const reset of restore.reverse()) reset();
  };
}
