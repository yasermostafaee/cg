import { describe, expect, it } from 'vitest';
import {
  followWindowMs,
  followsComposition,
  videoFollowClipFacts,
  type FollowAnchors,
} from '../src/index.js';

/**
 * media-phases-follow-composition — the ONE comp-side derivation, in TIME SPACE (ms —
 * video's native unit; the Lottie adapter converts at the edge).
 *
 * ⭐ SESSION Y RE-PIN, deliberate: the OUTRO ANCHOR MOVED. The superseded rule played
 * `[H → H + outSpan]` — the hold-anchored window, which for a real furniture clip is its
 * motionless middle, while the authored build-off never played (the owner reported the
 * consequence three times). The corrected rule: **a follower's outro is the CLIP'S OWN
 * ENDING** — end-anchored `[clipEnd − outSpan → clipEnd]`, or the clip's authored
 * `[outroStart → clipEnd]` when genuinely authored phases exist (they WIN). Intro and hold
 * derivations are UNCHANGED and their assertions below are byte-identical to the old suite.
 */

/** The owner's decisive case: 2 s composition at 25 fps, content start 1 s, OUT 0.5 s. */
const OWNER: FollowAnchors = {
  activeIn: 0,
  contentStart: 25, // 1 s into the comp
  outPoint: 37.5, // active.out − 0.5 s (12.5 frames at 25 fps)
  activeOut: 50, // 2 s comp
  fps: 25,
};

const NO_CLAMPS = {
  introShort: false,
  holdPastEnd: false,
  noOutSegment: false,
  wholeClipOutro: false,
  outroCutByRemoval: false,
  lateSettle: false,
  holdJump: false,
};

describe('followWindowMs — the owner case, corrected: the outro is the clip’s ending', () => {
  it("the owner's case: 5 s clip, hold at second 3 ⇒ intro [2 s → 3 s], hold 3 s, outro [4.5 s → 5 s]", () => {
    const w = followWindowMs(OWNER, { durationMs: 5000, holdAtMs: 3000 });
    // Intro and hold: UNCHANGED from the shipped rule.
    expect(w.entranceSpanMs).toBeCloseTo(1000);
    expect(w.outSpanMs).toBeCloseTo(500);
    expect(w.introStartMs).toBeCloseTo(2000);
    expect(w.introDelayMs).toBe(0);
    expect(w.holdMs).toBeCloseTo(3000);
    // The corrected outro: END-anchored — the clip's last half-second, landing on its end.
    expect(w.outroStartMs).toBeCloseTo(4500);
    expect(w.outroEndMs).toBeCloseTo(5000);
    expect(w.hasOutro).toBe(true);
    expect(w.authored).toBe(false);
    // The hold→outro seam jumps (3 s → 4.5 s) — deliberately accepted, named for the hint.
    expect(w.clamps).toEqual({ ...NO_CLAMPS, holdJump: true });
  });

  it('absent holdAt degenerates to "play the clip from its head" — H = entrance span; the outro is still the ending', () => {
    const w = followWindowMs(OWNER, { durationMs: 5000 });
    expect(w.introStartMs).toBe(0);
    expect(w.holdMs).toBeCloseTo(1000);
    expect(w.outroStartMs).toBeCloseTo(4500);
    expect(w.outroEndMs).toBeCloseTo(5000);
    expect(w.clamps.holdJump).toBe(true);
  });

  it('a clip LONGER than the composition always fits — no clamp beyond the seam jump fires', () => {
    const w = followWindowMs(OWNER, { durationMs: 60_000, holdAtMs: 30_000 });
    expect(w.introStartMs).toBeCloseTo(29_000);
    expect(w.outroStartMs).toBeCloseTo(59_500);
    expect(w.outroEndMs).toBeCloseTo(60_000);
    expect(w.clamps).toEqual({ ...NO_CLAMPS, holdJump: true });
  });

  it('a hold that happens to sit exactly at the outro start does NOT flag the seam', () => {
    // 5 s clip, outSpan 0.5 s ⇒ outroStart 4.5 s; holdAt exactly there ⇒ continuous.
    const w = followWindowMs(OWNER, { durationMs: 5000, holdAtMs: 4500 });
    expect(w.holdMs).toBeCloseTo(4500);
    expect(w.outroStartMs).toBeCloseTo(4500);
    expect(w.clamps.holdJump).toBe(false);
  });
});

