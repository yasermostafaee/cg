import { describe, expect, it } from 'vitest';
import {
  ClockElementSchema,
  RepeaterElementSchema,
  SequenceElementSchema,
  ContainerElementSchema,
  ElementBaseSchema,
  ElementSchema,
  ImageElementSchema,
  LottieElementSchema,
  ShapeElementSchema,
  TextElementSchema,
  TickerElementSchema,
  VideoPlaceholderElementSchema,
} from '../src/elements.js';

const baseProps = {
  id: 'el-1',
  name: 'one',
  transform: {
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0.5, y: 0.5 },
  },
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
};

describe('ElementBase', () => {
  it('accepts the minimum shape', () => {
    expect(ElementBaseSchema.parse(baseProps)).toEqual(baseProps);
  });
});

describe('TextElement', () => {
  it('accepts a Persian text node', () => {
    const t = {
      ...baseProps,
      type: 'text' as const,
      text: 'خبر فوری',
      font: {
        family: 'Vazirmatn',
        weight: 700,
        style: 'normal' as const,
        size: 48,
        lineHeight: 1.4,
        letterSpacing: 0,
      },
      color: '#FFFFFF',
      align: 'start' as const,
      direction: 'rtl' as const,
      fitMode: 'autosize' as const,
      overflow: 'ellipsis' as const,
    };
    expect(TextElementSchema.parse(t)).toEqual(t);
  });
  it('rejects font weight 450', () => {
    expect(() =>
      TextElementSchema.parse({
        ...baseProps,
        type: 'text',
        text: 'x',
        font: {
          family: 'X',
          weight: 450,
          style: 'normal',
          size: 16,
          lineHeight: 1.5,
          letterSpacing: 0,
        },
        color: '#FFFFFF',
        align: 'start',
        direction: 'auto',
        fitMode: 'fixed',
        overflow: 'clip',
      }),
    ).toThrow();
  });
  it('D-042 — text accepts a stroke + a per-corner (tuple) radius; a uniform number still validates', () => {
    const baseText = {
      ...baseProps,
      type: 'text' as const,
      text: 'x',
      font: {
        family: 'X',
        weight: 400,
        style: 'normal' as const,
        size: 16,
        lineHeight: 1.5,
        letterSpacing: 0,
      },
      color: '#FFFFFF',
      align: 'start' as const,
      direction: 'auto' as const,
      fitMode: 'fixed' as const,
      overflow: 'clip' as const,
    };
    // Migration: a pre-existing uniform (number) radius still validates.
    expect(TextElementSchema.parse({ ...baseText, cornerRadius: 8 }).cornerRadius).toBe(8);
    // D-042: text now also accepts a stroke + a 4-tuple per-corner radius.
    const parsed = TextElementSchema.parse({
      ...baseText,
      stroke: { width: 2, color: '#FF0000' },
      cornerRadius: [1, 2, 3, 4] as [number, number, number, number],
    });
    expect(parsed.stroke).toEqual({ width: 2, color: '#FF0000' });
    expect(parsed.cornerRadius).toEqual([1, 2, 3, 4]);
  });
});

describe('ImageElement', () => {
  it('accepts a logo image', () => {
    const i = {
      ...baseProps,
      type: 'image' as const,
      assetId: 'asset-logo',
      fit: 'contain' as const,
      preserveAspect: true,
    };
    expect(ImageElementSchema.parse(i)).toEqual(i);
  });
});

describe('ShapeElement', () => {
  it('accepts rounded-rect with cornerRadius', () => {
    const s = {
      ...baseProps,
      type: 'shape' as const,
      shape: 'rounded-rect' as const,
      cornerRadius: 8,
      fill: { kind: 'solid' as const, color: '#0EA5E9' },
    };
    expect(ShapeElementSchema.parse(s)).toEqual(s);
  });
  it('accepts cornerRadius as a 4-tuple', () => {
    const s = {
      ...baseProps,
      type: 'shape' as const,
      shape: 'rounded-rect' as const,
      cornerRadius: [4, 4, 8, 8] as [number, number, number, number],
    };
    expect(ShapeElementSchema.parse(s).cornerRadius).toEqual([4, 4, 8, 8]);
  });
});

