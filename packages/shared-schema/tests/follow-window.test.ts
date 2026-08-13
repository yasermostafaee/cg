import { describe, expect, it } from 'vitest';
import { followWindowMs, followsComposition, type FollowAnchors } from '../src/index.js';

/**
 * media-phases-follow-composition — the ONE comp-side derivation, in TIME SPACE (ms —
 * video's native unit; the Lottie adapter converts at the edge). The model: a CONTINUOUS
 * window through the clip anchored at the HOLD time `H`, so the clip reaches its hold look
 * EXACTLY at the effective content start and eases onward through the OUT segment with no
 * hold→outro pop by construction.
 */

/** The owner's decisive case: 2 s composition at 25 fps, content start 1 s, OUT 0.5 s. */
const OWNER: FollowAnchors = {
  activeIn: 0,
  contentStart: 25, // 1 s into the comp
  outPoint: 37.5, // active.out − 0.5 s (12.5 frames at 25 fps)
  activeOut: 50, // 2 s comp
  fps: 25,
};

describe('followWindowMs — the owner case and the default degeneracy', () => {
  it("the owner's case: 5 s clip, hold at second 3 ⇒ window [2 s → 3 s] / 3 s / [3 s → 3.5 s]", () => {
    const w = followWindowMs(OWNER, { durationMs: 5000, holdAtMs: 3000 });
    expect(w.entranceSpanMs).toBeCloseTo(1000);
    expect(w.outSpanMs).toBeCloseTo(500);
    expect(w.introStartMs).toBeCloseTo(2000);
    expect(w.holdMs).toBeCloseTo(3000);
    expect(w.outroEndMs).toBeCloseTo(3500);
    expect(w.hasOutro).toBe(true);
    expect(w.clamps).toEqual({
      introShort: false,
      outroClamped: false,
      holdPastEnd: false,
      noOutSegment: false,
    });
  });

  it('absent holdAt degenerates to "play the clip from its head" — the general rule at H = entrance span', () => {
    const w = followWindowMs(OWNER, { durationMs: 5000 });
    // intro [0 → entranceSpan], outro [entranceSpan → entranceSpan + outSpan]: no separate branch.
    expect(w.introStartMs).toBe(0);
    expect(w.holdMs).toBeCloseTo(1000);
    expect(w.outroEndMs).toBeCloseTo(1500);
    expect(w.clamps).toEqual({
      introShort: false,
      outroClamped: false,
      holdPastEnd: false,
      noOutSegment: false,
    });
  });

  it('a clip LONGER than the composition always fits — both spans are ≤ the comp length, no clamp fires', () => {
    const w = followWindowMs(OWNER, { durationMs: 60_000, holdAtMs: 30_000 });
    expect(w.clamps).toEqual({
      introShort: false,
      outroClamped: false,
      holdPastEnd: false,
      noOutSegment: false,
    });
    expect(w.introStartMs).toBeCloseTo(29_000);
    expect(w.outroEndMs).toBeCloseTo(30_500);
  });
});