describe('followWindowMs — AUTHORED phases win (the precedence rule)', () => {
  it('an authored intro shorter than the entrance DELAYS, so it finishes at the content start', () => {
    const w = followWindowMs(OWNER, { durationMs: 5000, authoredIntroEndMs: 400 });
    expect(w.authored).toBe(true);
    expect(w.introStartMs).toBe(0);
    expect(w.holdMs).toBeCloseTo(400); // the hold frame IS the authored introEnd
    expect(w.introDelayMs).toBeCloseTo(600); // parks 0.6 s, plays 0.4 s, settles at 1 s
    expect(w.clamps.lateSettle).toBe(false);
  });

  it('an authored intro LONGER than the entrance starts at active.in and settles late — flagged', () => {
    const w = followWindowMs(OWNER, { durationMs: 5000, authoredIntroEndMs: 2500 });
    expect(w.introDelayMs).toBe(0);
    expect(w.holdMs).toBeCloseTo(2500);
    expect(w.clamps.lateSettle).toBe(true);
  });

  it('an authored outro plays the clip’s own [outroStart → clipEnd]; longer than the OUT segment flags the cut', () => {
    const w = followWindowMs(OWNER, { durationMs: 5000, authoredOutroStartMs: 4000 });
    expect(w.authored).toBe(true);
    expect(w.outroStartMs).toBeCloseTo(4000);
    expect(w.outroEndMs).toBeCloseTo(5000);
    // 1 s of authored outro against a 0.5 s OUT segment: the timeline removes mid-outro
    // (on air the exit waits instead) — flagged, never rescaled.
    expect(w.clamps.outroCutByRemoval).toBe(true);
  });

  it('an authored outro that FITS the OUT segment does not flag', () => {
    const w = followWindowMs(OWNER, { durationMs: 5000, authoredOutroStartMs: 4600 });
    expect(w.clamps.outroCutByRemoval).toBe(false);
  });

  it('holdAt is IGNORED when an authored intro governs — the hold frame is introEnd', () => {
    const w = followWindowMs(OWNER, {
      durationMs: 5000,
      holdAtMs: 3000,
      authoredIntroEndMs: 400,
    });
    expect(w.holdMs).toBeCloseTo(400);
  });
});

describe('followWindowMs — clamps, each flagged for the hint machinery', () => {
  it('H smaller than the entrance span ⇒ the intro starts at the clip start, shorter than the entrance', () => {
    const w = followWindowMs(OWNER, { durationMs: 5000, holdAtMs: 400 });
    expect(w.introStartMs).toBe(0);
    expect(w.holdMs).toBeCloseTo(400);
    expect(w.clamps.introShort).toBe(true);
  });

  it('H past the clip end (stale holdAt after an asset swap) ⇒ clamps to the clip end, flagged', () => {
    const w = followWindowMs(OWNER, { durationMs: 2000, holdAtMs: 9000 });
    expect(w.holdMs).toBe(2000);
    expect(w.clamps.holdPastEnd).toBe(true);
    // The ending still plays: outro [1.5 s → 2 s] — a BACKWARD seam jump, still flagged.
    expect(w.outroStartMs).toBeCloseTo(1500);
    expect(w.hasOutro).toBe(true);
    expect(w.clamps.holdJump).toBe(true);
  });

  it('a clip shorter than the entrance under DEFAULT H ⇒ the short-clip clamp, flagged', () => {
    const w = followWindowMs(OWNER, { durationMs: 600 });
    expect(w.holdMs).toBe(600);
    expect(w.clamps.holdPastEnd).toBe(true);
    expect(w.clamps.introShort).toBe(true);
  });

  it('no OUT segment (outPoint at active.out) ⇒ a degenerate outro — FLAGGED, never silent (session V)', () => {
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

  it('a REAL OUT segment does not flag noOutSegment', () => {
    const w = followWindowMs(OWNER, { durationMs: 5000, holdAtMs: 3000 });
    expect(w.clamps.noOutSegment).toBe(false);
  });

  it('an OUT segment longer than the clip ⇒ the WHOLE clip is the outro, flagged', () => {
    const w = followWindowMs(OWNER, { durationMs: 300 });
    expect(w.outroStartMs).toBe(0);
    expect(w.outroEndMs).toBe(300);
    expect(w.clamps.wholeClipOutro).toBe(true);
  });
});

describe('videoFollowClipFacts — the attach SEED SIGNATURE derives as if absent', () => {
  it('the exact seeds (midpoint / durationMs) are NOT authored', () => {
    expect(videoFollowClipFacts({ introEnd: 2500, outroStart: 5000 }, 5000)).toEqual({});
  });

  it('a genuinely authored value survives; a seed beside it does not', () => {
    expect(videoFollowClipFacts({ introEnd: 2000, outroStart: 5000 }, 5000)).toEqual({
      authoredIntroEndMs: 2000,
    });
    expect(videoFollowClipFacts({ introEnd: 2500, outroStart: 4200 }, 5000)).toEqual({
      authoredOutroStartMs: 4200,
    });
  });

  it('absent phases and absent fields are absent facts', () => {
    expect(videoFollowClipFacts(undefined, 5000)).toEqual({});
    expect(videoFollowClipFacts({}, 5000)).toEqual({});
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
    expect(at2997.holdMs).toBeCloseTo(at50.holdMs, 5);
    expect(at2997.outroStartMs).toBeCloseTo(at50.outroStartMs, 5);
    expect(at2997.outroEndMs).toBeCloseTo(at50.outroEndMs, 5);
  });

  it('a zero/invalid fps degenerates every span to zero — never NaN', () => {
    const w = followWindowMs({ ...OWNER, fps: 0 }, { durationMs: 5000, holdAtMs: 3000 });
    expect(w.entranceSpanMs).toBe(0);
    expect(w.outSpanMs).toBe(0);
    expect(Number.isFinite(w.outroStartMs)).toBe(true);
  });
});

describe('followsComposition — the one spelling of "is this a follower"', () => {
  it('matches only the composition source, both kinds’ shapes', () => {
    expect(followsComposition({ source: 'composition' })).toBe(true);
    expect(followsComposition({ source: 'manual' })).toBe(false);
    expect(followsComposition({ source: 'markers' })).toBe(false);
    expect(followsComposition({})).toBe(false);
    expect(followsComposition(undefined)).toBe(false);
  });
});
