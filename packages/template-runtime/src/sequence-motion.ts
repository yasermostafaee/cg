import { EASING_PRESETS, cubicBezierEase, type BezierEasing } from '@cg/shared-schema';

/**
 * D-029 — the sequence transition MOTION MAPPER. Pure — no DOM, no timers —
 * over the decomposed transition model (an IN edge, an OUT edge, a timing),
 * so every rule is table-testable and the decomposition stays the extensible
 * seam: a future style (e.g. `fade`) is a new edge/timing member plus a case
 * here — additive, no schema break.
 *
 * Geometry: an edge maps to the fully-offscreen offset vector for the
 * CLIPPED box (`top` = −Y by the box height, `bottom` = +Y, `left` = −X by
 * the width, `right` = +X; `none` = no motion — that side is an instant
 * cut). Edges are PHYSICAL: RTL never mirrors them.
 *
 * Composition per timing: `simultaneous` runs the OUT motion (current
 * position → OUT edge) and the IN motion (IN edge → current position)
 * together — the classic push; `sequential` completes the exit before the
 * entry begins (total = 2 × `transitionMs` when both sides move). EACH
 * motion lasts `transitionMs`, eased with the SHARED `ease-in-out` curve
 * from `@cg/shared-schema` — never a hand-rolled easing. Everything is
 * transform-only (translate; visibility flips for `none` sides).
 */

export type SequenceEdge = 'top' | 'bottom' | 'left' | 'right' | 'none';
export type SequenceTiming = 'simultaneous' | 'sequential';

export interface MotionBox {
  width: number;
  height: number;
}

export interface MotionVector {
  x: number;
  y: number;
}

/** The shared curve every sequence motion eases through. */
const EASE: BezierEasing = EASING_PRESETS['ease-in-out'] ?? [0.42, 0, 0.58, 1];

/**
 * The fully-offscreen offset for `edge` on a box of this size, or `null`
 * for `none` (no motion — an instant cut for that side).
 */
export function edgeOffset(edge: SequenceEdge, box: MotionBox): MotionVector | null {
  switch (edge) {
    case 'top':
      return { x: 0, y: -box.height };
    case 'bottom':
      return { x: 0, y: box.height };
    case 'left':
      return { x: -box.width, y: 0 };
    case 'right':
      return { x: box.width, y: 0 };
    case 'none':
      return null;
  }
}

export interface SequenceTransitionSpec {
  inEdge: SequenceEdge;
  outEdge: SequenceEdge;
  timing: SequenceTiming;
  /** Duration of EACH motion (ms). */
  transitionMs: number;
  box: MotionBox;
}

/** One node's pose at a sampled moment. */
export interface MotionPose {
  /** Translate offset from the resting position. */
  offset: MotionVector;
  visible: boolean;
}

export interface SequenceTransitionFrame {
  /** The outgoing item's pose (hidden once its motion has completed). */
  out: MotionPose;
  /** The incoming item's pose (hidden until its motion has begun). */
  in: MotionPose;
  /** The whole transition has finished — the incoming item is at rest. */
  done: boolean;
}

/** Total wall time of the transition (active ms; pauses freeze the clock upstream). */
export function transitionTotalMs(spec: SequenceTransitionSpec): number {
  const outMs = spec.outEdge === 'none' ? 0 : spec.transitionMs;
  const inMs = spec.inEdge === 'none' ? 0 : spec.transitionMs;
  return spec.timing === 'sequential' ? outMs + inMs : Math.max(outMs, inMs);
}

const AT_REST: MotionVector = { x: 0, y: 0 };

function scaled(v: MotionVector, f: number): MotionVector {
  // `+ 0` normalizes -0 (a 0-progress scale of a negative offset) to clean 0.
  return { x: v.x * f + 0, y: v.y * f + 0 };
}

/**
 * Sample the transition at `elapsedMs` of ACTIVE time. Pure: the driver owns
 * the clock (and pause/resume); this just maps time → the two poses.
 */
export function sampleTransition(
  spec: SequenceTransitionSpec,
  elapsedMs: number,
): SequenceTransitionFrame {
  const outVec = edgeOffset(spec.outEdge, spec.box);
  const inVec = edgeOffset(spec.inEdge, spec.box);
  const outMs = outVec === null ? 0 : spec.transitionMs;
  const inMs = inVec === null ? 0 : spec.transitionMs;
  const total = transitionTotalMs(spec);
  const t = Math.max(0, elapsedMs);
  const done = t >= total;

  // Progress of one motion over its own duration (an instant side is always
  // complete), eased through the shared curve.
  const progress = (ms: number, duration: number): number =>
    duration <= 0 ? 1 : cubicBezierEase(EASE, Math.min(1, ms / duration));

  if (spec.timing === 'sequential') {
    // Phase 1: the exit runs alone; the incoming item is not yet on stage.
    if (t < outMs && outVec !== null) {
      const p = progress(t, outMs);
      return {
        out: { offset: scaled(outVec, p), visible: true },
        in: { offset: inVec ?? AT_REST, visible: false },
        done: false,
      };
    }
    // Phase 2: the exit is complete (or was an instant cut); the entry runs.
    const inElapsed = t - outMs;
    const p = progress(inElapsed, inMs);
    return {
      out: { offset: outVec ?? AT_REST, visible: false },
      in: { offset: inVec === null ? AT_REST : scaled(inVec, 1 - p), visible: true },
      done,
    };
  }

  // Simultaneous (push): both motions share t. An OUT of `none` cuts the
  // outgoing item away immediately; an IN of `none` shows the incoming item
  // at rest immediately.
  const outP = progress(t, outMs);
  const inP = progress(t, inMs);
  return {
    out:
      outVec === null
        ? { offset: AT_REST, visible: false }
        : { offset: scaled(outVec, outP), visible: outP < 1 },
    in: { offset: inVec === null ? AT_REST : scaled(inVec, 1 - inP), visible: true },
    done,
  };
}
