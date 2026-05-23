import { describe, expect, it } from 'vitest';
import {
  DurationFramesSchema,
  FillSchema,
  FrameRateSchema,
  HexColorSchema,
  IdSchema,
  ISODateSchema,
  ResolutionSchema,
  ShadowSchema,
  StrokeSchema,
  TransformSchema,
} from '../src/primitives.js';

describe('IdSchema', () => {
  it('accepts a non-empty string', () => {
    expect(IdSchema.parse('01HKQ8N3J7N1V8A6V0M5Q4G8X3')).toBe('01HKQ8N3J7N1V8A6V0M5Q4G8X3');
  });
  it('rejects empty string', () => {
    expect(() => IdSchema.parse('')).toThrow();
  });
});

describe('HexColorSchema', () => {
  it('accepts 6-digit hex', () => {
    expect(HexColorSchema.parse('#E11D48')).toBe('#E11D48');
  });
  it('accepts 8-digit hex (with alpha)', () => {
    expect(HexColorSchema.parse('#E11D4880')).toBe('#E11D4880');
  });
  it('accepts lower-case', () => {
    expect(HexColorSchema.parse('#e11d48')).toBe('#e11d48');
  });
  it('rejects 3-digit hex', () => {
    expect(() => HexColorSchema.parse('#E14')).toThrow();
  });
  it('rejects missing hash', () => {
    expect(() => HexColorSchema.parse('E11D48')).toThrow();
  });
});

describe('FrameRateSchema', () => {
  it.each([25, 29.97, 50, 59.94, 60])('accepts %s', (fps) => {
    expect(FrameRateSchema.parse(fps)).toBe(fps);
  });
  it('rejects 24', () => {
    expect(() => FrameRateSchema.parse(24)).toThrow();
  });
});

describe('DurationFramesSchema', () => {
  it('accepts 0', () => {
    expect(DurationFramesSchema.parse(0)).toBe(0);
  });
  it('accepts large integers', () => {
    expect(DurationFramesSchema.parse(1500)).toBe(1500);
  });
  it('rejects negative', () => {
    expect(() => DurationFramesSchema.parse(-1)).toThrow();
  });
  it('rejects fractional', () => {
    expect(() => DurationFramesSchema.parse(12.5)).toThrow();
  });
});

describe('ISODateSchema', () => {
  it('accepts an ISO-8601 datetime', () => {
    const v = '2026-05-19T18:42:11.412Z';
    expect(ISODateSchema.parse(v)).toBe(v);
  });
  it('rejects a date-only string', () => {
    expect(() => ISODateSchema.parse('2026-05-19')).toThrow();
  });
});

describe('ResolutionSchema', () => {
  it('accepts 1920x1080', () => {
    expect(ResolutionSchema.parse({ width: 1920, height: 1080 })).toEqual({
      width: 1920,
      height: 1080,
    });
  });
  it('rejects zero width', () => {
    expect(() => ResolutionSchema.parse({ width: 0, height: 1080 })).toThrow();
  });
});

describe('TransformSchema', () => {
  it('accepts a full transform', () => {
    const t = {
      position: { x: 100, y: 200 },
      size: { w: 400, h: 100 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 },
    };
    expect(TransformSchema.parse(t)).toEqual(t);
  });
  it('accepts optional skew', () => {
    const t = {
      position: { x: 0, y: 0 },
      size: { w: 100, h: 100 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
      skew: { x: 0.1, y: 0 },
    };
    expect(TransformSchema.parse(t).skew).toEqual({ x: 0.1, y: 0 });
  });
});

describe('FillSchema', () => {
  it('accepts solid', () => {
    expect(FillSchema.parse({ kind: 'solid', color: '#FFFFFF' })).toEqual({
      kind: 'solid',
      color: '#FFFFFF',
    });
  });
  it('accepts linear with stops', () => {
    const f = {
      kind: 'linear' as const,
      angle: 90,
      stops: [
        { at: 0, color: '#000000' },
        { at: 1, color: '#FFFFFF' },
      ],
    };
    expect(FillSchema.parse(f)).toEqual(f);
  });
  it('accepts radial', () => {
    const f = {
      kind: 'radial' as const,
      center: { x: 0.5, y: 0.5 },
      radius: 100,
      stops: [
        { at: 0, color: '#000000' },
        { at: 1, color: '#FFFFFF' },
      ],
    };
    expect(FillSchema.parse(f)).toEqual(f);
  });
  it('rejects linear with only one stop', () => {
    expect(() =>
      FillSchema.parse({
        kind: 'linear',
        angle: 0,
        stops: [{ at: 0, color: '#000' }],
      }),
    ).toThrow();
  });
});

describe('StrokeSchema', () => {
  it('accepts width + color', () => {
    expect(StrokeSchema.parse({ width: 2, color: '#000000' })).toEqual({
      width: 2,
      color: '#000000',
    });
  });
  it('accepts a dash array', () => {
    expect(StrokeSchema.parse({ width: 1, color: '#000000', dash: [4, 2] }).dash).toEqual([4, 2]);
  });
});

describe('ShadowSchema', () => {
  it('accepts a typical shadow', () => {
    const s = { offsetX: 2, offsetY: 4, blur: 8, color: '#000000AA' };
    expect(ShadowSchema.parse(s)).toEqual(s);
  });
  it('rejects negative blur', () => {
    expect(() => ShadowSchema.parse({ offsetX: 0, offsetY: 0, blur: -1, color: '#000' })).toThrow();
  });
});
