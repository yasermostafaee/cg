import { describe, expect, it } from 'vitest';
import {
  followWindowMs,
  followsComposition,
  type FollowAnchors,
  type FollowClip,
} from '../src/index.js';

/** D-176 — Follow timing is derived only from composition anchors and clip duration. */
const OWNER: FollowAnchors = {
  activeIn: 0,
  contentStart: 25,
  outPoint: 37.5,
  activeOut: 50,
  fps: 25,
};

describe('followWindowMs — composition-owned intro, middle and outro', () => {
  it('maps the composition entrance to the clip head and the OUT to the clip ending', () => {
    const w = followWindowMs(OWNER, { durationMs: 5000 });
    expect(w.entranceSpanMs).toBeCloseTo(1000);
    expect(w.outSpanMs).toBeCloseTo(500);
    expect(w.introStartMs).toBe(0);
    expect(w.holdMs).toBeCloseTo(1000);
    expect(w.outroStartMs).toBeCloseTo(4500);
    expect(w.outroEndMs).toBeCloseTo(5000);
    expect(w.hasOutro).toBe(true);
    expect(w.authored).toBe(false);
    // The remaining [1 s → 4.5 s] is the middle that can freeze or loop.
    expect(w.outroStartMs).toBeGreaterThan(w.holdMs);
  });

  it('leaves the first 29 OUT frames for the text fade while keeping the video tail end-anchored', () => {
    const w = followWindowMs(
      { activeIn: 0, contentStart: 261, outPoint: 510, activeOut: 716, fps: 50 },
      { durationMs: 14_320, outroDelayFrames: 29 },
    );
    expect(w.outroDelayMs).toBe(580);
    expect(w.outroStartMs).toBe(10_780);
    expect(w.outroEndMs).toBe(14_320);
    expect(w.outSpanMs).toBe(4_120);
  });

  it('ignores legacy media phase properties even when a caller supplies them at runtime', () => {
    const legacy = {
      durationMs: 5000,
      holdAtMs: 3000,
      authoredIntroEndMs: 2400,
      authoredOutroStartMs: 3200,
    } as unknown as FollowClip;
    expect(followWindowMs(OWNER, legacy)).toEqual(followWindowMs(OWNER, { durationMs: 5000 }));
  });

  it('keeps the same wall-clock result at different composition frame rates', () => {
    const at2997 = followWindowMs(
      { activeIn: 0, contentStart: 29.97, outPoint: 44.955, activeOut: 59.94, fps: 29.97 },
      { durationMs: 5000 },
    );
    const at50 = followWindowMs(
      { activeIn: 0, contentStart: 50, outPoint: 75, activeOut: 100, fps: 50 },
      { durationMs: 5000 },
    );
    expect(at2997.holdMs).toBeCloseTo(at50.holdMs, 5);
    expect(at2997.outroStartMs).toBeCloseTo(at50.outroStartMs, 5);
    expect(at2997.outroEndMs).toBeCloseTo(at50.outroEndMs, 5);
  });
});

describe('followWindowMs — short and degenerate ranges', () => {
  it('clamps a clip shorter than the composition entrance and reports the early freeze', () => {
    const w = followWindowMs(OWNER, { durationMs: 600 });
    expect(w.introStartMs).toBe(0);
    expect(w.holdMs).toBe(600);
    expect(w.clamps.holdPastEnd).toBe(true);
    expect(w.clamps.introShort).toBe(true);
  });

  it('reports a composition with no OUT segment', () => {
    const w = followWindowMs({ ...OWNER, outPoint: OWNER.activeOut }, { durationMs: 5000 });
    expect(w.outSpanMs).toBe(0);
    expect(w.hasOutro).toBe(false);
    expect(w.outroStartMs).toBe(5000);
    expect(w.clamps.noOutSegment).toBe(true);
  });

  it('uses the whole clip as outro when the composition OUT is longer than the clip', () => {
    const w = followWindowMs(OWNER, { durationMs: 300 });
    expect(w.outroStartMs).toBe(0);
    expect(w.outroEndMs).toBe(300);
    expect(w.clamps.wholeClipOutro).toBe(true);
  });

  it('handles invalid fps without NaN', () => {
    const w = followWindowMs({ ...OWNER, fps: 0 }, { durationMs: 5000 });
    expect(w.entranceSpanMs).toBe(0);
    expect(w.outSpanMs).toBe(0);
    expect(w.holdMs).toBe(0);
    expect(Number.isFinite(w.outroStartMs)).toBe(true);
  });
});

describe('followsComposition — the one spelling of “is this a follower”', () => {
  it('matches only the composition source', () => {
    expect(followsComposition({ source: 'composition' })).toBe(true);
    expect(followsComposition({ source: 'manual' })).toBe(false);
    expect(followsComposition({ source: 'markers' })).toBe(false);
    expect(followsComposition({})).toBe(false);
    expect(followsComposition(undefined)).toBe(false);
  });
});
