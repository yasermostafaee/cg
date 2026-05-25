import { describe, expect, it } from 'vitest';
import type { Track } from '@cg/shared-schema';
import {
  applyEasing,
  interpolateAtFrame,
  isColorProperty,
  lerpHexColor,
} from '../src/keyframe-eval.js';

describe('applyEasing', () => {
  it('linear returns t unchanged', () => {
    expect(applyEasing('linear', 0)).toBe(0);
    expect(applyEasing('linear', 0.5)).toBe(0.5);
    expect(applyEasing('linear', 1)).toBe(1);
  });

  it('step snaps to 0 until t reaches 1', () => {
    expect(applyEasing('step', 0)).toBe(0);
    expect(applyEasing('step', 0.99)).toBe(0);
    expect(applyEasing('step', 1)).toBe(1);
  });

  it('ease-in / ease-out are symmetric around t=0.5', () => {
    expect(applyEasing('ease-in', 0.5)).toBeCloseTo(0.25);
    expect(applyEasing('ease-out', 0.5)).toBeCloseTo(0.75);
  });

  it('ease-in-out hits 0.5 at t=0.5', () => {
    expect(applyEasing('ease-in-out', 0.5)).toBeCloseTo(0.5);
    expect(applyEasing('ease-in-out', 0)).toBeCloseTo(0);
    expect(applyEasing('ease-in-out', 1)).toBeCloseTo(1);
  });
});

describe('lerpHexColor', () => {
  it('lerps RGB linearly at t=0.5', () => {
    expect(lerpHexColor('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });

  it('returns endpoints at t=0 and t=1', () => {
    expect(lerpHexColor('#FF0000', '#00FF00', 0)).toBe('#FF0000');
    expect(lerpHexColor('#FF0000', '#00FF00', 1)).toBe('#00FF00');
  });

  it('preserves alpha when either input has alpha', () => {
    expect(lerpHexColor('#FF000000', '#FF0000FF', 0.5)).toBe('#FF000080');
  });
});

describe('interpolateAtFrame — numeric tracks', () => {
  const opacity: Track = {
    keyframes: [
      { frame: 0, value: 0, easing: 'linear' },
      { frame: 10, value: 1, easing: 'linear' },
    ],
  };

  it('returns first keyframe before the range', () => {
    expect(interpolateAtFrame(opacity, -5)).toBe(0);
  });

  it('returns last keyframe after the range', () => {
    expect(interpolateAtFrame(opacity, 999)).toBe(1);
  });

  it('lerps linearly between adjacent keyframes', () => {
    expect(interpolateAtFrame(opacity, 5)).toBeCloseTo(0.5);
    expect(interpolateAtFrame(opacity, 2)).toBeCloseTo(0.2);
  });

  it('snaps to prev value when outgoing easing is step', () => {
    const stepTrack: Track = {
      keyframes: [
        { frame: 0, value: 0, easing: 'step' },
        { frame: 10, value: 1, easing: 'linear' },
      ],
    };
    expect(interpolateAtFrame(stepTrack, 5)).toBe(0);
    expect(interpolateAtFrame(stepTrack, 9)).toBe(0);
    expect(interpolateAtFrame(stepTrack, 10)).toBe(1);
  });

  it('handles three keyframes', () => {
    const t: Track = {
      keyframes: [
        { frame: 0, value: 0, easing: 'linear' },
        { frame: 10, value: 100, easing: 'linear' },
        { frame: 20, value: 0, easing: 'linear' },
      ],
    };
    expect(interpolateAtFrame(t, 5)).toBeCloseTo(50);
    expect(interpolateAtFrame(t, 15)).toBeCloseTo(50);
  });

  it('single-keyframe track holds constant', () => {
    const t: Track = { keyframes: [{ frame: 0, value: 0.5, easing: 'linear' }] };
    expect(interpolateAtFrame(t, -10)).toBe(0.5);
    expect(interpolateAtFrame(t, 0)).toBe(0.5);
    expect(interpolateAtFrame(t, 100)).toBe(0.5);
  });
});

describe('interpolateAtFrame — color tracks', () => {
  it('lerps hex colors', () => {
    const fade: Track = {
      keyframes: [
        { frame: 0, value: '#000000', easing: 'linear' },
        { frame: 10, value: '#FFFFFF', easing: 'linear' },
      ],
    };
    expect(interpolateAtFrame(fade, 5)).toBe('#808080');
  });
});

describe('isColorProperty', () => {
  it('returns true only for fill.color and text.color', () => {
    expect(isColorProperty('fill.color')).toBe(true);
    expect(isColorProperty('text.color')).toBe(true);
    expect(isColorProperty('opacity')).toBe(false);
    expect(isColorProperty('position.x')).toBe(false);
  });
});
