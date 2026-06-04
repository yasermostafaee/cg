import type {
  AnimatableProperty,
  BezierEasing,
  ElementAnimation,
  Keyframe,
  Track,
} from '@cg/shared-schema';

/**
 * Authoring helpers for the built-in starters. Keeping keyframe/track
 * construction terse here lets each template read as a storyboard rather
 * than a wall of object literals — and keeps every track schema-valid
 * (the package's tests parse each Scene against `SceneSchema`).
 */

/** Cubic-bézier easing presets tuned for broadcast motion. */
export const EASE = {
  /** Gentle deceleration — the workhorse for fades/slides settling in. */
  outCubic: [0.33, 1, 0.68, 1] as BezierEasing,
  /** Strong, expensive-looking deceleration for hero reveals. */
  outExpo: [0.16, 1, 0.3, 1] as BezierEasing,
  /** Slight overshoot — pops a plate or badge into place. */
  outBack: [0.34, 1.56, 0.64, 1] as BezierEasing,
  /** Symmetric in/out for loops (pulses, drifts). */
  inOut: [0.65, 0, 0.35, 1] as BezierEasing,
  /** Accelerating exit. */
  inCubic: [0.55, 0, 1, 0.45] as BezierEasing,
} as const;

/** A single keyframe; defaults to a smooth ease-out, optional bézier override. */
export function kf(frame: number, value: number | string, bezier: BezierEasing = EASE.outCubic): Keyframe {
  return { frame, value, easing: 'ease-out', bezier };
}

/** A linear-held keyframe (no easing curve) — for constant-velocity scrolls. */
export function kfLinear(frame: number, value: number | string): Keyframe {
  return { frame, value, easing: 'linear' };
}

/** A stepped keyframe — value snaps with no interpolation (blinks, holds). */
export function kfStep(frame: number, value: number | string): Keyframe {
  return { frame, value, easing: 'step' };
}

export function track(...keyframes: Keyframe[]): Track {
  return { keyframes };
}

/** Assemble an element's animation from a property→track map. */
export function anim(map: Partial<Record<AnimatableProperty, Track>>): ElementAnimation {
  return { tracks: map } as ElementAnimation;
}
