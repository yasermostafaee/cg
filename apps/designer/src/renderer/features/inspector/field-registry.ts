import type { AnimatableProperty, Element, Stroke } from '@cg/shared-schema';

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
// Box styling (D-042) — stroke + (uniform-or-per-corner) border radius, shared by
// every BACKGROUND-CAPABLE kind (shape, text, ticker, clock, sequence). Stroke is
// keyframe-able only for shape (Option A — time-driven stroke animation is D-052).
// The per-corner sub-tracks are present/keyframe-able only while the element is in
// per-corner (tuple) mode; the uniform `cornerRadius` only in uniform mode.
// ─────────────────────────────────────────────────────────────────────────────

interface BoxLike {
  stroke?: Stroke;
  cornerRadius?: number | [number, number, number, number];
}
const boxStroke = (el: Element): Stroke | undefined => (el as BoxLike).stroke;
const boxCorner = (el: Element): number | [number, number, number, number] | undefined =>
  (el as BoxLike).cornerRadius;
const isPerCorner = (el: Element): boolean => Array.isArray(boxCorner(el));
const uniformRadius = (el: Element): number => {
  const cr = boxCorner(el);
  return typeof cr === 'number' ? cr : Array.isArray(cr) ? cr[0] : 0;
};
const cornerAt = (el: Element, i: 0 | 1 | 2 | 3): number => {
  const cr = boxCorner(el);
  return Array.isArray(cr) ? cr[i] : typeof cr === 'number' ? cr : 0;
};

const STROKE_DESCS: readonly PropertyDescriptor[] = [
  {
    property: 'stroke.color',
    section: 'Path Style',
    fieldKind: 'color',
    label: 'stroke',
    timelineLabel: 'Stroke',
    read: (el) => boxStroke(el)?.color ?? '#000000',
    // Option A — stroke animation is offered only on shapes (D-052 for the rest).
    keyframeable: (el) => el.type === 'shape',
    multiSelect: true,
  },
  {
    property: 'stroke.width',
    section: 'Path Style',
    fieldKind: 'number',
    label: 'stroke width',
    timelineLabel: 'Stroke width',
    read: (el) => boxStroke(el)?.width ?? 0,
    keyframeable: (el) => el.type === 'shape',
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
    read: (el) => boxStroke(el)?.dash?.[0] ?? 0,
    keyframeable: (el) => el.type === 'shape',
    multiSelect: true,
    step: 1,
    min: 0,
  },
];

/** One per-corner radius sub-property (D-042) — present/keyframe-able only in per-corner mode. */
function cornerDesc(
  property: AnimatableProperty,
  label: string,
  timelineLabel: string,
  i: 0 | 1 | 2 | 3,
): PropertyDescriptor {
  return {
    property,
    section: 'Border Radius',
    fieldKind: 'number',
    label,
    timelineLabel,
    read: (el) => cornerAt(el, i),
    keyframeable: (el) => isPerCorner(el),
    step: 1,
    min: 0,
  };
}

const RADIUS_DESCS: readonly PropertyDescriptor[] = [
  {
    property: 'cornerRadius',
    section: 'Border Radius',
    fieldKind: 'number',
    label: 'radius',
    timelineLabel: 'Radius',
    read: (el) => uniformRadius(el),
    // The uniform value; a per-corner tuple reads null (→ "mixed") in multi-select.
    multiRead: (el) => {
      const cr = boxCorner(el);
      return typeof cr === 'number' ? cr : cr === undefined ? 0 : null;
    },
    // Keyframe-able only in UNIFORM mode; per-corner uses the tl/tr/br/bl sub-tracks.
    keyframeable: (el) => !isPerCorner(el),
    multiSelect: true,
    step: 1,
    min: 0,
  },
  cornerDesc('cornerRadius.tl', 'top left radius', 'Top left radius', 0),
  cornerDesc('cornerRadius.tr', 'top right radius', 'Top right radius', 1),
  cornerDesc('cornerRadius.br', 'bottom right radius', 'Bottom right radius', 2),
  cornerDesc('cornerRadius.bl', 'bottom left radius', 'Bottom left radius', 3),
];

/** The shared box descriptor set (Path Style stroke + Border Radius), in section order. */
const BOX_DESCS: readonly PropertyDescriptor[] = [...STROKE_DESCS, ...RADIUS_DESCS];

// ─────────────────────────────────────────────────────────────────────────────
// Shape-specific — fill (Path Style) · Drop Shadow (reads el.shadow). Stroke +
// border-radius now come from the shared BOX_DESCS above.
// ─────────────────────────────────────────────────────────────────────────────

const SHAPE_FILL: PropertyDescriptor = {
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
  keyframeable: (el) => el.type === 'shape' && (el.fill === undefined || el.fill.kind === 'solid'),
  multiSelect: true,
};

const SHAPE_SHADOW: readonly PropertyDescriptor[] = [
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
  // cornerRadius (+ stroke) now come from the shared BOX_DESCS (D-042).
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

// D-042 — the background-capable kinds (shape, text, ticker, clock, sequence) all
// include the shared BOX_DESCS (stroke + border radius). Order keeps each section's
// descriptors consecutive (shape: fill then stroke under Path Style). Repeater (no
// background) and the bare kinds stay transform + filter only.
export const FIELD_REGISTRY: Record<Element['type'], readonly PropertyDescriptor[]> = {
  shape: [...TRANSFORM, SHAPE_FILL, ...BOX_DESCS, ...SHAPE_SHADOW, ...FILTER],
  text: [...TRANSFORM, ...TEXT_SPECIFIC, ...BOX_DESCS, ...FILTER],
  image: UNIVERSAL_ONLY,
  ticker: [...TRANSFORM, ...BOX_DESCS, ...FILTER],
  clock: [...TRANSFORM, ...BOX_DESCS, ...FILTER],
  sequence: [...TRANSFORM, ...BOX_DESCS, ...FILTER],
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
