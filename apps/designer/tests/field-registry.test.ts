import { describe, expect, it } from 'vitest';
import type { Element, Fill } from '@cg/shared-schema';
import {
  descriptorsForKind,
  isKeyframeable,
  keyframeableDescriptors,
  multiSelectDescriptors,
} from '../src/renderer/features/inspector/field-registry.js';
import { timelineGroupsFor } from '../src/renderer/features/timeline/keyframe-helpers.js';
import {
  defaultClock,
  defaultEllipse,
  defaultImage,
  defaultRepeater,
  defaultSequence,
  defaultShape,
  defaultText,
  defaultTicker,
} from '../src/renderer/state/element-defaults.js';

/**
 * D-051 truth-table + parity regression backbone. The central field registry is the
 * single source of keyframe-ability; this encodes the post-correction target set per
 * kind and asserts the timeline-left derives from the same registry (right/left
 * parity). It fails if any consumer drifts.
 */

const TRANSFORM = [
  'position.x',
  'position.y',
  'scale.x',
  'scale.y',
  'rotation',
  'size.w',
  'size.h',
  'opacity',
] as const;

const FILTER = [
  'filter.blur',
  'filter.brightness',
  'filter.contrast',
  'filter.grayscale',
  'filter.hueRotate',
  'filter.invert',
  'filter.opacity',
  'filter.saturate',
  'filter.sepia',
] as const;

const SHAPE_STYLE = [
  'fill.color',
  'stroke.color',
  'stroke.width',
  'stroke.dash',
  'cornerRadius',
  'shadow.offsetX',
  'shadow.offsetY',
  'shadow.blur',
  'shadow.color',
] as const;

const TEXT_STYLE = [
  'font.size',
  'text.color',
  'backgroundColor',
  'font.lineHeight',
  'font.letterSpacing',
  'shadow.offsetX',
  'shadow.offsetY',
  'shadow.blur',
  'shadow.color',
  'padding.top',
  'padding.right',
  'padding.bottom',
  'padding.left',
  'cornerRadius',
] as const;

const LINEAR_GRADIENT: Fill = {
  kind: 'linear',
  stops: [
    { at: 0, color: '#000000' },
    { at: 1, color: '#FFFFFF' },
  ],
  angle: 0,
};

const kf = (el: Element): string[] => keyframeableDescriptors(el).map((d) => d.property);
const timelineProps = (el: Element): string[] =>
  timelineGroupsFor(el).flatMap((g) =>
    g.rows.flatMap((r) => (r.kind === 'animatable' ? [r.row.property] : [])),
  );

describe('field-registry — per-kind keyframe-able truth table (post-D-051)', () => {
  it('shape: transform + path style + border radius + drop shadow + filter', () => {
    expect(kf(defaultShape('s', 0, 0))).toEqual([...TRANSFORM, ...SHAPE_STYLE, ...FILTER]);
  });

  it('text: transform + text + drop shadow + text padding + border radius + filter', () => {
    expect(kf(defaultText('t', 0, 0))).toEqual([...TRANSFORM, ...TEXT_STYLE, ...FILTER]);
  });

  it('image: transform + filter only', () => {
    expect(kf(defaultImage('i', 0, 0, 'asset-1'))).toEqual([...TRANSFORM, ...FILTER]);
  });

  it('time-driven kinds expose transform + cornerRadius + filter (D-042); repeater stays transform + filter', () => {
    // D-042 — ticker/clock/sequence are background-capable, so cornerRadius is now
    // keyframe-able (stroke is present but static — Option A). The rest of their
    // styling stays deferred to D-052. Repeater (no background) is unchanged.
    const withRadius = [...TRANSFORM, 'cornerRadius', ...FILTER];
    expect(kf(defaultTicker('tk', 0, 0))).toEqual(withRadius);
    expect(kf(defaultClock('ck', 0, 0))).toEqual(withRadius);
    expect(kf(defaultSequence('sq', 0, 0))).toEqual(withRadius);
    expect(kf(defaultRepeater('rp', 0, 0, { id: 'comp-1' }))).toEqual([...TRANSFORM, ...FILTER]);
  });
});

describe('field-registry — right/left parity (both derive from the registry)', () => {
  const els: Element[] = [
    defaultShape('s', 0, 0),
    defaultText('t', 0, 0),
    defaultImage('i', 0, 0, 'asset-1'),
    defaultTicker('tk', 0, 0),
    defaultClock('ck', 0, 0),
    defaultSequence('sq', 0, 0),
    defaultRepeater('rp', 0, 0, { id: 'comp-1' }),
  ];
  for (const el of els) {
    it(`${el.type}: timeline-left animatable rows == registry keyframe-able set`, () => {
      expect(timelineProps(el)).toEqual(kf(el));
    });
  }
});

