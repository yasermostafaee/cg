import { frameTransitionProgress, type FrameTransitionPhase } from '@cg/shared-schema';
import type { RuntimeClock } from './types.js';
import { createPlateDepthMask } from './plate-depth-mask.js';

/** Animate each complete focus root, including every caption and imported graphic. */
export function animateFocusArtwork(
  outgoing: HTMLElement,
  incoming: HTMLElement,
  phase: FrameTransitionPhase,
  clock?: RuntimeClock,
): (() => void) | undefined {
  const artwork = phase.focusArtwork;
  const oldStage = outgoing.firstElementChild as HTMLElement | null;
  const newStage = incoming.firstElementChild as HTMLElement | null;
  if (
    artwork === undefined ||
    !oldStage?.classList.contains('cg-comp-inner') ||
    !newStage?.classList.contains('cg-comp-inner')
  )
    return undefined;
  const view = outgoing.ownerDocument.defaultView;
  const now = clock?.now ?? (() => view?.performance.now() ?? 0);
  const raf = clock?.raf ?? view?.requestAnimationFrame?.bind(view);
  const cancelRaf = clock?.cancel ?? view?.cancelAnimationFrame?.bind(view);
  const saved = [oldStage, newStage].map((stage) => ({
    transform: stage.style.transform,
    origin: stage.style.transformOrigin,
    opacity: stage.style.opacity,
  }));
  const display = incoming.style.display;
  const zIndices = [outgoing.style.zIndex, incoming.style.zIndex];
  const top = Math.max(...zIndices.map((value) => Number.parseInt(value, 10) || 0)) + 1;
  outgoing.style.zIndex = String(artwork.incomingAbove ? top : top + 1);
  incoming.style.zIndex = String(artwork.incomingAbove ? top + 1 : top);
  const sides = [
    { frameKey: 'outgoing', ...artwork.outgoing },
    { frameKey: 'incoming', ...artwork.incoming },
  ];
  const stack = artwork.incomingAbove ? sides : [...sides].reverse();
  // Focus instances share the scene coordinate plane. Mask their outer roots so
  // the moving inner transforms cannot drag the upper picture's aperture away.
  const depth = createPlateDepthMask(
    outgoing.parentElement ?? outgoing,
    stack,
    (key) => (key === 'outgoing' ? outgoing : incoming),
    () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  );
  const start = now() + (phase.delayMs ?? 0);
  const interpolate = (from: number, to: number, progress: number) => from + (to - from) * progress;
  const paint = (
    stage: HTMLElement,
    side: typeof artwork.outgoing,
    original: string,
    progress: number,
  ) => {
    const width = interpolate(side.from.width, side.to.width, progress);
    const height = interpolate(side.from.height, side.to.height, progress);
    const sx = width / side.base.width;
    const sy = height / side.base.height;
    const dx = interpolate(side.from.x, side.to.x, progress) - side.base.x * sx;
    const dy = interpolate(side.from.y, side.to.y, progress) - side.base.y * sy;
    stage.style.transformOrigin = '0 0';
    stage.style.transform = `matrix(${[sx, 0, 0, sy, dx, dy].join(',')})${original === '' ? '' : ' ' + original}`;
    stage.style.opacity = String(interpolate(side.fromOpacity, side.toOpacity, progress));
  };
  let handle: number | undefined;
  const render = (time: number) => {
    const elapsed = time - start;
    const sample =
      phase.mixerFrameMs === undefined
        ? elapsed
        : Math.floor(elapsed / phase.mixerFrameMs) * phase.mixerFrameMs;
    const fraction =
      raf === undefined || (phase.durationMs === 0 && elapsed >= 0)
        ? 1
        : elapsed <= 0
          ? 0
          : Math.min(1, sample / phase.durationMs);
    const progress = frameTransitionProgress(phase.easing, fraction);
    incoming.style.display = '';
    paint(oldStage, artwork.outgoing, saved[0]?.transform ?? '', progress);
    paint(newStage, artwork.incoming, saved[1]?.transform ?? '', progress);
    depth.paint(progress);
    if (fraction < 1 && raf !== undefined) handle = raf(render);
  };
  render(now());
  return () => {
    if (handle !== undefined) cancelRaf?.(handle);
    depth.clear();
    incoming.style.display = display;
    outgoing.style.zIndex = zIndices[0] ?? '';
    incoming.style.zIndex = zIndices[1] ?? '';
    for (const [index, stage] of [oldStage, newStage].entries()) {
      stage.style.transform = saved[index]?.transform ?? '';
      stage.style.transformOrigin = saved[index]?.origin ?? '';
      stage.style.opacity = saved[index]?.opacity ?? '';
    }
  };
}