describe('LottieElement', () => {
  it('accepts a Lottie ref with segment', () => {
    const l = {
      ...baseProps,
      type: 'lottie' as const,
      assetId: 'asset-intro',
      speed: 1,
      loopMode: 'loop' as const,
      segment: [0, 120] as [number, number],
    };
    expect(LottieElementSchema.parse(l)).toEqual(l);
  });
});

describe('VideoPlaceholderElement', () => {
  it('accepts a 16:9 placeholder', () => {
    const v = {
      ...baseProps,
      type: 'video-placeholder' as const,
      expectedAspect: 16 / 9,
      routeKey: 'ndi-source-1',
    };
    expect(VideoPlaceholderElementSchema.parse(v)).toEqual(v);
  });
});

describe('ContainerElement (recursive)', () => {
  it('accepts a container with nested children', () => {
    const c = {
      ...baseProps,
      type: 'container' as const,
      clip: false,
      children: [
        {
          ...baseProps,
          id: 'el-2',
          type: 'image' as const,
          assetId: 'a',
          fit: 'cover' as const,
          preserveAspect: false,
        },
      ],
    };
    expect(ContainerElementSchema.parse(c).children).toHaveLength(1);
  });

  it('accepts a doubly-nested container', () => {
    const c = {
      ...baseProps,
      type: 'container' as const,
      clip: true,
      children: [
        {
          ...baseProps,
          id: 'el-2',
          type: 'container' as const,
          clip: false,
          children: [
            {
              ...baseProps,
              id: 'el-3',
              type: 'text' as const,
              text: 'leaf',
              font: {
                family: 'Inter',
                weight: 400,
                style: 'normal' as const,
                size: 16,
                lineHeight: 1.5,
                letterSpacing: 0,
              },
              color: '#FFFFFF',
              align: 'start' as const,
              direction: 'ltr' as const,
              fitMode: 'fixed' as const,
              overflow: 'clip' as const,
            },
          ],
        },
      ],
    };
    expect(ContainerElementSchema.parse(c)).toBeTruthy();
  });
});

describe('D-010 — new optional style fields round-trip', () => {
  it('accepts a text element with padding, backgroundColor, cornerRadius, filter, textShadow', () => {
    const t = {
      ...baseProps,
      type: 'text' as const,
      text: 'hi',
      font: {
        family: 'Inter',
        weight: 400,
        style: 'normal' as const,
        size: 16,
        lineHeight: 1.5,
        letterSpacing: 0,
      },
      color: '#FFFFFF',
      align: 'start' as const,
      direction: 'auto' as const,
      fitMode: 'fixed' as const,
      overflow: 'clip' as const,
      padding: { top: 4, right: 8, bottom: 4, left: 8 },
      backgroundColor: '#000000',
      cornerRadius: 12,
      textShadow: { offsetX: 1, offsetY: 1, blur: 2, color: '#000000' },
      filter: { blur: 1, brightness: 110, contrast: 100, sepia: 25 },
    };
    const parsed = TextElementSchema.parse(t);
    expect(parsed.padding).toEqual({ top: 4, right: 8, bottom: 4, left: 8 });
    expect(parsed.backgroundColor).toBe('#000000');
    expect(parsed.cornerRadius).toBe(12);
    expect(parsed.textShadow?.blur).toBe(2);
    expect(parsed.filter?.brightness).toBe(110);
  });

  it('accepts a shape element with shadow + filter + dashed stroke', () => {
    const s = {
      ...baseProps,
      type: 'shape' as const,
      shape: 'rect' as const,
      fill: { kind: 'solid' as const, color: '#BEBEBE' },
      stroke: { width: 2, color: '#000000', dash: [4, 4] },
      cornerRadius: 8,
      shadow: { offsetX: 0, offsetY: 4, blur: 12, color: '#000000' },
      filter: { hueRotate: 90, saturate: 150 },
    };
    const parsed = ShapeElementSchema.parse(s);
    expect(parsed.shadow?.offsetY).toBe(4);
    expect(parsed.filter?.hueRotate).toBe(90);
    expect(parsed.stroke?.dash).toEqual([4, 4]);
  });

  it('all D-010 fields are optional — minimum shape still parses', () => {
    const minShape = { ...baseProps, type: 'shape' as const, shape: 'rect' as const };
    const parsed = ShapeElementSchema.parse(minShape);
    expect(parsed.filter).toBeUndefined();
    expect(parsed.shadow).toBeUndefined();
  });

  it('rejects out-of-range filter percentages', () => {
    const badText = {
      ...baseProps,
      type: 'text' as const,
      text: 'x',
      font: {
        family: 'Inter',
        weight: 400,
        style: 'normal' as const,
        size: 16,
        lineHeight: 1.5,
        letterSpacing: 0,
      },
      color: '#FFFFFF',
      align: 'start' as const,
      direction: 'auto' as const,
      fitMode: 'fixed' as const,
      overflow: 'clip' as const,
      filter: { grayscale: 150 },
    };
    expect(() => TextElementSchema.parse(badText)).toThrow();
  });
});

