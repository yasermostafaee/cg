import type { AnimatableProperty, Element } from '@cg/shared-schema';

/**
 * D-051 — the central inspector-field registry: the SINGLE source of
 * keyframe-ability and inspector-field presence per element kind.
 *
 * Before D-051 this knowledge was hand-written in FOUR places that drifted apart
 * (the schema `AnimatablePropertySchema` enum, `StyleSection.tsx`'s per-kind
 * `animPointIcon`/`pointIcon` decisions, `keyframe-helpers.ts`'s `timelineGroupsFor`,
 * and `shared-properties.ts`'s `UNIVERSAL`/`BY_KIND`). This module folds the latter
 * three into one table the three consumers read from:
 *   - the right inspector (StyleSection / TextStyleSection) — diamond renders iff
 *     {@link isKeyframeable};
 *   - the timeline-left inspector — `timelineGroupsFor` is generated from
 *     {@link keyframeableDescriptors};
 *   - the multi-select editor — `shared-properties.descriptorsFor` is generated from
 *     {@link multiSelectDescriptors}.
 *
 * Keyframe-ability is DERIVED from the schema: `property` is typed as
 * `AnimatableProperty`, so only schema-animatable paths can be declared, and the
 * optional `keyframeable(el)` predicate narrows that per instance (e.g. a colour is
 * only keyframe-able while it is a SOLID fill — gradients can't interpolate). This
 * is a pure leaf module (imports only `@cg/shared-schema` types), so both the
 * inspector and timeline features consume it without an import cycle.
 *
 * Adding a kind/property is ONE declaration here. The deferred styling animation
 * for the time-driven kinds (ticker/clock/sequence/repeater — D-052) is enabled by
 * adding their descriptors here once the runtime apply-step supports them.
 */

/** Inspector section a property groups under (the CollapseSection / timeline group title). */
export type InspectorSection =
  | 'Transform'
  | 'Path Style'
  | 'Text'
  | 'Border Radius'
  | 'Drop Shadow'
  | 'Text Padding'
  | 'Filter';

/** The input primitive a property edits with (used by the multi-select editor). */
export type FieldKind = 'number' | 'color' | 'fill';

