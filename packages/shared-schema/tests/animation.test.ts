import { describe, expect, it } from 'vitest';
import {
  AnimatablePropertySchema,
  BezierEasingSchema,
  EASING_PRESETS,
  EasingSchema,
  ElementAnimationSchema,
  FrameRangeSchema,
  KeyframeSchema,
  KeyframeValueSchema,
  TrackSchema,
  cubicBezierEase,
} from '../src/animation.js';

describe('cubicBezierEase', () => {
  it('clamps the endpoints', () => {
    expect(cubicBezierEase([0.42, 0, 0.58, 1], 0)).toBe(0);
    expect(cubicBezierEase([0.42, 0, 0.58, 1], 1)).toBe(1);
  });

  it('linear preset is the identity', () => {
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(cubicBezierEase([0, 0, 1, 1], t)).toBeCloseTo(t, 4);
    }
  });

  it('is monotonic increasing for ease-in', () => {
    let prev = -1;
    for (let i = 0; i <= 10; i++) {
      const v = cubicBezierEase([0.42, 0, 1, 1], i / 10);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('ease-in stays below the linear line mid-curve (slow start)', () => {
    expect(cubicBezierEase([0.42, 0, 1, 1], 0.5)).toBeLessThan(0.5);
  });

  it('every preset is a valid bézier tuple', () => {
    for (const preset of Object.values(EASING_PRESETS)) {
      expect(BezierEasingSchema.safeParse(preset).success).toBe(true);
    }
  });
});

/**
 * Phase 9 / M12.0 — keyframe schema unit tests. Replaces the v1
 * preset-era animation tests (entry/loop/exit kinds).
 */

describe('EasingSchema', () => {
  it.each(['linear', 'step', 'ease-in', 'ease-out', 'ease-in-out'] as const)(
    'accepts %s',
    (curve) => {
      expect(() => EasingSchema.parse(curve)).not.toThrow();
    },
  );

  it('rejects an unknown easing name', () => {
    expect(() => EasingSchema.parse('cubic-bezier')).toThrow();
  });
});

describe('KeyframeValueSchema', () => {
  it('accepts numbers', () => {
    expect(() => KeyframeValueSchema.parse(0)).not.toThrow();
    expect(() => KeyframeValueSchema.parse(123.45)).not.toThrow();
    expect(() => KeyframeValueSchema.parse(-50)).not.toThrow();
  });

  it('accepts hex color strings', () => {
    expect(() => KeyframeValueSchema.parse('#FF0000')).not.toThrow();
    expect(() => KeyframeValueSchema.parse('#0F172A')).not.toThrow();
  });

  it('rejects arbitrary strings', () => {
    expect(() => KeyframeValueSchema.parse('hello')).toThrow();
  });

  it('rejects booleans + objects + arrays', () => {
    expect(() => KeyframeValueSchema.parse(true)).toThrow();
    expect(() => KeyframeValueSchema.parse({ x: 1 })).toThrow();
    expect(() => KeyframeValueSchema.parse([1])).toThrow();
  });
});

describe('KeyframeSchema', () => {
  it('accepts a numeric keyframe', () => {
    expect(() => KeyframeSchema.parse({ frame: 10, value: 200, easing: 'linear' })).not.toThrow();
  });

  it('accepts a color keyframe', () => {
    expect(() =>
      KeyframeSchema.parse({ frame: 5, value: '#9BCC28', easing: 'ease-in-out' }),
    ).not.toThrow();
  });

  it('rejects negative frame', () => {
    expect(() => KeyframeSchema.parse({ frame: -1, value: 0, easing: 'linear' })).toThrow();
  });

  it('rejects non-integer frame', () => {
    expect(() => KeyframeSchema.parse({ frame: 1.5, value: 0, easing: 'linear' })).toThrow();
  });
});

describe('TrackSchema', () => {
  it('accepts a track with one keyframe', () => {
    expect(() =>
      TrackSchema.parse({ keyframes: [{ frame: 0, value: 0, easing: 'linear' }] }),
    ).not.toThrow();
  });

  it('accepts a track with many keyframes', () => {
    expect(() =>
      TrackSchema.parse({
        keyframes: [
          { frame: 0, value: 0, easing: 'linear' },
          { frame: 10, value: 100, easing: 'ease-out' },
          { frame: 20, value: 200, easing: 'step' },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects an empty keyframes array', () => {
    expect(() => TrackSchema.parse({ keyframes: [] })).toThrow();
  });
});

describe('AnimatablePropertySchema', () => {
  it.each([
    'position.x',
    'position.y',
    'size.w',
    'size.h',
    'scale.x',
    'scale.y',
    'rotation',
    'opacity',
    'fill.color',
    'text.color',
  ] as const)('accepts %s', (prop) => {
    expect(() => AnimatablePropertySchema.parse(prop)).not.toThrow();
  });

  it('rejects an unknown property', () => {
    // `font.size` joined the enum with D-010; use a genuinely
    // unknown path here.
    expect(() => AnimatablePropertySchema.parse('not.a.property')).toThrow();
  });
});

describe('ElementAnimationSchema', () => {
  it('accepts an empty tracks record', () => {
    expect(() => ElementAnimationSchema.parse({ tracks: {} })).not.toThrow();
  });

  it('accepts a single-property animation', () => {
    expect(() =>
      ElementAnimationSchema.parse({
        tracks: {
          'position.x': {
            keyframes: [
              { frame: 0, value: 0, easing: 'linear' },
              { frame: 25, value: 500, easing: 'linear' },
            ],
          },
        },
      }),
    ).not.toThrow();
  });

  it('accepts multiple keyframed properties on one element', () => {
    expect(() =>
      ElementAnimationSchema.parse({
        tracks: {
          'position.x': { keyframes: [{ frame: 0, value: 0, easing: 'linear' }] },
          'fill.color': {
            keyframes: [{ frame: 0, value: '#9BCC28', easing: 'ease-in-out' }],
          },
          opacity: { keyframes: [{ frame: 0, value: 1, easing: 'linear' }] },
        },
      }),
    ).not.toThrow();
  });

  it('rejects unknown track property keys', () => {
    // `font.size` joined the enum with D-010; use a genuinely
    // unknown path here.
    expect(() =>
      ElementAnimationSchema.parse({
        tracks: {
          'not.a.property': { keyframes: [{ frame: 0, value: 16, easing: 'linear' }] },
        },
      }),
    ).toThrow();
  });
});

describe('FrameRangeSchema', () => {
  it('accepts a [0, 50] range', () => {
    expect(() => FrameRangeSchema.parse({ in: 0, out: 50 })).not.toThrow();
  });

  it('rejects negative bounds', () => {
    expect(() => FrameRangeSchema.parse({ in: -1, out: 50 })).toThrow();
  });
});
