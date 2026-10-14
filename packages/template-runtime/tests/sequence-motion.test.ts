import { describe, expect, it } from 'vitest';
import {
  driftOf,
  edgeOffset,
  sampleTransition,
  transitionTotalMs,
  type SequenceTransitionSpec,
} from '../src/sequence-motion.js';

const BOX = { width: 720, height: 72 };

function spec(p: Partial<SequenceTransitionSpec>): SequenceTransitionSpec {
  return {
    inEdge: 'bottom',
    outEdge: 'top',
    timing: 'simultaneous',
    transitionMs: 400,
    box: BOX,
    ...p,
  };
}

describe('sequence motion mapper (D-029)', () => {
  it('maps each edge to the fully-offscreen vector for the clipped box', () => {
    expect(edgeOffset('top', BOX)).toEqual({ x: 0, y: -72 });
    expect(edgeOffset('bottom', BOX)).toEqual({ x: 0, y: 72 });
    expect(edgeOffset('left', BOX)).toEqual({ x: -720, y: 0 });
    expect(edgeOffset('right', BOX)).toEqual({ x: 720, y: 0 });
    expect(edgeOffset('none', BOX)).toBeNull();
  });

  it('simultaneous (push): both motions share the clock, each over transitionMs', () => {
    const s = spec({});
    expect(transitionTotalMs(s)).toBe(400);
    const start = sampleTransition(s, 0);
    expect(start.out.offset).toEqual({ x: 0, y: 0 });
    expect(start.out.visible).toBe(true);
    expect(start.in.offset).toEqual({ x: 0, y: 72 }); // waiting at the IN edge
    expect(start.in.visible).toBe(true);
    const mid = sampleTransition(s, 200); // ease-in-out is symmetric: t=½ ⇒ p=½
    expect(mid.out.offset.y).toBeCloseTo(-36, 5);
    expect(mid.in.offset.y).toBeCloseTo(36, 5);
    expect(mid.done).toBe(false);
    const end = sampleTransition(s, 400);
    expect(end.done).toBe(true);
    expect(end.in.offset).toEqual({ x: 0, y: 0 });
    expect(end.out.visible).toBe(false); // fully exited
  });

  it('sequential: the entry NEVER begins before the exit completes (total 2×)', () => {
    const s = spec({ timing: 'sequential', inEdge: 'right', outEdge: 'left' });
    expect(transitionTotalMs(s)).toBe(800);
    const phase1 = sampleTransition(s, 399);
    expect(phase1.out.visible).toBe(true);
    expect(phase1.in.visible).toBe(false); // not on stage yet
    const boundary = sampleTransition(s, 400);
    expect(boundary.out.visible).toBe(false); // exit complete
    expect(boundary.in.visible).toBe(true);
    expect(boundary.in.offset.x).toBeCloseTo(720, 5); // entry just beginning
    const mid2 = sampleTransition(s, 600);
    expect(mid2.in.offset.x).toBeCloseTo(360, 5);
    const end = sampleTransition(s, 800);
    expect(end.done).toBe(true);
    expect(end.in.offset).toEqual({ x: 0, y: 0 });
  });

  it("an OUT of 'none' cuts the outgoing item away instantly (both timings)", () => {
    for (const timing of ['simultaneous', 'sequential'] as const) {
      const s = spec({ timing, outEdge: 'none' });
      expect(transitionTotalMs(s)).toBe(400); // only the entry takes time
      const start = sampleTransition(s, 0);
      expect(start.out.visible).toBe(false);
      expect(start.in.visible).toBe(true);
      expect(sampleTransition(s, 400).done).toBe(true);
    }
  });

  it("an IN of 'none' shows the incoming item at rest while the exit runs", () => {
    const s = spec({ inEdge: 'none' });
    expect(transitionTotalMs(s)).toBe(400); // only the exit takes time
    const start = sampleTransition(s, 0);
    expect(start.in.offset).toEqual({ x: 0, y: 0 });
    expect(start.in.visible).toBe(true);
    expect(start.out.visible).toBe(true);
    expect(sampleTransition(s, 400).done).toBe(true);
  });

  it('IN none + OUT none = the hide-show hard swap (zero total)', () => {
    const s = spec({ inEdge: 'none', outEdge: 'none' });
    expect(transitionTotalMs(s)).toBe(0);
    const frame = sampleTransition(s, 0);
    expect(frame.done).toBe(true);
    expect(frame.out.visible).toBe(false);
    expect(frame.in.visible).toBe(true);
    expect(frame.in.offset).toEqual({ x: 0, y: 0 });
  });

  it('eases through the SHARED ease-in-out curve (slow start, fast middle)', () => {
    const s = spec({});
    const early = sampleTransition(s, 100); // quarter time
    // ease-in-out at t=0.25 progresses LESS than linear would (≈0.13…0.2).
    expect(Math.abs(early.out.offset.y)).toBeLessThan(0.25 * 72);
    expect(Math.abs(early.out.offset.y)).toBeGreaterThan(0);
  });

  it('motion is monotonic — no overshoot past the resting/offscreen poses', () => {
    const s = spec({ inEdge: 'left', outEdge: 'right' });
    let prevIn = -720;
    for (let t = 0; t <= 400; t += 40) {
      const f = sampleTransition(s, t);
      expect(f.in.offset.x).toBeGreaterThanOrEqual(-720);
      expect(f.in.offset.x).toBeLessThanOrEqual(0);
      expect(f.in.offset.x).toBeGreaterThanOrEqual(prevIn - 1e-9);
      prevIn = f.in.offset.x;
    }
  });
});