describe('field-registry — §2 diamond corrections', () => {
  it('clock digits/mode are not keyframe-able (no diamond); cornerRadius is (D-042)', () => {
    const clockKf = kf(defaultClock('ck', 0, 0));
    expect(clockKf).not.toContain('digits');
    expect(clockKf).not.toContain('mode');
    expect(clockKf).toEqual([...TRANSFORM, 'cornerRadius', ...FILTER]);
  });

  it('border-radius is keyframe-able on shape and text (diamond present in both panels)', () => {
    expect(isKeyframeable(defaultShape('s', 0, 0), 'cornerRadius')).toBe(true);
    expect(isKeyframeable(defaultText('t', 0, 0), 'cornerRadius')).toBe(true);
    expect(timelineProps(defaultShape('s', 0, 0))).toContain('cornerRadius');
    expect(timelineProps(defaultText('t', 0, 0))).toContain('cornerRadius');
  });

  it('drop-shadow sub-properties and box-padding are keyframe-able', () => {
    const shape = defaultShape('s', 0, 0);
    for (const p of ['shadow.offsetX', 'shadow.offsetY', 'shadow.blur', 'shadow.color'] as const) {
      expect(isKeyframeable(shape, p)).toBe(true);
    }
    const text = defaultText('t', 0, 0);
    for (const p of ['padding.top', 'padding.right', 'padding.bottom', 'padding.left'] as const) {
      expect(isKeyframeable(text, p)).toBe(true);
    }
  });

  it('a solid fill is keyframe-able; a gradient fill is NOT (no diamond on either panel)', () => {
    const solid = defaultShape('s', 0, 0);
    expect(isKeyframeable(solid, 'fill.color')).toBe(true);
    expect(timelineProps(solid)).toContain('fill.color');

    const gradient: Element = { ...defaultShape('g', 0, 0), fill: LINEAR_GRADIENT };
    expect(isKeyframeable(gradient, 'fill.color')).toBe(false);
    expect(timelineProps(gradient)).not.toContain('fill.color');
  });

  it('a gradient text colour / background is NOT keyframe-able; solid is', () => {
    const solid = defaultText('t', 0, 0);
    expect(isKeyframeable(solid, 'text.color')).toBe(true);
    expect(isKeyframeable(solid, 'backgroundColor')).toBe(true);

    const gradientColor: Element = { ...defaultText('gc', 0, 0), colorFill: LINEAR_GRADIENT };
    expect(isKeyframeable(gradientColor, 'text.color')).toBe(false);
    expect(timelineProps(gradientColor)).not.toContain('text.color');

    const gradientBg: Element = { ...defaultText('gb', 0, 0), backgroundFill: LINEAR_GRADIENT };
    expect(isKeyframeable(gradientBg, 'backgroundColor')).toBe(false);
    expect(timelineProps(gradientBg)).not.toContain('backgroundColor');
  });

  it('font-family, font-weight, and alignments are never keyframe-able (not in the registry)', () => {
    // They are not AnimatableProperty members, so no descriptor exists for them and
    // no kind lists them — the diamond never renders.
    for (const el of [
      defaultText('t', 0, 0),
      defaultTicker('tk', 0, 0),
      defaultClock('ck', 0, 0),
    ]) {
      const props = descriptorsForKind(el.type).map((d) => d.property as string);
      expect(props).not.toContain('font.family');
      expect(props).not.toContain('font.weight');
      expect(props).not.toContain('align');
      expect(props).not.toContain('verticalAlign');
    }
  });
});

describe('field-registry — multi-select editable subset (preserved from D-050)', () => {
  it('shape exposes transform + opacity + filter + fill/stroke/cornerRadius/shadow', () => {
    const keys = multiSelectDescriptors(defaultShape('s', 0, 0)).map((d) => d.property);
    expect(keys).toEqual(
      expect.arrayContaining([
        ...TRANSFORM,
        ...FILTER,
        'fill.color',
        'stroke.color',
        'stroke.width',
        'stroke.dash',
        'cornerRadius',
        'shadow.offsetX',
        'shadow.offsetY',
        'shadow.blur',
        'shadow.color',
      ]),
    );
  });

  it('text exposes the universal set plus text.color only (not font.size/padding/shadow)', () => {
    const keys = multiSelectDescriptors(defaultText('t', 0, 0)).map((d) => d.property);
    expect(keys).toEqual(expect.arrayContaining([...TRANSFORM, ...FILTER, 'text.color']));
    expect(keys).not.toContain('font.size');
    expect(keys).not.toContain('padding.top');
    expect(keys).not.toContain('shadow.blur');
  });

  it('an ellipse (shape kind) matches the shape multi set', () => {
    expect(multiSelectDescriptors(defaultEllipse('e', 0, 0)).map((d) => d.property)).toEqual(
      multiSelectDescriptors(defaultShape('s', 0, 0)).map((d) => d.property),
    );
  });
});