describe('followWindowMs — clamps, each flagged for the hint machinery', () => {
  it('H smaller than the entrance span ⇒ the intro starts at the clip start, shorter than the entrance', () => {
    const w = followWindowMs(OWNER, { durationMs: 5000, holdAtMs: 400 });
    expect(w.introStartMs).toBe(0); // cannot start before the clip
    expect(w.holdMs).toBeCloseTo(400);
    expect(w.clamps.introShort).toBe(true);
    expect(w.clamps.outroClamped).toBe(false);
  });

  it('H + outSpan past the clip end ⇒ the outro clamps at the clip end', () => {
    const w = followWindowMs(OWNER, { durationMs: 5000, holdAtMs: 4800 });
    expect(w.outroEndMs).toBe(5000);
    expect(w.clamps.outroClamped).toBe(true);
  });

  it('H past the clip end (stale holdAt after an asset swap) ⇒ clamps to the clip end, flagged', () => {
    const w = followWindowMs(OWNER, { durationMs: 2000, holdAtMs: 9000 });
    expect(w.holdMs).toBe(2000);
    expect(w.clamps.holdPastEnd).toBe(true);
    // At the very end there is nothing left to play out — the outro is degenerate.
    expect(w.outroEndMs).toBe(2000);
    expect(w.hasOutro).toBe(false);
  });

  it('a clip shorter than the entrance under DEFAULT H ⇒ the short-clip clamp, flagged', () => {
    const w = followWindowMs(OWNER, { durationMs: 600 });
    // Default H = entranceSpan (1000) clamps to the clip end; the intro is the whole clip and
    // still shorter than the entrance — the clip freezes early, and the hint says so.
    expect(w.holdMs).toBe(600);
    expect(w.clamps.holdPastEnd).toBe(true);
    expect(w.clamps.introShort).toBe(true);
  });

  it('no OUT segment (outPoint at active.out) ⇒ a degenerate outro — FLAGGED, never silent (session V)', () => {
    // The owner-observed defect's cause: an out point at the very end of the active range
    // derives outSpan 0 ⇒ outroEndMs === holdMs ⇒ no outro — while the intro half stays
    // perfect. Reachable by ordinary authoring (the marker drag CLAMPS at active.out, and
    // a shrink-then-regrow of the total pins active.out below the ruler's end). The RULE
    // stands (the OUT segment on air is [outPoint → active.out]); what changes is that the
    // silence stops: the window now carries the flag, and the Inspector explains itself.
    const w = followWindowMs({ ...OWNER, outPoint: 50 }, { durationMs: 5000, holdAtMs: 3000 });
    expect(w.outSpanMs).toBe(0);
    expect(w.hasOutro).toBe(false);
    expect(w.clamps.noOutSegment).toBe(true);
  });

  it('a STRANDED out point (past active.out — a pre-clamp-fix scene) also flags, never NaN/negative', () => {
    const w = followWindowMs(
      { ...OWNER, outPoint: 80, activeOut: 50 },
      { durationMs: 5000, holdAtMs: 3000 },
    );
    expect(w.outSpanMs).toBe(0);
    expect(w.hasOutro).toBe(false);
    expect(w.clamps.noOutSegment).toBe(true);
  });

  it('a REAL OUT segment does not flag', () => {
    const w = followWindowMs(OWNER, { durationMs: 5000, holdAtMs: 3000 });
    expect(w.clamps.noOutSegment).toBe(false);
  });
});

describe('followWindowMs — unit conversion across frame rates', () => {
  it('29.97 and 50 fps scenes agree on the same wall-clock anchors', () => {
    // 1 s entrance + 0.5 s OUT expressed in each rate's frames must derive the same ms window.
    const at2997 = followWindowMs(
      { activeIn: 0, contentStart: 29.97, outPoint: 44.955, activeOut: 59.94, fps: 29.97 },
      { durationMs: 5000, holdAtMs: 3000 },
    );
    const at50 = followWindowMs(
      { activeIn: 0, contentStart: 50, outPoint: 75, activeOut: 100, fps: 50 },
      { durationMs: 5000, holdAtMs: 3000 },
    );
    expect(at2997.introStartMs).toBeCloseTo(at50.introStartMs, 5);
    expect(at2997.outroEndMs).toBeCloseTo(at50.outroEndMs, 5);
    // …and the hold look lands at the effective content start within one comp frame.
    const frameMs = 1000 / 29.97;
    expect(Math.abs(at2997.holdMs - at2997.introStartMs - at2997.entranceSpanMs)).toBeLessThan(
      frameMs,
    );
  });

  it('a zero/invalid fps yields a degenerate (all-zero-span) window rather than NaN', () => {
    const w = followWindowMs({ ...OWNER, fps: 0 }, { durationMs: 5000, holdAtMs: 3000 });
    expect(w.entranceSpanMs).toBe(0);
    expect(w.outSpanMs).toBe(0);
    expect(Number.isFinite(w.holdMs)).toBe(true);
  });
});

describe('followsComposition — the ONE spelling of "is this element a follower"', () => {
  it('true only for source composition; manual, markers, and absent are not followers', () => {
    expect(followsComposition({ source: 'composition' })).toBe(true);
    expect(followsComposition({ source: 'manual' })).toBe(false);
    expect(followsComposition({ source: 'markers' })).toBe(false);
    expect(followsComposition({})).toBe(false);
    expect(followsComposition(undefined)).toBe(false);
  });
});