describe('D-163 — the fade edge', () => {
  it('a fade moves nothing and lasts transitionMs', () => {
    expect(edgeOffset('fade', BOX)).toEqual({ x: 0, y: 0 });
    expect(transitionTotalMs(spec({ inEdge: 'fade', outEdge: 'fade' }))).toBe(400);
    expect(transitionTotalMs(spec({ inEdge: 'fade', outEdge: 'fade', timing: 'sequential' }))).toBe(
      800,
    );
  });

  it('🔴 a CROSSFADE (both fade, simultaneous) is a mixed dissolve, eased, then plain at rest', () => {
    const s = spec({ inEdge: 'fade', outEdge: 'fade' });
    const start = sampleTransition(s, 0);
    expect([start.out.opacity, start.in.opacity, start.mix]).toEqual([1, 0, true]);
    const mid = sampleTransition(s, 200); // symmetric ease: t=½ ⇒ p=½
    expect(mid.out.opacity).toBeCloseTo(0.5, 5);
    expect(mid.in.opacity).toBeCloseTo(0.5, 5);
    expect(mid.mix).toBe(true);
    // Both stay where they are: a fade has no motion in space.
    expect([mid.out.offset, mid.in.offset]).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
    const end = sampleTransition(s, 400);
    expect([end.done, end.in.opacity, end.mix]).toEqual([true, 1, false]);
  });

  it('sequential fades OUT, then IN — never mixed', () => {
    const s = spec({ inEdge: 'fade', outEdge: 'fade', timing: 'sequential' });
    const first = sampleTransition(s, 200);
    expect(first.out.opacity).toBeCloseTo(0.5, 5);
    expect(first.in.visible).toBe(false);
    const second = sampleTransition(s, 600);
    expect(second.out.visible).toBe(false);
    expect(second.in.opacity).toBeCloseTo(0.5, 5);
    expect(first.mix || second.mix).toBe(false);
  });

  it('🔴 a DRIFT fade nudges a few pixels into place while fading in — never from off-screen', () => {
    // 3 % of the box, 6..40 px: 720 → 22 px, 1920 → 40 px (capped), 100 → 6 px (floor).
    expect(driftOf({ width: 720, height: 72 })).toBe(22);
    expect(driftOf({ width: 1920, height: 1080 })).toBe(40);
    expect(driftOf({ width: 100, height: 40 })).toBe(6);
    expect(edgeOffset('fade-right', BOX)).toEqual({ x: 22, y: 0 });
    expect(edgeOffset('fade-left', BOX)).toEqual({ x: -22, y: 0 });
    const s = spec({ inEdge: 'fade-right', outEdge: 'fade' });
    const start = sampleTransition(s, 0);
    expect([start.in.offset.x, start.in.opacity, start.out.offset.x, start.out.opacity]).toEqual([
      22, 0, 0, 1,
    ]);
    expect(start.mix).toBe(true); // both sides fade: still a dissolve, so nothing dims
    const mid = sampleTransition(s, 200);
    expect(mid.in.offset.x).toBeCloseTo(11, 5);
    expect(mid.in.opacity).toBeCloseTo(0.5, 5);
    expect(mid.out.offset).toEqual({ x: 0, y: 0 }); // the current item fades where it is
    const end = sampleTransition(s, 400);
    expect([end.in.offset, end.in.opacity, end.done]).toEqual([{ x: 0, y: 0 }, 1, true]);
  });

  it('🔴 the drift goes up and down too — along the HEIGHT, by the same nudge rule', () => {
    // BOX is 720 × 72: 3 % of 72 is ~2 px, so the 6 px floor holds; a 1080-high book drifts 32 px.
    expect(driftOf(BOX, 'y')).toBe(6);
    expect(driftOf({ width: 1920, height: 1080 }, 'y')).toBe(32);
    expect(edgeOffset('fade-bottom', BOX)).toEqual({ x: 0, y: 6 });
    expect(edgeOffset('fade-top', BOX)).toEqual({ x: 0, y: -6 });
    const s = spec({ inEdge: 'fade-bottom', outEdge: 'fade', box: { width: 1920, height: 1080 } });
    const mid = sampleTransition(s, 200);
    expect(mid.in.offset.y).toBeCloseTo(16, 5); // half-way up from 32 px below
    expect(mid.in.opacity).toBeCloseTo(0.5, 5);
    expect(mid.mix).toBe(true);
    expect(sampleTransition(s, 400).in.offset).toEqual({ x: 0, y: 0 });
  });

  it('a one-sided fade does not mix; a slide never touches opacity', () => {
    const half = sampleTransition(spec({ inEdge: 'fade', outEdge: 'none' }), 200);
    expect([half.out.visible, half.mix]).toEqual([false, false]);
    expect(half.in.opacity).toBeCloseTo(0.5, 5);
    for (let t = 0; t <= 400; t += 100) {
      const f = sampleTransition(spec({}), t);
      expect([f.out.opacity, f.in.opacity, f.mix]).toEqual([1, 1, false]);
    }
  });
});
