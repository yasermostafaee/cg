import type { Rect } from './geometry.js';

/**
 * `SKEW-RESIDUE-01` — **WHAT IS ON SCREEN DURING THE MISMATCH, not just how long it lasts.**
 *
 * `B-174`'s hold took `k` from 20/30/60 ms to −20/0/+20 ms and the owner still reports seeing
 * it, in two different-looking ways:
 *
 * > _"When there is no black, the hole appears quickly but the previous boxes are still there.
 * > When the hole goes later, black is visible."_
 *
 * Those are two artefact CLASSES, and a duration cannot tell them apart. This module reads the
 * whole frame and says, per frame of the window, how much of the picture is each.
 *
 * ── 🔴 HOW A PIXEL IS CLASSIFIED, AND WHY IT IS DONE BY REFERENCE ─────────────
 *
 * Not by colour: the source patterns are ramps that cover most of the gamut, so "is this pixel
 * background or picture" has no colour answer that survives a scale change. It is done against
 * the recording's OWN settled states, which the same recording contains:
 *
 * - `before` — a frame from the settle period, the OUTGOING look at rest;
 * - `after` — a frame from the tail, the ENTERING look at rest.
 *
 * Then, per pixel, in the window between the two transitions:
 *
 * - **transient BLACK** — near zero in every channel NOW, and not black in either settled
 *   state. That is an open mask with nothing behind it: the channel showing through.
 * - **MISPLACED PICTURE** — matches the `before` state within the noise tolerance while the
 *   `after` state says something else should be there. That is "the previous boxes are still
 *   there" exactly: content the entering look does not place, still visible through a hole.
 * - **OTHER TRANSIENT** — differs from both. Reported rather than hidden: hole edges, codec
 *   ringing and any genuinely third state land here, and a large count is the signal that this
 *   classification is the wrong one for that run.
 *
 * ── ⚠ WHAT WOULD MAKE THE CLASSIFICATION WRONG, STATED UP FRONT ───────────────
 *
 * - **A dark PICTURE pixel read as black.** The patterns reach (0, 0, ~1) in one corner. The
 *   "not black in either settled state" clause is what keeps those out — a pixel that is black
 *   at rest cannot be transient black — but a dark picture region that MOVES INTO a place that
 *   was not dark before is counted as black. Bounded by the corner being small and the window
 *   being ~1 field; it is the residual this rule cannot remove.
 * - **The scale-down.** Frames are classified at reduced size with nearest-neighbour sampling,
 *   so each classified pixel is a block of real ones and hole EDGES are quantised. Areas are
 *   therefore accurate to about one block; a one-block-wide sliver is not a measurement.
 * - **Codec noise.** The tolerance is derived from two settled baseline frames of the same
 *   recording rather than picked, the same rule `analyse.ts` follows for the transition
 *   threshold. A recording whose baseline is not quiet inflates the tolerance and UNDER-counts.
 * - **A moving background.** The video-background variant carries a deliberately moving patch;
 *   it must be excluded by rect, or it reads as "other transient" every frame.
 * - **Interlace.** At `1080i5000` the file consumer writes one recorded frame per FIELD, so no
 *   frame blends two moments. On a progressive mode that is still true. Nothing here would
 *   survive a capture that de-interlaced by weaving.
 */

/** Near-zero in every channel: the channel behind the CG layer, not a dark picture. */
export const BLACK_CHANNEL_MAX = 24;

/** Percent of frame a class must reach in a frame before that frame counts toward duration. */
export const AREA_FLOOR_PCT = 0.05;

export interface FrameSize {
  readonly width: number;
  readonly height: number;
}

/** One frame's classification, as pixel counts out of `total`. */
export interface FrameClasses {
  readonly index: number;
  readonly black: number;
  readonly misplaced: number;
  readonly other: number;
  readonly total: number;
}

