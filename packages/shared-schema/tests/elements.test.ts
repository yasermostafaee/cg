import { describe, expect, it } from 'vitest';
import {
  ContainerElementSchema,
  ElementBaseSchema,
  ElementSchema,
  ImageElementSchema,
  LottieElementSchema,
  ShapeElementSchema,
  TextElementSchema,
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
