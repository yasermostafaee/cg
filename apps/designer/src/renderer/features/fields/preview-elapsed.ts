import {
  activeRangeOf,
  followsComposition,
  playoutOf,
  delayMsOf,
  repeatOf,
  type Element,
  type Playout,
  type Scene,
} from '@cg/shared-schema';
import { timingScopeList } from './PreviewScopeTiming.js';

/** The two root lifecycle values an operator may tune for this Preview session. */
export type PreviewRootTimingOverride = Partial<Pick<Playout, 'holdMs' | 'repeat'>>;

function withRootTimingOverride(scene: Scene, override?: PreviewRootTimingOverride): Scene {
  if (override === undefined) return scene;
  const playout = playoutOf(scene);
  return {
    ...scene,
    playout: {
      ...playout,
      ...(override.holdMs === undefined ? {} : { holdMs: override.holdMs }),
      ...(override.repeat === undefined ? {} : { repeat: override.repeat }),
    },
  };
}

/**
 * D-173/B-382 — Runtime-owned roots retain their existing completion policy. Empty/static roots
 * instead follow the authored Preview contract: Static and Freeze cap at nominal duration,
 * Manual Middle loop stays open, and finite Auto-out / Loop-cycle includes Hold and delay.
 */
export function previewElapsedLimitMs(
  scene: Scene,
  rootOverride?: PreviewRootTimingOverride,
): number | null {
  const effectiveScene = withRootTimingOverride(scene, rootOverride);
  const rootPlayout = playoutOf(effectiveScene);
  const range = activeRangeOf(effectiveScene);
  const nominalMs = Math.max(0, ((range.out - range.in) / effectiveScene.frameRate) * 1000);

  // A nested open-ended scope has no single root duration the host can derive. Preserve the real
  // Runtime clock for it. Finite root timing below is safe because every span is root-authored.
  const nestedOpenEnded = timingScopeList(scene).some(({ path, source }) => {
    if (path === '') return false;
    const playout = playoutOf(source);
    return (
      playout.mode === 'loop-cycle' ||
      playout.holdSource === 'content-driven' ||
      (playout.mode === 'manual' && (playout.holdBehavior ?? 'freeze') === 'loop')
    );
  });
  if (nestedOpenEnded || rootPlayout.holdSource === 'content-driven') return null;
  if (rootPlayout.mode === 'static') return nominalMs;
  if (rootPlayout.mode === 'manual') {
    return (rootPlayout.holdBehavior ?? 'freeze') === 'loop' ? null : nominalMs;
  }
  if (rootPlayout.mode === 'loop-cycle' && repeatOf(rootPlayout) === 'infinite') return null;

  return finiteAutoLifecycleLimitMs(effectiveScene);
}

/**
 * A composition with no root frame-dependent paint (empty, or made only from static elements) lets
 * Runtime collapse the render from the first frame to the last. Exposing that optimisation as
 * `00 → 50` makes Preview's authored frame clock useless, so derive the display frame from elapsed
 * rehearsal time in that case. Animated/lifespan-driven roots and content-driven holds keep using
 * Runtime telemetry, including parked holds and authored outro transitions.
 */
export function previewDisplayFrame(
  scene: Scene,
  runtimeFrame: number,
  elapsedMs: number,
  rootOverride?: PreviewRootTimingOverride,
): number {
  return canvasDisplayFrame(withRootTimingOverride(scene, rootOverride), runtimeFrame, elapsedMs);
}

/**
 * B-380 — main-Canvas counterpart to {@link previewDisplayFrame}. Unlike the compact Preview
 * status clock, the timeline cursor mirrors the composition's authored Intro / Hold / Outro shape:
 * Freeze parks, Loop middle wraps, and finite Auto-out / Loop-cycle runs settle at the active end.
 * It is used only when {@link rootUsesAuthoredFrameClock} is true, so no real animated/media frame
 * is ever replaced by this wall-clock projection.
 */
export function canvasDisplayFrame(scene: Scene, runtimeFrame: number, elapsedMs: number): number {
  if (!rootUsesAuthoredFrameClock(scene)) return runtimeFrame;

  const range = activeRangeOf(scene);
  const playout = playoutOf(scene);
  const outPoint = scene.lifecycle?.outPoint ?? range.out;
  const frameMs = 1000 / scene.frameRate;
  const introMs = Math.max(0, outPoint - range.in) * frameMs;
  const outroMs = Math.max(0, range.out - outPoint) * frameMs;
  const holdMs = Math.max(0, playout.holdMs ?? 0);
  const passMs = introMs + holdMs + outroMs;
  const elapsed = Math.max(0, elapsedMs);

  const frameInPass = (passElapsedMs: number): number => {
    if (passElapsedMs < introMs) {
      return Math.min(outPoint, range.in + Math.floor(passElapsedMs / frameMs));
    }
    if (playout.mode === 'static') return range.out;

    const holdElapsedMs = passElapsedMs - introMs;
    if (playout.mode === 'manual' || holdElapsedMs < holdMs) {
      if ((playout.holdBehavior ?? 'freeze') !== 'loop') return outPoint;
      const contentStart = scene.lifecycle?.contentStart ?? outPoint;
      // Runtime's Middle is the half-open interval [Content start, Out point). Including Out in
      // the modulo adds one phantom frame and makes every synthetic wrap drift by one frame.
      const holdSpan = outPoint - contentStart;
      if (holdSpan <= 0) return outPoint;
      return contentStart + (Math.floor(holdElapsedMs / frameMs) % holdSpan);
    }

    const outroElapsedMs = holdElapsedMs - holdMs;
    return Math.min(range.out, outPoint + Math.floor(outroElapsedMs / frameMs));
  };

  if (playout.mode === 'static' || playout.mode === 'manual') return frameInPass(elapsed);
  if (playout.mode === 'auto-out') return frameInPass(Math.min(passMs, elapsed));

  const repeats = repeatOf(playout);
  const delayMs = delayMsOf(playout);
  if (repeats !== 'infinite') {
    const totalMs = repeats * passMs + Math.max(0, repeats - 1) * delayMs;
    if (elapsed >= totalMs) return range.out;
  }
  const cycleMs = passMs + delayMs;
  if (cycleMs <= 0) return range.out;
  const cycleElapsedMs = elapsed % cycleMs;
  return cycleElapsedMs >= passMs ? range.out : frameInPass(cycleElapsedMs);
}

