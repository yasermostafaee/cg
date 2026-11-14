import {
  frameTransitionPhases,
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

type ArtworkOpacity = NonNullable<FrameTransitionPhase['opacityArtwork']>[number];
type FrameMove = Pick<
  FrameTransitionPhase['frames'][number],
  'frameKey' | 'lookId' | 'from' | 'to'
>;

function movementPhases(
  moves: readonly FrameMove[],
  effect: FrameTransition,
  duration: number,
): FrameTransitionPhase[] {
  if (duration === 0 || moves.length === 0) return [];
  let progress = 0;
  let opacity = 1;
  return frameTransitionPhases(effect, duration).map((step) => {
    const phase = {
      durationMs: step.frames,
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
    return from === undefined ||
      to === undefined ||
      (from.x === to.x && from.y === to.y && from.width === to.width && from.height === to.height)
      ? []
      : [{ frameKey: target.frameKey, ...(lookId === undefined ? {} : { lookId }), from, to }];
  });
  return movementPhases(moves, effect, effect.durationMs);
}

interface PresetPlan {
  exit: FrameTransitionPhase[];
  enter: FrameTransitionPhase[];
  retained: string[];
}

/** The outgoing picture and its artwork share the page's normal placement animation. */
export function rehearsalPresetPlan(
  before: PresetView,
  after: PresetView,
  effect: FrameTransition,
): PresetPlan | undefined {
  const oldInputs = new Map(before.plates.map(({ plateId, sourceId }) => [plateId, sourceId]));
  const newInputs = new Map(after.plates.map(({ plateId, sourceId }) => [plateId, sourceId]));
  const retainedIds = new Set<string>();
  const retained: string[] = [];
  const moves = Object.entries(before.look.transitionFrames ?? {}).flatMap(([id, prior]) => {
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
  const duration = presetTransitionDurations(effect.durationMs, {
    exit: outgoing.length > 0,
    move:
      moves.length > 0 &&
      (effect.motion !== 'cut' || (effect.fade && outgoing.length === 0 && incoming.length === 0)),
    enter: incoming.length > 0,
  });
  if (duration.exit + duration.move + duration.enter === 0) return undefined;
  const exit: FrameTransitionPhase[] = [];
  if (duration.exit > 0) {
    exit.push({
      authoredPreset: true,
      destinationLookId: after.look.id,
      durationMs: duration.exit,
      easing: 'linear',
      frames: moves.map(({ from, ...frame }) => ({
        ...frame,
        from,
        to: from,
        fromOpacity: 1,
        toOpacity: 1,
      })),
      opacityArtwork: outgoing,
    });
  }
  const movement = outgoing.length + incoming.length === 0 ? effect : { ...effect, fade: false };
  for (const phase of movementPhases(moves, movement, duration.move)) {
    exit.push({
      ...phase,
      authoredPreset: true,
      destinationLookId: after.look.id,
      ...(outgoing.length > 0 && { hidePresetArtworkKeys: outgoing.map(({ key }) => key) }),
    });
  }
  return {
    exit,
    enter:
      duration.enter === 0
        ? []
        : [
            {
              authoredPreset: true,
              durationMs: duration.enter,
              easing: 'linear',
              frames: [],
              opacityArtwork: incoming,
            },
          ],
    retained,
  };
}

/** Queue browser-local page updates; replacing or stopping a cue settles the actual target. */
export function runRehearsalEffect(
  entries: readonly (() => number)[],
  settled: () => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cursor = 0;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    settled();
  };
  const next = () => {
    while (cursor < entries.length && !done) {
      const delay = entries[cursor++]?.() ?? 0;
      if (delay > 0) {
        timer = setTimeout(next, delay);
        return;
      }
    }
    finish();
  };
  next();
  return finish;
}

/** Lift only the retained branches above the departing artwork in a local rehearsal. */
export function retainPresetArtwork(doc: Document, plan: PresetPlan): () => void {
  const restore: (() => void)[] = [];
  const wrappers = Array.from(doc.querySelectorAll<HTMLElement>('[data-cg-frame-artwork]'));
  const wrapperFor = (path: string): HTMLElement | undefined =>
    wrappers
      .flatMap((wrapper) => {
        const key = wrapper.dataset['cgFrameArtwork'];
        return key !== undefined && (path === key || path.startsWith(key + '/'))
          ? [{ wrapper, length: key.length }]
          : [];
      })
      .sort((a, b) => b.length - a.length)[0]?.wrapper;
  const departingKeys = new Set((plan.exit[0]?.opacityArtwork ?? []).map(({ key }) => key));
  const departing = Array.from(
    doc.querySelectorAll<HTMLElement>('[data-cg-preset-departure-key]'),
  ).filter((node) => departingKeys.has(node.dataset['cgPresetDepartureKey'] ?? ''));
  const lifted = new Set<HTMLElement>();
  for (const frame of plan.retained) {
    const current = wrapperFor(frame);
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