export interface ArtefactSummary {
  /** `hole-early` (the page moved first), `exact`, or `hole-late`. */
  readonly direction: 'hole-early' | 'exact' | 'hole-late';
  /** The tolerance derived from the recording's own settled frames. */
  readonly tolerance: number;
  readonly windowFrames: number;
  /** Peak share of the frame, in percent. */
  readonly peakBlackPct: number;
  readonly peakMisplacedPct: number;
  readonly peakOtherPct: number;
  /** How many window frames each class was visible in, and that in ms. */
  readonly blackFrames: number;
  readonly misplacedFrames: number;
  readonly blackMs: number;
  readonly misplacedMs: number;
  /** The frame index where each class peaked — the frame a human opens. */
  readonly peakBlackFrame: number | null;
  readonly peakMisplacedFrame: number | null;
  readonly perFrame: readonly FrameClasses[];
  /**
   * 🔴 **THE PER-RUN POSITIVE CONTROL: the largest artefact share found in the SETTLED frames
   * either side of the window** — the frame before the first transition and the frame at the
   * second, both of which are a settled look by construction.
   *
   * It must be ≈ 0. If it is not, the tolerance is too tight, the references were taken from
   * the wrong frames, or the picture was not settled — and every number beside it is
   * describing that fault rather than the switch. Measured per run rather than argued once,
   * because it is the one thing that would make the whole classification silently wrong.
   */
  readonly settledResidualPct: number;
}

function channelMax(frame: Uint8Array, offset: number): number {
  return Math.max(frame[offset] ?? 0, frame[offset + 1] ?? 0, frame[offset + 2] ?? 0);
}

function maxChannelDiff(a: Uint8Array, b: Uint8Array, offset: number): number {
  return Math.max(
    Math.abs((a[offset] ?? 0) - (b[offset] ?? 0)),
    Math.abs((a[offset + 1] ?? 0) - (b[offset + 1] ?? 0)),
    Math.abs((a[offset + 2] ?? 0) - (b[offset + 2] ?? 0)),
  );
}

/**
 * The per-pixel tolerance, DERIVED from two settled frames of this recording.
 *
 * The 99.5th percentile of their difference is what codec noise reaches on a still picture;
 * three times that (floored) is what a real content change has to beat. Picking a constant
 * instead would be a guess about an encoder, which is the mistake `analyse.ts` already refuses
 * to make for the transition threshold.
 */
export function deriveTolerance(a: Uint8Array, b: Uint8Array, floor = 12): number {
  const pixels = Math.floor(Math.min(a.length, b.length) / 3);
  if (pixels === 0) return floor;
  const diffs = new Uint8Array(pixels);
  for (let p = 0; p < pixels; p += 1) diffs[p] = Math.min(255, maxChannelDiff(a, b, p * 3));
  const sorted = Array.from(diffs).sort((x, y) => x - y);
  const p995 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.995))] ?? 0;
  return Math.max(floor, p995 * 3);
}

/** Pixels of the scaled frame that fall inside `rect` (scene coordinates), as a mask. */
export function excludeMask(size: FrameSize, scene: FrameSize, rects: readonly Rect[]): Uint8Array {
  const mask = new Uint8Array(size.width * size.height);
  const sx = size.width / scene.width;
  const sy = size.height / scene.height;
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x * sx));
    const y0 = Math.max(0, Math.floor(r.y * sy));
    const x1 = Math.min(size.width, Math.ceil((r.x + r.width) * sx));
    const y1 = Math.min(size.height, Math.ceil((r.y + r.height) * sy));
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) mask[y * size.width + x] = 1;
  }
  return mask;
}

