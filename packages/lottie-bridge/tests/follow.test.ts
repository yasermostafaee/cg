import { describe, expect, it } from 'vitest';
import type { FollowAnchors } from '@cg/shared-schema';
import { lottieFollowWindow } from '../src/timing.js';

/** D-176 — the Lottie adapter only converts composition-owned timing at the unit edge. */
const OWNER: FollowAnchors = {
  activeIn: 0,
  contentStart: 25,
  outPoint: 37.5,
  activeOut: 50,
  fps: 25,
};

describe('lottieFollowWindow — composition timing in animation frames', () => {
  it('maps a one-second entrance to the clip head and a half-second OUT to its ending', () => {
    const w = lottieFollowWindow({ ip: 0, op: 250, fr: 50 }, 1, OWNER);
    expect(w.introStartFrame).toBe(0);
    expect(w.holdFrame).toBe(50);
    expect(w.outroStartFrame).toBe(225);
    expect(w.outroEndFrame).toBe(250);
    expect(w.window.hasOutro).toBe(true);
    expect(w.introDelayMs).toBe(0);
  });

  it('offsets every result by a non-zero animation ip', () => {
    const w = lottieFollowWindow({ ip: 10, op: 260, fr: 50 }, 1, OWNER);
    expect(w.introStartFrame).toBe(10);
    expect(w.holdFrame).toBe(60);
    expect(w.outroStartFrame).toBe(235);
    expect(w.outroEndFrame).toBe(260);
  });

  it('includes playback speed when converting wall-clock spans to animation frames', () => {
    const w = lottieFollowWindow({ ip: 0, op: 500, fr: 50 }, 2, OWNER);
    expect(w.introStartFrame).toBe(0);
    expect(w.holdFrame).toBe(100);
    expect(w.outroStartFrame).toBe(450);
    expect(w.outroEndFrame).toBe(500);
  });

  it('ignores a legacy fourth argument containing internal media marks', () => {
    const callWithLegacyPhases = lottieFollowWindow as unknown as (
      meta: { ip: number; op: number; fr: number },
      speed: number,
      anchors: FollowAnchors,
      legacyPhases: unknown,
    ) => ReturnType<typeof lottieFollowWindow>;
    const clean = lottieFollowWindow({ ip: 0, op: 250, fr: 50 }, 1, OWNER);
    const legacy = callWithLegacyPhases({ ip: 0, op: 250, fr: 50 }, 1, OWNER, {
      introEnd: 150,
      outroStart: 180,
      holdAt: 160,
    });
    expect(legacy).toEqual(clean);
  });

  it('keeps equivalent wall-clock anchors stable across composition frame rates', () => {
    const meta = { ip: 0, op: 250, fr: 50 };
    const at2997 = lottieFollowWindow(meta, 1, {
      activeIn: 0,
      contentStart: 29.97,
      outPoint: 44.955,
      activeOut: 59.94,
      fps: 29.97,
    });
    const at50 = lottieFollowWindow(meta, 1, {
      activeIn: 0,
      contentStart: 50,
      outPoint: 75,
      activeOut: 100,
      fps: 50,
    });
    expect(Math.abs(at2997.holdFrame - at50.holdFrame)).toBeLessThanOrEqual(1);
    expect(Math.abs(at2997.outroStartFrame - at50.outroStartFrame)).toBeLessThanOrEqual(1);
  });

  it('clamps a clip shorter than the composition entrance', () => {
    const w = lottieFollowWindow({ ip: 0, op: 30, fr: 50 }, 1, OWNER);
    expect(w.holdFrame).toBe(30);
    expect(w.window.clamps.holdPastEnd).toBe(true);
    expect(w.window.clamps.introShort).toBe(true);
  });

  it('returns a finite degenerate window for malformed metadata', () => {
    const w = lottieFollowWindow({ ip: 0, op: 0, fr: 0 }, 1, OWNER);
    expect(w.introStartFrame).toBe(0);
    expect(w.holdFrame).toBe(0);
    expect(w.outroStartFrame).toBe(0);
    expect(w.outroEndFrame).toBe(0);
    expect(Number.isFinite(w.window.holdMs)).toBe(true);
  });
});
