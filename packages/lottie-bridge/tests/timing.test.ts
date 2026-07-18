import { describe, expect, it } from 'vitest';
import { lottieClipMeta, lottieTiming } from '../src/timing.js';

/**
 * D-125 Phase 3a — the ONE shared frame-space conversion. The runtime derives the
 * composition's entrance settle from `settleOffset`; the Designer Inspector renders the
 * same breakdown. These assert the conversion itself, so both consumers are pinned to
 * the same arithmetic.
 */

const clip = (over: Record<string, unknown> = {}): unknown => ({
  ip: 0,
  op: 100,
  fr: 30,
  w: 400,
  h: 200,
  layers: [],
  ...over,
});

describe('lottieClipMeta — defensive bodymovin metadata', () => {
  it('reads ip / op / fr off a parsed animation', () => {
    expect(lottieClipMeta(clip({ ip: 5, op: 90, fr: 60 }))).toEqual({ ip: 5, op: 90, fr: 60 });
  });

  it('falls back to fr 30 and a degenerate [0, 0] span for malformed JSON', () => {
    expect(lottieClipMeta(null)).toEqual({ ip: 0, op: 0, fr: 30 });
    expect(lottieClipMeta({ ip: 'x', op: undefined, fr: Number.NaN })).toEqual({
      ip: 0,
      op: 0,
      fr: 30,
    });
  });
});

describe('lottieTiming — animation frames → seconds → composition frames', () => {
  it('THE WORKED EXAMPLE: introEnd 20 @ fr 30, speed 1, comp 50fps → 0.667s → frame 33', () => {
    const t = lottieTiming({
      data: clip(),
      speed: 1,
      phases: { introEnd: 20, outroStart: 80 },
      compositionFps: 50,
    });
    expect(t.intro.frames).toBe(20);
    expect(t.intro.seconds).toBeCloseTo(0.6667, 4);
    expect(t.intro.compFrames).toBe(33);
    expect(t.settleOffset).toBe(33);
  });

  it('speed 2 HALVES the derived composition frame (the conversion honours speed)', () => {
    const t = lottieTiming({
      data: clip(),
      speed: 2,
      phases: { introEnd: 20, outroStart: 80 },
      compositionFps: 50,
    });
    expect(t.intro.seconds).toBeCloseTo(0.3333, 4);
    // round(0.3333 × 50) = 17 — half of 33, rounded up off 16.67.
    expect(t.settleOffset).toBe(17);
  });

  it('a MARKER-LESS clip contributes NO settle (the introEnd = op fallback is not an authored intro)', () => {
    const t = lottieTiming({ data: clip(), speed: 1, compositionFps: 50 });
    expect(t.hasPhases).toBe(false);
    expect(t.settleOffset).toBeNull();
    // …but the DISPLAY still mirrors what the driver actually does: whole clip = intro.
    expect(t.intro.frames).toBe(100);
    expect(t.hold.frames).toBe(0);
    expect(t.outro.frames).toBe(0);
  });

  it('breaks the clip into intro / hold / outro in all three spaces', () => {
    const t = lottieTiming({
      data: clip({ fr: 25, op: 100 }),
      speed: 1,
      phases: { introEnd: 25, outroStart: 75 },
      compositionFps: 50,
    });
    expect(t.clip.seconds).toBeCloseTo(4, 6);
    expect(t.intro.seconds).toBeCloseTo(1, 6);
    expect(t.intro.compFrames).toBe(50);
    expect(t.hold.seconds).toBeCloseTo(2, 6);
    expect(t.hold.compFrames).toBe(100);
    expect(t.outro.seconds).toBeCloseTo(1, 6);
    expect(t.outro.compFrames).toBe(50);
  });

  it('honours the clip in-point: the intro is [ip → introEnd], not [0 → introEnd]', () => {
    const t = lottieTiming({
      data: clip({ ip: 10, op: 100, fr: 30 }),
      speed: 1,
      phases: { introEnd: 30, outroStart: 80 },
      compositionFps: 30,
    });
    expect(t.intro.frames).toBe(20); // 30 − 10
    expect(t.settleOffset).toBe(20);
  });

  it('clamps malformed markers into [ip, op] and keeps the spans monotonic', () => {
    const t = lottieTiming({
      data: clip({ op: 50 }),
      speed: 1,
      // introEnd past `op`, outroStart BEFORE introEnd — both nonsense.
      phases: { introEnd: 999, outroStart: 5 },
      compositionFps: 50,
    });
    expect(t.intro.to).toBe(50);
    expect(t.hold.frames).toBe(0);
    expect(t.outro.frames).toBe(0);
    expect(t.intro.frames).toBe(50);
  });

  it('never yields NaN/Infinity for a degenerate clip or a bad speed', () => {
    const t = lottieTiming({
      data: null,
      speed: 0,
      phases: { introEnd: 10, outroStart: 10 },
      compositionFps: 50,
    });
    expect(t.speed).toBe(1); // non-positive speed falls back
    expect(Number.isFinite(t.intro.seconds)).toBe(true);
    expect(t.settleOffset).toBe(0);
  });
});