/** Classify ONE frame against the two settled references. */
export function classifyFrame(
  frame: Uint8Array,
  before: Uint8Array,
  after: Uint8Array,
  tolerance: number,
  exclude: Uint8Array | undefined,
  index: number,
): FrameClasses {
  const pixels = Math.floor(frame.length / 3);
  let black = 0;
  let misplaced = 0;
  let other = 0;
  let total = 0;
  for (let p = 0; p < pixels; p += 1) {
    if (exclude?.[p] === 1) continue;
    total += 1;
    const off = p * 3;
    const dAfter = maxChannelDiff(frame, after, off);
    if (dAfter <= tolerance) continue; // already what the settled entering look shows
    /*
      🔴 ORDER: "is it the OUTGOING look" is asked BEFORE "is it black". A pixel that matches
      the settled outgoing state is misplaced content whatever its colour — including where
      that content is itself dark — while `black` is reserved for a state belonging to NEITHER
      look, which is what an open mask over no picture actually is.
    */
    if (maxChannelDiff(frame, before, off) <= tolerance) {
      misplaced += 1;
      continue;
    }
    const isBlackNow = channelMax(frame, off) <= BLACK_CHANNEL_MAX;
    const blackAtRest =
      channelMax(before, off) <= BLACK_CHANNEL_MAX || channelMax(after, off) <= BLACK_CHANNEL_MAX;
    if (isBlackNow && !blackAtRest) {
      black += 1;
      continue;
    }
    other += 1;
  }
  return { index, black, misplaced, other, total };
}

const pct = (n: number, total: number): number => (total === 0 ? 0 : (n / total) * 100);

/**
 * Classify the mismatch window of one run.
 *
 * 🔴 **`from`/`to` ARE THE MISMATCH ITSELF, and the off-by-one here is not a detail.** Each
 * transition index is _the first frame that differs from its predecessor_, so at `min(A,B)`
 * the first half has moved and at `max(A,B)` the second has: the window in which the two
 * halves disagree is `[min, max − 1]`, INCLUSIVE, and it is EMPTY when `k = 0`. Starting one
 * frame earlier — the obvious "show a frame either side" — counts the settled OUTGOING look
 * as misplaced picture, which measured 55 % of the frame on every run including the `k = 0`
 * ones: the whole changed area, reported as an artefact of a switch that had not happened yet.
 * The settled frames either side are still read, as {@link ArtefactSummary.settledResidualPct}.
 */
