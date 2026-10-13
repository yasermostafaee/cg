import { describe, expect, it } from 'vitest';
import {
  AREA_FLOOR_PCT,
  BLACK_CHANNEL_MAX,
  classifyFrame,
  classifyWindow,
  deriveTolerance,
  directionOf,
  excludeMask,
} from '../src/artefact.js';

/**
 * `SKEW-RESIDUE-01` — the classifier's rules, asserted on frames built by hand.
 *
 * The instrument decides what the owner is shown during the mismatch — a black flash or a
 * picture in the wrong place — and those are the two things the remedy is chosen between. A
 * classifier nobody checked would make that choice from noise.
 */

const W = 4;
const H = 2;
const PIXELS = W * H;

/** A frame of `PIXELS` pixels, each given by a `[r,g,b]` triple. */
function frameOf(colours: readonly (readonly [number, number, number])[]): Uint8Array {
  const out = new Uint8Array(PIXELS * 3);
  for (let p = 0; p < PIXELS; p += 1) {
    const c = colours[p] ?? colours[colours.length - 1] ?? [0, 0, 0];
    out[p * 3] = c[0];
    out[p * 3 + 1] = c[1];
    out[p * 3 + 2] = c[2];
  }
  return out;
}

const BLUE = [16, 64, 192] as const; // the harness scene's painted background
const PICTURE_OLD = [220, 40, 40] as const;
const PICTURE_NEW = [40, 220, 40] as const;
const BLACK = [0, 0, 0] as const;

describe('deriveTolerance — from the recording, never picked', () => {
  it('two identical settled frames give the floor, not zero', () => {
    const a = frameOf([BLUE]);
    expect(deriveTolerance(a, frameOf([BLUE]))).toBe(12);
  });

  it('scales with the noise it actually finds', () => {
    // One pixel 30 apart in a 8-pixel frame is above the 99.5th percentile.
    const a = frameOf([BLUE, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE]);
    const b = frameOf([[46, 64, 192], BLUE, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE]);
    expect(deriveTolerance(a, b)).toBe(90);
  });
});

describe('classifyFrame — the three classes, one pixel each', () => {
  const before = frameOf([PICTURE_OLD, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE]);
  const after = frameOf([BLUE, PICTURE_NEW, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE]);

  it('a pixel that already matches the settled ENTERING look is not an artefact', () => {
    const classes = classifyFrame(after, before, after, 12, undefined, 0);
    expect(classes.black + classes.misplaced + classes.other).toBe(0);
    expect(classes.total).toBe(PIXELS);
  });

  it('MISPLACED — the outgoing look still showing where the entering look shows otherwise', () => {
    // Pixel 0 still carries the old picture; the settled entering look has background there.
    const now = frameOf([PICTURE_OLD, PICTURE_NEW, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE]);
    const classes = classifyFrame(now, before, after, 12, undefined, 0);
    expect(classes.misplaced).toBe(1);
    expect(classes.black).toBe(0);
    expect(classes.other).toBe(0);
  });

  it('BLACK — an open hole with nothing behind it, and only where nothing is black at rest', () => {
    const now = frameOf([BLACK, PICTURE_NEW, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE]);
    expect(classifyFrame(now, before, after, 12, undefined, 0).black).toBe(1);

    // 🔴 The dark-picture guard: a pixel that is black in a SETTLED state cannot be transient
    // black, which is what keeps the source pattern's near-zero corner out of the count.
    const darkBefore = frameOf([BLACK, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE]);
    const classes = classifyFrame(now, darkBefore, after, 12, undefined, 0);
    expect(classes.black).toBe(0);
    expect(classes.misplaced).toBe(1);
  });

  it('OTHER — a state that is neither look, reported rather than hidden', () => {
    const now = frameOf([[255, 255, 0], PICTURE_NEW, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE]);
    const classes = classifyFrame(now, before, after, 12, undefined, 0);
    expect(classes.other).toBe(1);
    expect(classes.black + classes.misplaced).toBe(0);
  });

  it('the black test is per CHANNEL, so a dark blue is not black', () => {
    const nearlyBlack = frameOf([
      [BLACK_CHANNEL_MAX, BLACK_CHANNEL_MAX, BLACK_CHANNEL_MAX + 40],
      PICTURE_NEW,
      BLUE,
      BLUE,
      BLUE,
      BLUE,
      BLUE,
      BLUE,
    ]);
    expect(classifyFrame(nearlyBlack, before, after, 12, undefined, 0).black).toBe(0);
  });

  it('excluded pixels are not counted at all — not as artefact, not as total', () => {
    const now = frameOf([BLACK, PICTURE_NEW, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE]);
    const exclude = new Uint8Array(PIXELS);
    exclude[0] = 1;
    const classes = classifyFrame(now, before, after, 12, exclude, 0);
    expect(classes.black).toBe(0);
    expect(classes.total).toBe(PIXELS - 1);
  });
});

