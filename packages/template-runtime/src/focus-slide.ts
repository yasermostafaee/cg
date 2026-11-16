import { frameTransitionProgress, type FrameTransitionPhase } from '@cg/shared-schema';
import type { RuntimeClock } from './types.js';

/**
 * Render both authored solo looks during one native mixer segment. Clip each to
 * its part of the stationary aperture, with the complete picture-relative
 * artwork moving inside that clip.
 */
export function animateFocusSlide(
  outgoing: HTMLElement,
  incoming: HTMLElement,
  phase: FrameTransitionPhase,
  clock?: RuntimeClock,
): (() => void) | undefined {
  const slide = phase.focusSlide;
  const priorStage = outgoing.firstElementChild as HTMLElement | null;
  const nextStage = incoming.firstElementChild as HTMLElement | null;
  if (
    slide === undefined ||
    !priorStage?.classList.contains('cg-comp-inner') ||
    !nextStage?.classList.contains('cg-comp-inner')
  )
    return undefined;
  const { viewport, axis, sign, mode, fromProgress, toProgress } = slide;
  const view = outgoing.ownerDocument.defaultView;
  const now = clock?.now ?? (() => view?.performance.now() ?? 0);
  const raf = clock?.raf ?? view?.requestAnimationFrame?.bind(view);
  const cancelRaf = clock?.cancel ?? view?.cancelAnimationFrame?.bind(view);
  const startAt = now() + (phase.delayMs ?? 0);
  const horizontal = axis === 'x';
  const travel = horizontal ? viewport.width : viewport.height;
  const left = viewport.x;
  const top = viewport.y;
  const right = left + viewport.width;
  const bottom = top + viewport.height;
  const oldDisplay = incoming.style.display;
  const oldIncomingClip = incoming.style.clipPath;
  const oldOutgoingClip = outgoing.style.clipPath;
  const oldIncomingTransform = nextStage.style.transform;
  const oldOutgoingTransform = priorStage.style.transform;
  const translate = (delta: number, original: string) =>
    `translate${horizontal ? 'X' : 'Y'}(${String(delta)}px)${original === '' ? '' : ' ' + original}`;
  const clip = (first: number, last: number): string => {
    const x = horizontal ? first : left;
    const y = horizontal ? top : first;
    const endX = horizontal ? last : right;
    const endY = horizontal ? bottom : last;
    return `polygon(${String(x)}px ${String(y)}px, ${String(endX)}px ${String(y)}px, ${String(endX)}px ${String(endY)}px, ${String(x)}px ${String(endY)}px)`;
  };
  const first = horizontal ? left : top;
  const last = horizontal ? right : bottom;
  let handle: number | undefined;
  const render = (time: number): void => {
    const elapsed = time - startAt;
    const fraction =
      raf === undefined || (phase.durationMs === 0 && elapsed >= 0)
        ? 1
        : elapsed <= 0
          ? 0
          : Math.min(1, elapsed / phase.durationMs);
    const progress =
      fromProgress + (toProgress - fromProgress) * frameTransitionProgress(phase.easing, fraction);
    const edge = sign < 0 ? first + travel * progress : last - travel * progress;
    incoming.style.display = '';
    incoming.style.clipPath = sign < 0 ? clip(first, edge) : clip(edge, last);
    outgoing.style.clipPath = sign < 0 ? clip(edge, last) : clip(first, edge);
    nextStage.style.transform = translate(sign * travel * (1 - progress), oldIncomingTransform);
    if (mode === 'push')
      priorStage.style.transform = translate(-sign * travel * progress, oldOutgoingTransform);
    if (fraction < 1 && raf !== undefined) handle = raf(render);
  };
  render(now());
  return () => {
    if (handle !== undefined) cancelRaf?.(handle);
    incoming.style.display = oldDisplay;
    incoming.style.clipPath = oldIncomingClip;
    outgoing.style.clipPath = oldOutgoingClip;
    nextStage.style.transform = oldIncomingTransform;
    priorStage.style.transform = oldOutgoingTransform;
  };
}