/** Milliseconds until a synthetic Canvas lifecycle settles, or `null` while it holds/repeats. */
export function canvasDisplayLimitMs(scene: Scene): number | null {
  if (!rootUsesAuthoredFrameClock(scene)) return null;
  const playout = playoutOf(scene);
  if (playout.mode === 'static' || playout.mode === 'manual') return null;

  return finiteAutoLifecycleLimitMs(scene);
}

function finiteAutoLifecycleLimitMs(scene: Scene): number | null {
  const playout = playoutOf(scene);
  const range = activeRangeOf(scene);
  const outPoint = scene.lifecycle?.outPoint ?? range.out;
  const passMs =
    ((Math.max(0, outPoint - range.in) + Math.max(0, range.out - outPoint)) / scene.frameRate) *
      1000 +
    Math.max(0, playout.holdMs ?? 0);
  if (playout.mode === 'auto-out') return passMs;

  const repeats = repeatOf(playout);
  if (repeats === 'infinite') return null;
  return repeats * passMs + Math.max(0, repeats - 1) * delayMsOf(playout);
}

/**
 * B-382 — Runtime may naturally stop an empty/static render as soon as its collapsed paint leg
 * finishes. Preview keeps only its display clock alive until the finite authored projection ends.
 * Explicit Stop is handled before this predicate and therefore remains immediate.
 */
export function shouldDeferPreviewNaturalStop(
  scene: Scene,
  elapsedMs: number,
  elapsedLimitMs: number | null,
): boolean {
  return rootUsesAuthoredFrameClock(scene) && elapsedLimitMs !== null && elapsedMs < elapsedLimitMs;
}

/**
 * D-199 — whether Stop has an authored, frame-based picture change to show after Out point.
 *
 * A content driver such as a picture Sequence can keep the composition open without owning any
 * visual Outro of its own. Treating that hold as an Outro made the Canvas cursor race the Runtime's
 * immediate clear and land a few frames differently on every Stop. Only a root keyframe strictly
 * after Out point gives the Rehearse transport a real interval to display.
 */
export function hasAuthoredOutroMotion(scene: Scene): boolean {
  const outPoint = scene.lifecycle?.outPoint;
  const active = activeRangeOf(scene);
  if (outPoint === undefined || outPoint >= active.out) return false;

  const walk = (elements: readonly Element[]): boolean =>
    elements.some((element) => {
      const hasLaterKeyframe = Object.values(element.animation?.tracks ?? {}).some((track) =>
        track?.keyframes.some((keyframe) => keyframe.frame > outPoint),
      );
      if (hasLaterKeyframe) return true;
      return element.type === 'container' && walk(element.children);
    });

  return scene.layers.some((layer) => walk(layer.children));
}

/**
 * B-371/B-380 — both Preview and the main Canvas may hide Runtime's intentional collapsed-paint
 * boundary behind an authored display clock, but only when no root behaviour owns a real frame.
 */
export function rootUsesAuthoredFrameClock(scene: Scene): boolean {
  if (playoutOf(scene).holdSource === 'content-driven') return false;
  const active = activeRangeOf(scene);
  const walk = (elements: readonly Element[]): boolean =>
    elements.some((element) => {
      if (element.animation !== undefined && Object.keys(element.animation.tracks).length > 0) {
        return true;
      }
      if (
        element.lifespan !== undefined &&
        (element.lifespan.in > active.in || element.lifespan.out < active.out)
      ) {
        return true;
      }
      // Lottie settle points participate in the root controller's real frame sweep even though
      // their own media driver is not represented as a keyframe track.
      if (element.type === 'lottie') return true;
      // Follow Video owns Freeze/Loop/Outro cursor telemetry (B-377); a display clock must not
      // cover that element-owned root frame with wall time.
      if (element.type === 'video' && followsComposition(element.phases)) return true;
      return element.type === 'container' && walk(element.children);
    });
  return !scene.layers.some((layer) => walk(layer.children));
}
