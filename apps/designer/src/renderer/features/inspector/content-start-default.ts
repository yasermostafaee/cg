import type { Element, Layer } from '@cg/shared-schema';

/**
 * D-104 follow-up — the content-start marker's DEFAULT frame: the LATEST entrance keyframe
 * strictly inside `(activeIn, outPoint)` across the document's animated elements — i.e.
 * where the entrance has finished moving. Falls back to `outPoint` when there is no
 * entrance to settle (a continuous in→out animation, or none).
 *
 * EXTRACTED (media-phases-follow-composition) from `PlayoutSection`'s pin affordance so the
 * follow hint derives its entrance span from the SAME default — one definition, two callers
 * (the session-P rule: extract, do not copy).
 *
 * ⚠ KNOWN LIMITATION, pre-existing and deliberate: this mirror walks KEYFRAMES ONLY. The
 * runtime's `entranceSettleFrame()` additionally folds in phase-marked Lotties' derived
 * settles, so for a marker-less scene whose entrance is Lottie furniture the two can
 * differ — the marker, once pinned/placed, is the deterministic source of truth either
 * way, and a FOLLOW-source element contributes `null` to the runtime heuristic, so this
 * gap is never widened by follow. Extending the mirror is its own decision, not smuggled
 * in here.
 */
export function contentStartDefaultFrom(
  layers: readonly Layer[],
  activeIn: number,
  outPoint: number,
): number {
  let settle = -1;
  const walk = (els: readonly Element[]): void => {
    for (const el of els) {
      if (el.animation !== undefined) {
        for (const track of Object.values(el.animation.tracks)) {
          if (track === undefined) continue;
          for (const kf of track.keyframes) {
            if (kf.frame > activeIn && kf.frame < outPoint && kf.frame > settle) settle = kf.frame;
          }
        }
      }
      if (el.type === 'container') walk(el.children);
    }
  };
  for (const layer of layers) walk(layer.children);
  return settle < 0 ? outPoint : settle;
}
