import { describe, expect, it } from 'vitest';
import {
  ElementAnimationSchema,
  EntryPresetSchema,
  ExitPresetSchema,
  LoopPresetSchema,
} from '../src/animation.js';

describe('EntryPreset variants', () => {
  it('none', () => {
    expect(EntryPresetSchema.parse({ kind: 'none' })).toEqual({ kind: 'none' });
  });
  it('fade', () => {
    const p = { kind: 'fade' as const, duration: 10, delay: 0, easing: 'power2.out' as const };
    expect(EntryPresetSchema.parse(p)).toEqual(p);
  });
  it('slide', () => {
    const p = {
      kind: 'slide' as const,
      duration: 12,
      delay: 0,
      easing: 'power2.out' as const,
      direction: 'left' as const,
      distance: 240,
    };
    expect(EntryPresetSchema.parse(p)).toEqual(p);
  });
  it('scale from 0', () => {
    const p = {
      kind: 'scale' as const,
      duration: 8,
      delay: 2,
      easing: 'back.out' as const,
      from: 0,
    };
    expect(EntryPresetSchema.parse(p)).toEqual(p);
  });
  it('blur', () => {
    const p = {
      kind: 'blur' as const,
      duration: 10,
      delay: 0,
      easing: 'sine.in' as const,
      from: 12,
    };
    expect(EntryPresetSchema.parse(p)).toEqual(p);
  });
  it('rejects unknown kind', () => {
    expect(() => EntryPresetSchema.parse({ kind: 'flip' })).toThrow();
  });
});

describe('ExitPreset variants', () => {
  it('fade-out', () => {
    const p = {
      kind: 'fade-out' as const,
      duration: 8,
      delay: 0,
      easing: 'power2.in' as const,
    };
    expect(ExitPresetSchema.parse(p)).toEqual(p);
  });
  it('slide-out', () => {
    const p = {
      kind: 'slide-out' as const,
      duration: 10,
      delay: 0,
      easing: 'power2.in' as const,
      direction: 'right' as const,
      distance: 320,
    };
    expect(ExitPresetSchema.parse(p)).toEqual(p);
  });
  it('scale-down to 0', () => {
    const p = {
      kind: 'scale-down' as const,
      duration: 8,
      delay: 0,
      easing: 'power2.in' as const,
      to: 0,
    };
    expect(ExitPresetSchema.parse(p)).toEqual(p);
  });
  it('blur-out', () => {
    const p = {
      kind: 'blur-out' as const,
      duration: 10,
      delay: 0,
      easing: 'sine.out' as const,
      to: 8,
    };
    expect(ExitPresetSchema.parse(p)).toEqual(p);
  });
});

describe('LoopPreset variants', () => {
  it('ticker', () => {
    const p = {
      kind: 'ticker' as const,
      speed: 120,
      direction: 'rtl' as const,
    };
    expect(LoopPresetSchema.parse(p)).toEqual(p);
  });
  it('pulse', () => {
    const p = {
      kind: 'pulse' as const,
      duration: 30,
      minOpacity: 0.5,
      maxOpacity: 1,
    };
    expect(LoopPresetSchema.parse(p)).toEqual(p);
  });
  it('breathing', () => {
    const p = {
      kind: 'breathing' as const,
      duration: 60,
      scaleMin: 0.95,
      scaleMax: 1.05,
    };
    expect(LoopPresetSchema.parse(p)).toEqual(p);
  });
  it('rejects ticker with zero speed', () => {
    expect(() => LoopPresetSchema.parse({ kind: 'ticker', speed: 0, direction: 'rtl' })).toThrow();
  });
});

describe('ElementAnimation', () => {
  it('all three phases optional', () => {
    expect(ElementAnimationSchema.parse({})).toEqual({});
  });
  it('all three phases set', () => {
    const a = {
      entry: { kind: 'fade' as const, duration: 10, delay: 0, easing: 'power2.out' as const },
      loop: { kind: 'none' as const },
      exit: {
        kind: 'fade-out' as const,
        duration: 8,
        delay: 0,
        easing: 'power2.in' as const,
      },
    };
    expect(ElementAnimationSchema.parse(a)).toEqual(a);
  });
});