describe('Element union dispatch', () => {
  it.each([
    ['text' as const, 'Persian'],
    ['image' as const, 'image'],
    ['shape' as const, 'shape'],
  ])('parses kind=%s via the union', (kind) => {
    const variants: Record<string, unknown> = {
      text: {
        ...baseProps,
        type: 'text',
        text: 'x',
        font: {
          family: 'Inter',
          weight: 400,
          style: 'normal',
          size: 16,
          lineHeight: 1.5,
          letterSpacing: 0,
        },
        color: '#FFFFFF',
        align: 'start',
        direction: 'auto',
        fitMode: 'fixed',
        overflow: 'clip',
      },
      image: { ...baseProps, type: 'image', assetId: 'a', fit: 'cover', preserveAspect: true },
      shape: { ...baseProps, type: 'shape', shape: 'rect' },
    };
    const parsed = ElementSchema.parse(variants[kind]);
    expect((parsed as { type: string }).type).toBe(kind);
  });
});

describe('TickerElement (D-028)', () => {
  const ticker = {
    ...baseProps,
    type: 'ticker' as const,
    font: {
      family: 'Vazirmatn',
      weight: 500,
      style: 'normal' as const,
      size: 36,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    textShadow: { offsetX: 0, offsetY: 2, blur: 6, color: '#000000' },
    direction: 'rtl' as const,
    speed: 120,
    repeat: 'infinite' as const,
    cycleBoundary: 'seamless' as const,
    gap: 48,
    separator: ' • ',
    items: [
      { id: 'i1', text: 'خبر فوری: بازار جهانی' },
      { id: 'i2', text: 'Brand X رکورد زد' },
    ],
  };
  it('accepts a Persian ticker with mixed-content items', () => {
    expect(TickerElementSchema.parse(ticker)).toEqual(ticker);
  });
  it('round-trips through the Element union', () => {
    const parsed = ElementSchema.parse(ticker);
    expect((parsed as { type: string }).type).toBe('ticker');
  });
  it('rejects direction "auto" (reading direction must be explicit)', () => {
    expect(() => TickerElementSchema.parse({ ...ticker, direction: 'auto' })).toThrow();
  });
  it('rejects a non-positive speed', () => {
    expect(() => TickerElementSchema.parse({ ...ticker, speed: 0 })).toThrow();
  });
  it('rejects a negative gap', () => {
    expect(() => TickerElementSchema.parse({ ...ticker, gap: -1 })).toThrow();
  });
  it('rejects an item without a stable id', () => {
    expect(() =>
      TickerElementSchema.parse({ ...ticker, items: [{ id: '', text: 'x' }] }),
    ).toThrow();
  });
  it('accepts an empty items list (authored later / field-driven)', () => {
    expect(TickerElementSchema.parse({ ...ticker, items: [] }).items).toEqual([]);
  });
  it("defaults repeat to 'infinite' and cycleBoundary to 'seamless' (additive)", () => {
    const { repeat: _r, cycleBoundary: _c, ...withoutLoop } = ticker;
    const parsed = TickerElementSchema.parse(withoutLoop);
    expect(parsed.repeat).toBe('infinite');
    expect(parsed.cycleBoundary).toBe('seamless');
  });
  it('accepts a finite repeat + drain boundary', () => {
    const parsed = TickerElementSchema.parse({ ...ticker, repeat: 3, cycleBoundary: 'drain' });
    expect(parsed.repeat).toBe(3);
    expect(parsed.cycleBoundary).toBe('drain');
  });
});

describe('ClockElement (D-027)', () => {
  const clock = {
    ...baseProps,
    type: 'clock' as const,
    font: {
      family: 'Vazirmatn',
      weight: 600,
      style: 'normal' as const,
      size: 48,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    mode: 'wall' as const,
  };
  it('accepts a wall clock and applies the defaults (align/format/digits)', () => {
    const parsed = ClockElementSchema.parse(clock);
    expect(parsed.align).toBe('center');
    expect(parsed.format).toBe('HH:mm:ss');
    expect(parsed.digits).toBe('persian');
  });
  it('round-trips through the Element union', () => {
    const parsed = ElementSchema.parse(clock);
    expect((parsed as { type: string }).type).toBe('clock');
  });
  it('accepts a countup clock without a target', () => {
    expect(ClockElementSchema.parse({ ...clock, mode: 'countup' }).mode).toBe('countup');
  });
  it('accepts a countdown to a duration', () => {
    const parsed = ClockElementSchema.parse({
      ...clock,
      mode: 'countdown',
      target: { kind: 'duration', ms: 120_000 },
    });
    expect(parsed.target).toEqual({ kind: 'duration', ms: 120_000 });
  });
  it('accepts a countdown to a datetime (UTC, offset, and local forms)', () => {
    for (const iso of [
      '2026-06-11T18:30:00.000Z',
      '2026-06-11T18:30:00+03:30',
      '2026-06-11T18:30:00',
    ]) {
      const parsed = ClockElementSchema.parse({
        ...clock,
        mode: 'countdown',
        target: { kind: 'datetime', iso },
      });
      expect(parsed.target).toEqual({ kind: 'datetime', iso });
    }
  });
  it("rejects mode 'countdown' without a target (refinement)", () => {
    expect(() => ClockElementSchema.parse({ ...clock, mode: 'countdown' })).toThrow();
  });
  it('rejects a non-positive / non-integer duration target', () => {
    for (const ms of [0, -1000, 1500.5]) {
      expect(() =>
        ClockElementSchema.parse({ ...clock, mode: 'countdown', target: { kind: 'duration', ms } }),
      ).toThrow();
    }
  });
  it('rejects a malformed datetime target', () => {
    expect(() =>
      ClockElementSchema.parse({
        ...clock,
        mode: 'countdown',
        target: { kind: 'datetime', iso: 'tomorrow at noon' },
      }),
    ).toThrow();
  });
  it('rejects an empty format string', () => {
    expect(() => ClockElementSchema.parse({ ...clock, format: '' })).toThrow();
  });
});

describe('SequenceElement (D-029)', () => {
  const sequence = {
    ...baseProps,
    type: 'sequence' as const,
    font: {
      family: 'Vazirmatn',
      weight: 500,
      style: 'normal' as const,
      size: 36,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    direction: 'rtl' as const,
    items: [
      { id: 'a', text: 'اکنون: برنامهٔ نخست' },
      { id: 'b', text: 'سپس: Brand X', dwellMs: 8000 },
    ],
  };
  it('applies the defaults (align/dwell/advance/transition/repeat) and round-trips', () => {
    const parsed = SequenceElementSchema.parse(sequence);
    expect(parsed.align).toBe('start');
    expect(parsed.defaultDwellMs).toBe(5000);
    expect(parsed.advance).toBe('auto');
    expect(parsed.transitionIn).toBe('bottom');
    expect(parsed.transitionOut).toBe('top');
    expect(parsed.transitionTiming).toBe('simultaneous');
    expect(parsed.transitionMs).toBe(400);
    expect(parsed.repeat).toBe('infinite');
    expect(parsed.items).toEqual(sequence.items);
    // Round-trip: parsing the parsed value is identity.
    expect(SequenceElementSchema.parse(parsed)).toEqual(parsed);
  });
  it('round-trips through the Element union', () => {
    const parsed = ElementSchema.parse(sequence);
    expect((parsed as { type: string }).type).toBe('sequence');
  });
  it('accepts every edge incl. none and a finite repeat', () => {
    const parsed = SequenceElementSchema.parse({
      ...sequence,
      transitionIn: 'none',
      transitionOut: 'left',
      transitionTiming: 'sequential',
      repeat: 3,
    });
    expect(parsed.transitionIn).toBe('none');
    expect(parsed.repeat).toBe(3);
  });
  it('rejects a non-positive per-item dwellMs', () => {
    expect(() =>
      SequenceElementSchema.parse({
        ...sequence,
        items: [{ id: 'a', text: 'x', dwellMs: 0 }],
      }),
    ).toThrow();
  });
  it('rejects a non-positive defaultDwellMs / transitionMs and a bad edge', () => {
    expect(() => SequenceElementSchema.parse({ ...sequence, defaultDwellMs: 0 })).toThrow();
    expect(() => SequenceElementSchema.parse({ ...sequence, transitionMs: -1 })).toThrow();
    expect(() => SequenceElementSchema.parse({ ...sequence, transitionIn: 'fade' })).toThrow();
  });
  it('rejects an item without a stable id', () => {
    expect(() =>
      SequenceElementSchema.parse({ ...sequence, items: [{ id: '', text: 'x' }] }),
    ).toThrow();
  });
});

describe('RepeaterElement (D-030)', () => {
  const repeater = {
    ...baseProps,
    type: 'repeater' as const,
    compositionId: 'rowc',
  };
  it('applies the defaults (column / rtl flow / gap 8 / no items) and round-trips', () => {
    const parsed = RepeaterElementSchema.parse(repeater);
    expect(parsed.direction).toBe('column');
    expect(parsed.flow).toBe('rtl');
    expect(parsed.gap).toBe(8);
    expect(parsed.maxItems).toBeUndefined();
    expect(parsed.items).toEqual([]);
    expect(RepeaterElementSchema.parse(parsed)).toEqual(parsed);
  });
  it('round-trips through the Element union with OPEN row items', () => {
    const parsed = ElementSchema.parse({
      ...repeater,
      items: [{ id: 'r1', name: 'تیم یک', score: 3 }],
    });
    expect((parsed as { type: string }).type).toBe('repeater');
    expect((parsed as { items: unknown[] }).items).toEqual([
      { id: 'r1', name: 'تیم یک', score: 3 },
    ]);
  });
  it('rejects a negative gap / non-positive maxItems / missing compositionId', () => {
    expect(() => RepeaterElementSchema.parse({ ...repeater, gap: -1 })).toThrow();
    expect(() => RepeaterElementSchema.parse({ ...repeater, maxItems: 0 })).toThrow();
    const { compositionId: _c, ...withoutComp } = repeater;
    expect(() => RepeaterElementSchema.parse(withoutComp)).toThrow();
  });
  it('rejects a row item without a stable id', () => {
    expect(() => RepeaterElementSchema.parse({ ...repeater, items: [{ name: 'x' }] })).toThrow();
  });
});