export interface PropertyDescriptor {
  /** Canonical animatable property path (schema enum) — also the multi-select `key`. */
  readonly property: AnimatableProperty;
  /** Section this property groups under (right inspector + timeline). */
  readonly section: InspectorSection;
  /** Input primitive the multi-select editor renders it with. */
  readonly fieldKind: FieldKind;
  /** Inspector / multi-select label. */
  readonly label: string;
  /** Timeline-left label, when it differs from {@link label} (defaults to it). */
  readonly timelineLabel?: string;
  /**
   * The element's CURRENT STATIC value. Used as the timeline value-column display,
   * the keyframe-capture fallback (the value a freshly-added keyframe holds), and
   * the multi-select agree/mixed comparison. Returns a number for numeric
   * properties and a hex string for colours.
   */
  readonly read: (el: Element) => number | string;
  /**
   * Multi-select value override when the static value isn't uniformly representable
   * (null ⇒ show the neutral "mixed" state). Defaults to {@link read}.
   */
  readonly multiRead?: (el: Element) => number | string | null;
  /**
   * Whether this property is keyframe-able for the given element INSTANCE. Default
   * `() => true`. A predicate handles conditional cases (a colour is keyframe-able
   * only while it is a solid fill — D-051 gradient rule).
   */
  readonly keyframeable?: (el: Element) => boolean;
  /** Whether the multi-select editor exposes this property. */
  readonly multiSelect?: boolean;
  readonly step?: number;
  readonly min?: number;
  readonly max?: number;
  /** Dim unit shown after the value (timeline) / field suffix (multi-select). */
  readonly unit?: string;
  /** Stored→displayed factor for the timeline value column (scale / opacity → 100). */
  readonly factor?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Universal descriptors — on every element kind (transform + opacity live on
// ElementBase; the CSS `filter` is also on ElementBase).
// ─────────────────────────────────────────────────────────────────────────────

const TRANSFORM: readonly PropertyDescriptor[] = [
  {
    property: 'position.x',
    section: 'Transform',
    fieldKind: 'number',
    label: 'Position X',
    read: (el) => el.transform.position.x,
    multiSelect: true,
    step: 1,
  },
  {
    property: 'position.y',
    section: 'Transform',
    fieldKind: 'number',
    label: 'Position Y',
    read: (el) => el.transform.position.y,
    multiSelect: true,
    step: 1,
  },
  {
    property: 'scale.x',
    section: 'Transform',
    fieldKind: 'number',
    label: 'Scale X',
    read: (el) => el.transform.scale.x,
    multiSelect: true,
    step: 1,
    unit: '%',
    factor: 100,
  },
  {
    property: 'scale.y',
    section: 'Transform',
    fieldKind: 'number',
    label: 'Scale Y',
    read: (el) => el.transform.scale.y,
    multiSelect: true,
    step: 1,
    unit: '%',
    factor: 100,
  },
  {
    property: 'rotation',
    section: 'Transform',
    fieldKind: 'number',
    label: 'Rotation',
    read: (el) => el.transform.rotation,
    multiSelect: true,
    step: 1,
    unit: '°',
  },
  {
    property: 'size.w',
    section: 'Transform',
    fieldKind: 'number',
    label: 'Width',
    read: (el) => el.transform.size.w,
    multiSelect: true,
    step: 1,
    min: 0,
  },
  {
    property: 'size.h',
    section: 'Transform',
    fieldKind: 'number',
    label: 'Height',
    read: (el) => el.transform.size.h,
    multiSelect: true,
    step: 1,
    min: 0,
  },
  {
    property: 'opacity',
    section: 'Transform',
    fieldKind: 'number',
    label: 'Opacity',
    read: (el) => el.opacity,
    multiSelect: true,
    step: 0.05,
    min: 0,
    max: 1,
    unit: '%',
    factor: 100,
  },
];

/** filter.* — nine numeric CSS-filter properties, all animatable on every kind. */
const FILTER: readonly PropertyDescriptor[] = [
  filterDesc('filter.blur', 'blur', 'Blur', { step: 0.5, min: 0, unit: 'px' }, 0),
  filterDesc('filter.brightness', 'brightness', 'Brightness', { step: 1, min: 0, unit: '%' }, 100),
  filterDesc('filter.contrast', 'contrast', 'Contrast', { step: 1, min: 0, unit: '%' }, 100),
  filterDesc(
    'filter.grayscale',
    'grayscale',
    'Grayscale',
    { step: 1, min: 0, max: 100, unit: '%' },
    0,
  ),
  filterDesc('filter.hueRotate', 'hue rotate', 'Hue rotate', { step: 1, unit: '°' }, 0),
  filterDesc('filter.invert', 'invert', 'Invert', { step: 1, min: 0, max: 100, unit: '%' }, 0),
  filterDesc('filter.opacity', 'opacity', 'Opacity', { step: 1, min: 0, max: 100, unit: '%' }, 100),
  filterDesc('filter.saturate', 'saturate', 'Saturate', { step: 1, min: 0, unit: '%' }, 100),
  filterDesc('filter.sepia', 'sepia', 'Sepia', { step: 1, min: 0, max: 100, unit: '%' }, 0),
];

function filterDesc(
  property: AnimatableProperty,
  label: string,
  timelineLabel: string,
  opts: { step: number; min?: number; max?: number; unit: string },
  fallback: number,
): PropertyDescriptor {
  const key = property.slice('filter.'.length);
  return {
    property,
    section: 'Filter',
    fieldKind: 'number',
    label,
    timelineLabel,
    read: (el) => {
      const f = el.filter as Record<string, number | undefined> | undefined;
      return f?.[key] ?? fallback;
    },
    multiSelect: true,
    step: opts.step,
    ...(opts.min !== undefined ? { min: opts.min } : {}),
    ...(opts.max !== undefined ? { max: opts.max } : {}),
    unit: opts.unit,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shape-specific — Path Style · Border Radius · Drop Shadow (reads el.shadow).
// ─────────────────────────────────────────────────────────────────────────────

const SHAPE_SPECIFIC: readonly PropertyDescriptor[] = [
  {
    property: 'fill.color',
    section: 'Path Style',
    fieldKind: 'fill',
    label: 'fill',
    timelineLabel: 'Fill',
    read: (el) => (el.type === 'shape' && el.fill?.kind === 'solid' ? el.fill.color : '#000000'),
    // The uniform colour, or null (→ "mixed") for a gradient / non-solid fill.
    multiRead: (el) => (el.type === 'shape' && el.fill?.kind === 'solid' ? el.fill.color : null),
    // A colour is keyframe-able only while it is a SOLID fill — gradients can't
    // interpolate, so no diamond (in either panel) when the fill is a gradient.
    keyframeable: (el) =>
      el.type === 'shape' && (el.fill === undefined || el.fill.kind === 'solid'),
    multiSelect: true,
  },
  {
    property: 'stroke.color',
    section: 'Path Style',
    fieldKind: 'color',
    label: 'stroke',
    timelineLabel: 'Stroke',
    read: (el) => (el.type === 'shape' ? (el.stroke?.color ?? '#000000') : '#000000'),
    multiSelect: true,
  },
  {
    property: 'stroke.width',
    section: 'Path Style',
    fieldKind: 'number',
    label: 'stroke width',
    timelineLabel: 'Stroke width',
    read: (el) => (el.type === 'shape' ? (el.stroke?.width ?? 0) : 0),
    multiSelect: true,
    step: 1,
    min: 0,
  },
  {
    property: 'stroke.dash',
    section: 'Path Style',
    fieldKind: 'number',
    label: 'dash array',
    timelineLabel: 'Stroke dasharray',
    read: (el) => (el.type === 'shape' ? (el.stroke?.dash?.[0] ?? 0) : 0),
    multiSelect: true,
    step: 1,
    min: 0,
  },
  {
    property: 'cornerRadius',
    section: 'Border Radius',
    fieldKind: 'number',
    label: 'radius',
    timelineLabel: 'Radius',
    read: (el) =>
      el.type === 'shape'
        ? typeof el.cornerRadius === 'number'
          ? el.cornerRadius
          : Array.isArray(el.cornerRadius)
            ? el.cornerRadius[0]
            : 0
        : 0,
    // The uniform radius; a per-corner tuple (D-042) reads null (→ "mixed").
    multiRead: (el) =>
      el.type === 'shape'
        ? typeof el.cornerRadius === 'number'
          ? el.cornerRadius
          : el.cornerRadius === undefined
            ? 0
            : null
        : null,
    multiSelect: true,
    step: 1,
    min: 0,
  },
  shadowDesc('shadow.offsetX', 'offset X', 'Offset X', { step: 1, unit: 'px', multiSelect: true }),
  shadowDesc('shadow.offsetY', 'offset Y', 'Offset Y', { step: 1, unit: 'px', multiSelect: true }),
  shadowDesc('shadow.blur', 'blur', 'Blur', { step: 1, min: 0, unit: 'px', multiSelect: true }),
  shadowDesc('shadow.color', 'color', 'Color', { color: true, multiSelect: true }),
];

// ─────────────────────────────────────────────────────────────────────────────
// Text-specific — Text · Drop Shadow (reads el.textShadow) · Text Padding · Border Radius.
// ─────────────────────────────────────────────────────────────────────────────

const TEXT_SPECIFIC: readonly PropertyDescriptor[] = [
  {
    property: 'font.size',
    section: 'Text',
    fieldKind: 'number',
    label: 'font size',
    timelineLabel: 'Font size',
    read: (el) => (el.type === 'text' ? el.font.size : 0),
    step: 1,
    min: 1,
  },
  {
    property: 'text.color',
    section: 'Text',
    fieldKind: 'color',
    label: 'text color',
    timelineLabel: 'Color',
    read: (el) => (el.type === 'text' ? el.color : '#000000'),
    keyframeable: (el) =>
      el.type === 'text' && (el.colorFill === undefined || el.colorFill.kind === 'solid'),
    multiSelect: true,
  },
  {
    property: 'backgroundColor',
    section: 'Text',
    fieldKind: 'color',
    label: 'background',
    timelineLabel: 'Background color',
    read: (el) => (el.type === 'text' ? (el.backgroundColor ?? '#FFFFFF') : '#FFFFFF'),
    keyframeable: (el) => el.type === 'text' && el.backgroundFill === undefined,
  },
  {
    property: 'font.lineHeight',
    section: 'Text',
    fieldKind: 'number',
    label: 'line height',
    timelineLabel: 'Line height',
    read: (el) => (el.type === 'text' ? el.font.lineHeight : 0),
    step: 0.05,
    min: 0.1,
  },
  {
    property: 'font.letterSpacing',
    section: 'Text',
    fieldKind: 'number',
    label: 'letter spacing',
    timelineLabel: 'Letter spacing',
    read: (el) => (el.type === 'text' ? el.font.letterSpacing : 0),
    step: 0.01,
  },
  shadowDesc('shadow.offsetX', 'offset X', 'Offset X', { step: 1, unit: 'px' }),
  shadowDesc('shadow.offsetY', 'offset Y', 'Offset Y', { step: 1, unit: 'px' }),
  shadowDesc('shadow.blur', 'blur', 'Blur', { step: 1, min: 0, unit: 'px' }),
  shadowDesc('shadow.color', 'color', 'Color', { color: true }),
  paddingDesc('padding.top', 'top', 'Padding top'),
  paddingDesc('padding.right', 'right', 'Padding right'),
  paddingDesc('padding.bottom', 'bottom', 'Padding bottom'),
  paddingDesc('padding.left', 'left', 'Padding left'),
  {
    property: 'cornerRadius',
    section: 'Border Radius',
    fieldKind: 'number',
    label: 'radius',
    timelineLabel: 'Radius',
    read: (el) => (el.type === 'text' ? (el.cornerRadius ?? 0) : 0),
    step: 1,
    min: 0,
  },
];

/**
 * Drop-shadow sub-property. Reads the kind's shadow object — shape `shadow`, text
 * `textShadow` — so one descriptor serves both (the per-kind registry only ever
 * evaluates it for the matching element).
 */
function shadowDesc(
  property: AnimatableProperty,
  label: string,
  timelineLabel: string,
  opts: { step?: number; min?: number; unit?: string; color?: boolean; multiSelect?: boolean },
): PropertyDescriptor {
  const sub = property.slice('shadow.'.length) as 'offsetX' | 'offsetY' | 'blur' | 'color';
  const read = (el: Element): number | string => {
    const s = el.type === 'shape' ? el.shadow : el.type === 'text' ? el.textShadow : undefined;
    if (sub === 'color') return s?.color ?? '#000000';
    return s?.[sub] ?? 0;
  };
  return {
    property,
    section: 'Drop Shadow',
    fieldKind: opts.color === true ? 'color' : 'number',
    label,
    timelineLabel,
    read,
    ...(opts.step !== undefined ? { step: opts.step } : {}),
    ...(opts.min !== undefined ? { min: opts.min } : {}),
    ...(opts.unit !== undefined ? { unit: opts.unit } : {}),
    ...(opts.multiSelect === true ? { multiSelect: true } : {}),
  };
}

/** Text box-padding sub-property. */
function paddingDesc(
  property: AnimatableProperty,
  label: string,
  timelineLabel: string,
): PropertyDescriptor {
  const side = property.slice('padding.'.length) as 'top' | 'right' | 'bottom' | 'left';
  return {
    property,
    section: 'Text Padding',
    fieldKind: 'number',
    label,
    timelineLabel,
    read: (el) => (el.type === 'text' ? (el.padding?.[side] ?? 0) : 0),
    step: 1,
    min: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-kind registry. Order is [Transform, …kind-specific, Filter] so the timeline
// groups render in the section order the D-010 reference uses.
//
// Time-driven kinds (ticker/clock/sequence/repeater) and the bare kinds
// (image/composition/lottie/video-placeholder/container) expose only the universal
// transform + filter — their styling keyframe-ability is deferred to D-052.
// ─────────────────────────────────────────────────────────────────────────────

const UNIVERSAL_ONLY: readonly PropertyDescriptor[] = [...TRANSFORM, ...FILTER];

export const FIELD_REGISTRY: Record<Element['type'], readonly PropertyDescriptor[]> = {
  shape: [...TRANSFORM, ...SHAPE_SPECIFIC, ...FILTER],
  text: [...TRANSFORM, ...TEXT_SPECIFIC, ...FILTER],
  image: UNIVERSAL_ONLY,
  ticker: UNIVERSAL_ONLY,
  clock: UNIVERSAL_ONLY,
  sequence: UNIVERSAL_ONLY,
  repeater: UNIVERSAL_ONLY,
  composition: UNIVERSAL_ONLY,
  lottie: UNIVERSAL_ONLY,
  'video-placeholder': UNIVERSAL_ONLY,
  container: UNIVERSAL_ONLY,
};

/** Every managed property descriptor for an element's kind, in section order. */
export function descriptorsForKind(type: Element['type']): readonly PropertyDescriptor[] {
  return FIELD_REGISTRY[type];
}

/** Look up a single property's descriptor for an element's kind (undefined if unmanaged). */
export function descriptorFor(
  el: Element,
  property: AnimatableProperty,
): PropertyDescriptor | undefined {
  return FIELD_REGISTRY[el.type].find((d) => d.property === property);
}

/**
 * Whether `property` is keyframe-able for this element INSTANCE — the single rule
 * the right inspector and the timeline-left both obey, so a diamond renders iff
 * this is true and both panels agree.
 */
export function isKeyframeable(el: Element, property: AnimatableProperty): boolean {
  const d = descriptorFor(el, property);
  if (d === undefined) return false;
  return d.keyframeable?.(el) ?? true;
}

/** The keyframe-able descriptors for an element instance (drives the timeline-left rows). */
export function keyframeableDescriptors(el: Element): readonly PropertyDescriptor[] {
  return FIELD_REGISTRY[el.type].filter((d) => d.keyframeable?.(el) ?? true);
}

/** The descriptors the multi-select editor exposes for an element's kind. */
export function multiSelectDescriptors(el: Element): readonly PropertyDescriptor[] {
  return FIELD_REGISTRY[el.type].filter((d) => d.multiSelect === true);
}

/**
 * The static value a freshly-added keyframe for `property` should capture (the
 * registry `read`), or `fallback` when the property is unmanaged for this kind.
 */
export function readStaticValue(
  el: Element,
  property: AnimatableProperty,
  fallback: number | string,
): number | string {
  return descriptorFor(el, property)?.read(el) ?? fallback;
}
