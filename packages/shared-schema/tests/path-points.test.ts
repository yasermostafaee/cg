import { describe, expect, it } from 'vitest';
import {
  AnimatablePropertySchema,
  KeyframeSchema,
  PathKeyframeValueSchema,
  clonePathPoints,
  isPathKeyframeValue,
  lerpPathSnapshot,
  pathKeyframeValuesEqual,
  type AnchorPoint,
  type PathKeyframeValue,
} from '../src/index.js';

const corner = (id: string, x: number, y: number): AnchorPoint => ({ id, x, y, smooth: false });

const snap = (points: AnchorPoint[]): PathKeyframeValue => ({ kind: 'path', points });

describe('PathKeyframeValueSchema (D-110)', () => {
  it('accepts a snapshot of >= 2 anchors and rejects fewer', () => {
    expect(
      PathKeyframeValueSchema.safeParse(snap([corner('a', 0, 0), corner('b', 9, 9)])).success,
    ).toBe(true);
    expect(PathKeyframeValueSchema.safeParse(snap([corner('a', 0, 0)])).success).toBe(false);
  });

  it('is a valid Keyframe value alongside numbers and colors', () => {
    const kf = {
      frame: 10,
      value: snap([corner('a', 0, 0), corner('b', 50, 0)]),
      easing: 'linear',
    };
    expect(KeyframeSchema.safeParse(kf).success).toBe(true);
    expect(KeyframeSchema.safeParse({ ...kf, value: 5 }).success).toBe(true);
    expect(KeyframeSchema.safeParse({ ...kf, value: '#FF0000' }).success).toBe(true);
  });

  it("registers 'path' as an animatable property", () => {
    expect(AnimatablePropertySchema.safeParse('path').success).toBe(true);
  });

  it('isPathKeyframeValue narrows only the snapshot variant', () => {
    expect(isPathKeyframeValue(snap([corner('a', 0, 0), corner('b', 1, 1)]))).toBe(true);
    expect(isPathKeyframeValue(5)).toBe(false);
    expect(isPathKeyframeValue('#FFFFFF')).toBe(false);
    expect(isPathKeyframeValue(null)).toBe(false);
  });

  it('round-trips through JSON with ids and handles intact', () => {
    const value = snap([
      { id: 'a', x: 0, y: 0, out: { x: 20, y: -5 }, smooth: true },
      { id: 'b', x: 100, y: 40, in: { x: -20, y: 5 }, smooth: true },
    ]);
    const parsed = PathKeyframeValueSchema.parse(JSON.parse(JSON.stringify(value)));
    expect(parsed).toEqual(value);
  });
});

describe('clonePathPoints', () => {
  it('deep-copies anchors and handle vectors (no aliasing)', () => {
    const src: AnchorPoint[] = [
      { id: 'a', x: 1, y: 2, out: { x: 3, y: 4 }, smooth: true },
      corner('b', 5, 6),
    ];
    const copy = clonePathPoints(src);
    expect(copy).toEqual(src);
    expect(copy[0]).not.toBe(src[0]);
    expect(copy[0]?.out).not.toBe(src[0]?.out);
  });
});

describe('lerpPathSnapshot (D-110 id-matched interpolation)', () => {
  it('tweens matched anchors x/y at the given t (pure move)', () => {
    const a = snap([corner('p', 0, 0), corner('q', 100, 0)]);
    const b = snap([corner('p', 40, 20), corner('q', 100, 80)]);
    const mid = lerpPathSnapshot(a, b, 0.5);
    expect(mid.points).toEqual([
      { id: 'p', x: 20, y: 10, smooth: false },
      { id: 'q', x: 100, y: 40, smooth: false },
    ]);
  });

  it('receives an ALREADY-EASED t — 0.25 lands a quarter of the way', () => {
    const a = snap([corner('p', 0, 0), corner('q', 100, 0)]);
    const b = snap([corner('p', 40, 0), corner('q', 100, 0)]);
    expect(lerpPathSnapshot(a, b, 0.25).points[0]?.x).toBeCloseTo(10);
  });

  it('interpolates an absent handle from the zero vector (corner↔smooth morph)', () => {
    const a = snap([corner('p', 0, 0), corner('q', 100, 0)]);
    const b = snap([
      { id: 'p', x: 0, y: 0, out: { x: 40, y: -20 }, smooth: true },
      { id: 'q', x: 100, y: 0, in: { x: -40, y: 20 }, smooth: true },
    ]);
    const mid = lerpPathSnapshot(a, b, 0.5);
    expect(mid.points[0]?.out).toEqual({ x: 20, y: -10 });
    expect(mid.points[1]?.in).toEqual({ x: -20, y: 10 });
    // Handles absent on BOTH sides stay absent.
    expect(mid.points[0]?.in).toBeUndefined();
    expect(mid.points[1]?.out).toBeUndefined();
  });

  it('keeps the LEADING order; a leading-only id holds; a trailing-only id is omitted', () => {
    const a = snap([corner('p', 0, 0), corner('gone', 50, 50), corner('q', 100, 0)]);
    const b = snap([corner('p', 20, 0), corner('q', 100, 20), corner('new', 200, 200)]);
    const mid = lerpPathSnapshot(a, b, 0.5);
    expect(mid.points.map((pt) => pt.id)).toEqual(['p', 'gone', 'q']);
    // 'gone' (leading-only) held at its leading value.
    expect(mid.points[1]).toEqual(corner('gone', 50, 50));
    // matched ids still tween.
    expect(mid.points[0]?.x).toBeCloseTo(10);
    expect(mid.points[2]?.y).toBeCloseTo(10);
  });

  it('takes the smooth flag from the leading anchor (editor metadata)', () => {
    const a = snap([corner('p', 0, 0), corner('q', 100, 0)]);
    const b = snap([
      { id: 'p', x: 0, y: 0, smooth: true },
      { id: 'q', x: 100, y: 0, smooth: true },
    ]);
    expect(lerpPathSnapshot(a, b, 0.5).points[0]?.smooth).toBe(false);
  });
});

describe('pathKeyframeValuesEqual', () => {
  const base = snap([
    { id: 'a', x: 0, y: 0, out: { x: 20, y: 0 }, smooth: true },
    corner('b', 100, 0),
  ]);

  it('equal snapshots (within epsilon) compare equal', () => {
    const other = snap([
      { id: 'a', x: 1e-9, y: 0, out: { x: 20, y: 0 }, smooth: true },
      corner('b', 100, 0),
    ]);
    expect(pathKeyframeValuesEqual(base, other)).toBe(true);
  });

  it('an absent handle equals the zero vector (mirrors the lerp rule)', () => {
    const zeroed = snap([
      { id: 'a', x: 0, y: 0, out: { x: 20, y: 0 }, in: { x: 0, y: 0 }, smooth: true },
      corner('b', 100, 0),
    ]);
    expect(pathKeyframeValuesEqual(base, zeroed)).toBe(true);
  });

  it('differing coords, ids, or counts compare unequal', () => {
    expect(pathKeyframeValuesEqual(base, snap([corner('a', 5, 0), corner('b', 100, 0)]))).toBe(
      false,
    );
    expect(pathKeyframeValuesEqual(base, snap([corner('z', 0, 0), corner('b', 100, 0)]))).toBe(
      false,
    );
    expect(pathKeyframeValuesEqual(base, snap([...base.points, corner('c', 1, 1)]))).toBe(false);
  });
});