export function classifyWindow(args: {
  readonly frames: readonly Uint8Array[];
  readonly beforeIndex: number;
  readonly afterIndex: number;
  readonly from: number;
  readonly to: number;
  readonly direction: ArtefactSummary['direction'];
  readonly periodMs: number;
  readonly exclude?: Uint8Array;
  readonly toleranceFrames?: readonly [number, number];
  /** How far past `to` the window may follow an artefact that has not settled. */
  readonly maxExtendFrames?: number;
}): ArtefactSummary {
  const { frames, beforeIndex, afterIndex, from, to, direction, periodMs } = args;
  const before = frames[beforeIndex];
  const after = frames[afterIndex];
  const empty: ArtefactSummary = {
    direction,
    tolerance: 0,
    windowFrames: 0,
    peakBlackPct: 0,
    peakMisplacedPct: 0,
    peakOtherPct: 0,
    blackFrames: 0,
    misplacedFrames: 0,
    blackMs: 0,
    misplacedMs: 0,
    peakBlackFrame: null,
    peakMisplacedFrame: null,
    perFrame: [],
    settledResidualPct: 0,
  };
  if (before === undefined || after === undefined) return empty;

  const [t0, t1] = args.toleranceFrames ?? [Math.max(0, beforeIndex - 3), beforeIndex];
  const toleranceA = frames[t0];
  const toleranceB = frames[t1];
  const tolerance =
    toleranceA === undefined || toleranceB === undefined
      ? 12
      : deriveTolerance(toleranceA, toleranceB);

  /*
    THE CONTROL, and the two settled frames answer DIFFERENT questions:

    - `from − 1` is the last frame of the OUTGOING look. Everything there either matches the
      entering look already (unchanged regions) or matches the outgoing one — so `misplaced`
      is EXPECTED and it is `black + other` that must be ~0. A black or unclassifiable pixel
      in a settled frame means the references or the tolerance are wrong.
    - `to + 1` is the first frame of the ENTERING look, which must classify as nothing at all.

    Reported as one number: the larger of the two, which is the honest worst case.
  */
  let settledResidualPct = 0;
  const controlOld = frames[from - 1];
  if (controlOld !== undefined) {
    const c = classifyFrame(controlOld, before, after, tolerance, args.exclude, from - 1);
    settledResidualPct = Math.max(settledResidualPct, pct(c.black + c.other, c.total));
  }

  /*
    🔴 **THE WINDOW FINDS ITS OWN END.** `[min, max − 1]` is where the two transitions say the
    halves disagree, but a transition is the FIRST frame that differs, not the last: measured,
    one run in ten had 22 % of the frame still unsettled at `max + 1`, because one half landed
    across two fields. Bounding the window by the transition indices alone would have reported
    that artefact as one field long while the control said, in the same run, that it was not
    over. So the window extends while the artefact is still above the floor — up to a cap, so
    a run whose picture never settles is visibly wrong rather than silently long.
  */
  const perFrame: FrameClasses[] = [];
  const last = frames.length - 1;
  let end = Math.min(to, last);
  for (let i = Math.max(0, from); i <= Math.min(end, last); i += 1) {
    const frame = frames[i];
    if (frame === undefined) continue;
    perFrame.push(classifyFrame(frame, before, after, tolerance, args.exclude, i));
  }
  const cap = args.maxExtendFrames ?? 8;
  for (let extra = 0; extra < cap && end + 1 <= last; extra += 1) {
    const frame = frames[end + 1];
    if (frame === undefined) break;
    const c = classifyFrame(frame, before, after, tolerance, args.exclude, end + 1);
    if (pct(c.black + c.misplaced, c.total) < AREA_FLOOR_PCT) break;
    perFrame.push(c);
    end += 1;
  }
  // The other half of the control, taken AFTER the extension: the first frame the window did
  // not claim must classify as nothing at all. Taken at a fixed `to + 1` it would have been
  // inside the artefact on exactly the runs where the artefact ran long.
  const controlNew = frames[end + 1];
  if (controlNew !== undefined) {
    const c = classifyFrame(controlNew, before, after, tolerance, args.exclude, end + 1);
    settledResidualPct = Math.max(
      settledResidualPct,
      pct(c.black + c.misplaced + c.other, c.total),
    );
  }
  if (perFrame.length === 0) return { ...empty, tolerance, settledResidualPct };

  let peakBlack = perFrame[0] as FrameClasses;
  let peakMisplaced = perFrame[0] as FrameClasses;
  let peakOtherPct = 0;
  let blackFrames = 0;
  let misplacedFrames = 0;
  for (const f of perFrame) {
    if (f.black > peakBlack.black) peakBlack = f;
    if (f.misplaced > peakMisplaced.misplaced) peakMisplaced = f;
    peakOtherPct = Math.max(peakOtherPct, pct(f.other, f.total));
    if (pct(f.black, f.total) >= AREA_FLOOR_PCT) blackFrames += 1;
    if (pct(f.misplaced, f.total) >= AREA_FLOOR_PCT) misplacedFrames += 1;
  }
  return {
    direction,
    tolerance,
    windowFrames: perFrame.length,
    peakBlackPct: pct(peakBlack.black, peakBlack.total),
    peakMisplacedPct: pct(peakMisplaced.misplaced, peakMisplaced.total),
    peakOtherPct,
    blackFrames,
    misplacedFrames,
    blackMs: blackFrames * periodMs,
    misplacedMs: misplacedFrames * periodMs,
    peakBlackFrame: peakBlack.black > 0 ? peakBlack.index : null,
    peakMisplacedFrame: peakMisplaced.misplaced > 0 ? peakMisplaced.index : null,
    perFrame,
    settledResidualPct,
  };
}

/** `hole-early` when the page moved first — probe B before probe A. */
export function directionOf(k: number): ArtefactSummary['direction'] {
  if (k < 0) return 'hole-early';
  if (k > 0) return 'hole-late';
  return 'exact';
}
