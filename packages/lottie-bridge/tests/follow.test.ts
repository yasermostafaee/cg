import { describe, expect, it } from 'vitest';
import type { FollowAnchors } from '@cg/shared-schema';
import { lottieFollowWindow } from '../src/timing.js';

/**
 * media-phases-follow-composition — the LOTTIE unit adapter. It converts animation frames ↔
 * clip ms at the edge (`fr × speed`) and delegates every comp-side decision to
 * `followWindowMs` (`@cg/shared-schema`), so the comp arithmetic exists exactly once.
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
  it("the owner's case in ANIMATION frames: 5 s clip at fr 50 ⇒ window [100 → 150] / 150 / [150 → 175]", () => {
    // 5 s clip: ip 0, op 250 at fr 50 (speed 1). holdAt = clip-second 3 = frame 150.
    const w = lottieFollowWindow({ ip: 0, op: 250, fr: 50 }, 1, OWNER, 150);
    expect(w.introStartFrame).toBe(100); // clip-second 2
    expect(w.holdFrame).toBe(150); // clip-second 3
    expect(w.outroEndFrame).toBe(175); // clip-second 3.5
    expect(w.window.hasOutro).toBe(true);
  });

  it('a non-zero `ip` offsets every frame — holdAt is an ABSOLUTE animation frame', () => {
    const w = lottieFollowWindow({ ip: 10, op: 260, fr: 50 }, 1, OWNER, 160);
    expect(w.introStartFrame).toBe(110);
    expect(w.holdFrame).toBe(160);
    expect(w.outroEndFrame).toBe(185);
  });

  it('speed folds into the conversion — the window changes WHICH frames play, never the rate', () => {
    // speed 2 ⇒ 100 animation frames per second: the 1 s entrance covers 100 frames.
    const w = lottieFollowWindow({ ip: 0, op: 500, fr: 50 }, 2, OWNER, 300);
    expect(w.introStartFrame).toBe(200);
    expect(w.holdFrame).toBe(300);
    expect(w.outroEndFrame).toBe(350); // 0.5 s OUT = 50 frames at speed 2
  });

  it('absent holdAt degenerates to the clip head', () => {
    const w = lottieFollowWindow({ ip: 0, op: 250, fr: 50 }, 1, OWNER, undefined);
    expect(w.introStartFrame).toBe(0);
    expect(w.holdFrame).toBe(50); // 1 s entrance at fr 50
    expect(w.outroEndFrame).toBe(75);
  });

  it('clamps ride through from the core helper — a stale holdAt past op clamps to op and flags', () => {
    const w = lottieFollowWindow({ ip: 0, op: 100, fr: 50 }, 1, OWNER, 400);
    expect(w.holdFrame).toBe(100);
    expect(w.window.clamps.holdPastEnd).toBe(true);
    expect(w.window.hasOutro).toBe(false);
  });

  it('29.97 and 50 fps comps agree within one comp frame on where the hold lands', () => {
    const meta = { ip: 0, op: 250, fr: 50 };
    const at2997 = lottieFollowWindow(
      meta,
      1,
      { activeIn: 0, contentStart: 29.97, outPoint: 44.955, activeOut: 59.94, fps: 29.97 },
      150,
    );
    const at50 = lottieFollowWindow(
      meta,
      1,
      { activeIn: 0, contentStart: 50, outPoint: 75, activeOut: 100, fps: 50 },
      150,
    );
    // Same wall-clock anchors ⇒ the same frames, within the one-frame rounding at the edge.
    expect(Math.abs(at2997.introStartFrame - at50.introStartFrame)).toBeLessThanOrEqual(1);
    expect(at2997.holdFrame).toBe(150);
    expect(at50.holdFrame).toBe(150);
    expect(Math.abs(at2997.outroEndFrame - at50.outroEndFrame)).toBeLessThanOrEqual(1);
  });

  it('a malformed clip (fr 0) yields a degenerate window at ip rather than NaN', () => {
    const w = lottieFollowWindow({ ip: 0, op: 0, fr: 0 }, 1, OWNER, 10);
    expect(w.introStartFrame).toBe(0);
    expect(w.holdFrame).toBe(0);
    expect(w.outroEndFrame).toBe(0);
    expect(Number.isFinite(w.window.holdMs)).toBe(true);
  });
});
