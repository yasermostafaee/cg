import { describe, expect, it } from 'vitest';
import {
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