describe('excludeMask — scene rect to scaled pixels', () => {
  it('covers the scaled block the rect maps to', () => {
    const mask = excludeMask({ width: 4, height: 2 }, { width: 1920, height: 1080 }, [
      { x: 960, y: 540, width: 960, height: 540 },
    ]);
    // The bottom-right quadrant: x 2..3, y 1.
    expect(Array.from(mask)).toEqual([0, 0, 0, 0, 0, 0, 1, 1]);
  });
});

describe('classifyWindow — the summary the report is built from', () => {
  const settledBefore = frameOf([PICTURE_OLD, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE]);
  const settledAfter = frameOf([BLUE, PICTURE_NEW, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE]);
  const transient = frameOf([BLACK, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE]);

  it('measures the window, names the peak frame, and converts frames to ms', () => {
    const frames = [settledBefore, settledBefore, transient, settledAfter, settledAfter];
    const summary = classifyWindow({
      frames,
      beforeIndex: 1,
      afterIndex: 4,
      // The mismatch is frame 2 alone: the halves moved at 2 and 3, so `[min, max − 1]`.
      from: 2,
      to: 2,
      direction: 'hole-late',
      periodMs: 20,
      toleranceFrames: [0, 1],
    });
    // The control reads the settled frames either side (1 and 3) and must find nothing.
    expect(summary.settledResidualPct).toBe(0);
    expect(summary.direction).toBe('hole-late');
    expect(summary.peakBlackFrame).toBe(2);
    // 1 of 8 pixels = 12.5 %, comfortably over the floor, for exactly one frame.
    expect(summary.peakBlackPct).toBeCloseTo(12.5, 6);
    expect(summary.blackFrames).toBe(1);
    expect(summary.blackMs).toBe(20);
    expect(AREA_FLOOR_PCT).toBeLessThan(12.5);
  });

  it('a settled window scores ZERO — the classifier is not measuring its own tolerance', () => {
    const frames = [settledAfter, settledAfter, settledAfter, settledAfter];
    const summary = classifyWindow({
      frames,
      beforeIndex: 1,
      afterIndex: 3,
      from: 1,
      to: 2,
      direction: 'exact',
      periodMs: 20,
      toleranceFrames: [0, 1],
    });
    expect(summary.peakBlackPct).toBe(0);
    expect(summary.peakMisplacedPct).toBe(0);
    expect(summary.peakOtherPct).toBe(0);
  });

  it('🔴 k = 0 has an EMPTY window — there is no moment at which the halves disagree', () => {
    /*
      The off-by-one this pins cost a whole sweep: with the window opened one frame EARLY, the
      settled outgoing look was classified as misplaced picture and every run — including the
      exact ones — reported 55 % of the frame wrong for 20 ms. Both halves landing on one
      frame is the definition of no artefact, and the summary has to say so.
    */
    const frames = [settledBefore, settledBefore, settledAfter, settledAfter];
    const summary = classifyWindow({
      frames,
      beforeIndex: 1,
      afterIndex: 3,
      from: 2,
      to: 1, // max − 1 < min: empty by construction
      direction: 'exact',
      periodMs: 20,
      toleranceFrames: [0, 1],
    });
    expect(summary.windowFrames).toBe(0);
    expect(summary.peakMisplacedPct).toBe(0);
    expect(summary.peakBlackPct).toBe(0);
    expect(summary.misplacedMs).toBe(0);
  });
});

describe('directionOf', () => {
  it('names the direction from the sign of k, with zero its own case', () => {
    expect(directionOf(-1)).toBe('hole-early');
    expect(directionOf(0)).toBe('exact');
    expect(directionOf(2)).toBe('hole-late');
  });
});
