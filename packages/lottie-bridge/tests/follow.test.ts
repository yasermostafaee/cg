import { describe, expect, it } from 'vitest';
import type { FollowAnchors } from '@cg/shared-schema';
import { lottieClipMidpoint, lottieFollowClipFacts, lottieFollowWindow } from '../src/timing.js';

/**
 * media-phases-follow-composition — the LOTTIE unit adapter. It converts animation frames ↔
 * clip ms at the edge (`fr × speed`) and delegates every comp-side decision to
 * `followWindowMs` (`@cg/shared-schema`), so the comp arithmetic exists exactly once.
 *
 * ⭐ SESSION Y RE-PIN, deliberate: the OUTRO ANCHOR MOVED (the corrected rule — a follower's
 * outro is the clip's own ending) and the adapter's signature takes the WHOLE phases block:
 * authored `introEnd`/`outroStart` (real markers) now WIN, and the attach seed signature
 * (`introEnd == lottieClipMidpoint`, `outroStart == op`) derives as if absent. Intro/hold
 * frames keep their old assertions byte-for-byte.
 */

/** The owner's decisive case in comp terms: 2 s comp at 25 fps, content start 1 s, OUT 0.5 s. */
const OWNER: FollowAnchors = {
  activeIn: 0,
  contentStart: 25,
  outPoint: 37.5,
  activeOut: 50,
  fps: 25,
};

describe('lottieFollowWindow — frames at the edge, ms in the middle', () => {
  it("the owner's case in ANIMATION frames: intro [100 → 150], hold 150, outro [225 → 250] — the clip's ending", () => {
    // 5 s clip: ip 0, op 250 at fr 50 (speed 1). holdAt = clip-second 3 = frame 150.
    const w = lottieFollowWindow({ ip: 0, op: 250, fr: 50 }, 1, OWNER, { holdAt: 150 });
    expect(w.introStartFrame).toBe(100); // clip-second 2 — UNCHANGED
    expect(w.holdFrame).toBe(150); // clip-second 3 — UNCHANGED
    expect(w.outroStartFrame).toBe(225); // clipEnd − 0.5 s OUT — the corrected anchor
    expect(w.outroEndFrame).toBe(250); // the clip's LAST frame, always
    expect(w.window.hasOutro).toBe(true);
    expect(w.introDelayMs).toBe(0);
  });

  it('a non-zero `ip` offsets every frame — holdAt is an ABSOLUTE animation frame', () => {
    const w = lottieFollowWindow({ ip: 10, op: 260, fr: 50 }, 1, OWNER, { holdAt: 160 });
    expect(w.introStartFrame).toBe(110);
    expect(w.holdFrame).toBe(160);
    expect(w.outroStartFrame).toBe(235); // op − 25 frames (0.5 s at fr 50)
    expect(w.outroEndFrame).toBe(260);
  });

  it('speed folds into the conversion — the window changes WHICH frames play, never the rate', () => {
    // speed 2 ⇒ 100 animation frames per second: the 1 s entrance covers 100 frames.
    const w = lottieFollowWindow({ ip: 0, op: 500, fr: 50 }, 2, OWNER, { holdAt: 300 });
    expect(w.introStartFrame).toBe(200);
    expect(w.holdFrame).toBe(300);
    expect(w.outroStartFrame).toBe(450); // 0.5 s OUT = 50 frames at speed 2, off the END
    expect(w.outroEndFrame).toBe(500);
  });

  it('absent phases entirely degenerate to the clip head + the clip ending', () => {
    const w = lottieFollowWindow({ ip: 0, op: 250, fr: 50 }, 1, OWNER, undefined);
    expect(w.introStartFrame).toBe(0);
    expect(w.holdFrame).toBe(50); // 1 s entrance at fr 50
    expect(w.outroStartFrame).toBe(225);
    expect(w.outroEndFrame).toBe(250);
  });

  it('clamps ride through from the core helper — a stale holdAt past op clamps to op and flags', () => {
    const w = lottieFollowWindow({ ip: 0, op: 100, fr: 50 }, 1, OWNER, { holdAt: 400 });
    expect(w.holdFrame).toBe(100);
    expect(w.window.clamps.holdPastEnd).toBe(true);
    // The ending still plays under the corrected rule: [75 → 100] — a backward seam jump.
    expect(w.outroStartFrame).toBe(75);
    expect(w.window.hasOutro).toBe(true);
    expect(w.window.clamps.holdJump).toBe(true);
  });

  it('AUTHORED markers WIN: the clip’s own [outroStart → op] plays, the intro delays to finish at content start', () => {
    // Real markers on a 5 s clip: intro [0 → 30] (0.6 s), outro [200 → 250] (1 s).
    const w = lottieFollowWindow({ ip: 0, op: 250, fr: 50 }, 1, OWNER, {
      introEnd: 30,
      outroStart: 200,
    });
    expect(w.window.authored).toBe(true);
    expect(w.holdFrame).toBe(30); // the hold frame IS the authored introEnd
    expect(w.introDelayMs).toBeCloseTo(400); // parks 0.4 s so the 0.6 s intro settles at 1 s
    expect(w.outroStartFrame).toBe(200); // the clip's own outro
    expect(w.outroEndFrame).toBe(250);
    // 1 s of authored outro against the 0.5 s OUT segment — flagged, never rescaled.
    expect(w.window.clamps.outroCutByRemoval).toBe(true);
  });

  it('the attach SEED SIGNATURE (midpoint / op) derives as if absent', () => {
    const meta = { ip: 0, op: 250, fr: 50 };
    expect(lottieClipMidpoint(meta)).toBe(125);
    expect(lottieFollowClipFacts(meta, { introEnd: 125, outroStart: 250 })).toEqual({});
    expect(lottieFollowClipFacts(meta, { introEnd: 30, outroStart: 250 })).toEqual({
      authoredIntroEndFrame: 30,
    });
    const seeded = lottieFollowWindow(meta, 1, OWNER, { introEnd: 125, outroStart: 250 });
    expect(seeded.window.authored).toBe(false);
    expect(seeded.holdFrame).toBe(50); // derives exactly as absent phases
  });

  it('29.97 and 50 fps comps agree within one comp frame on where the hold lands', () => {
    const meta = { ip: 0, op: 250, fr: 50 };
    const at2997 = lottieFollowWindow(
      meta,
      1,
      { activeIn: 0, contentStart: 29.97, outPoint: 44.955, activeOut: 59.94, fps: 29.97 },
      { holdAt: 150 },
    );
    const at50 = lottieFollowWindow(
      meta,
      1,
      { activeIn: 0, contentStart: 50, outPoint: 75, activeOut: 100, fps: 50 },
      { holdAt: 150 },
    );
    // Same wall-clock anchors ⇒ the same frames, within the one-frame rounding at the edge.
    expect(Math.abs(at2997.introStartFrame - at50.introStartFrame)).toBeLessThanOrEqual(1);
    expect(at2997.holdFrame).toBe(150);
    expect(at50.holdFrame).toBe(150);
    expect(Math.abs(at2997.outroStartFrame - at50.outroStartFrame)).toBeLessThanOrEqual(1);
  });

  it('a malformed clip (fr 0) yields a degenerate window at ip rather than NaN', () => {
    const w = lottieFollowWindow({ ip: 0, op: 0, fr: 0 }, 1, OWNER, { holdAt: 10 });
    expect(w.introStartFrame).toBe(0);
    expect(w.holdFrame).toBe(0);
    expect(w.outroStartFrame).toBe(0);
    expect(w.outroEndFrame).toBe(0);
    expect(Number.isFinite(w.window.holdMs)).toBe(true);
  });
});
