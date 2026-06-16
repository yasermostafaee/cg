import type { AnimatableProperty, Element, Shadow, Stroke } from '@cg/shared-schema';

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
 * Adding a kind/property is ONE declaration here. D-056 — the content-driven kinds
 * (ticker/clock/sequence) carry ONLY text: text colour (incl. gradient) + text-shadow.
 * Box styling (stroke, border-radius, background, padding) was removed from them
 * (D-042/D-052 reversed for these kinds); shape and text keep the full box set, and
 * repeater stays transform/opacity/filter.
 */

/** Inspector section a property groups under (the CollapseSection / timeline group title). */
export type InspectorSection =
  | 'Transform'
  | 'Path Style'
  | 'Text'
  | 'Border Radius'
  | 'Drop Shadow'
  | 'Text Shadow'
  | 'Box Shadow'
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

// D-052 — the time-driven kinds (ticker/clock/sequence). They already carry — and
// statically render — `color` / `backgroundColor`(+`backgroundFill`) / `textShadow` /
// `padding` / stroke; D-052 makes that styling keyframe-able (the cornerRadius
// precedent). Repeater (no background) and the bare kinds are excluded.
const isTimeDriven = (el: Element): boolean =>
  el.type === 'ticker' || el.type === 'clock' || el.type === 'sequence';

interface ColorBoxLike {
  color?: string;
  colorFill?: { kind: string };
  backgroundColor?: string;
  backgroundFill?: unknown;
}
/** A colour is keyframe-able only on the SOLID variant (a gradient can't interpolate). */
const solidTextColor = (el: Element): boolean => {
  const cf = (el as ColorBoxLike).colorFill;
  return cf === undefined || cf.kind === 'solid';
};
const solidBackground = (el: Element): boolean => (el as ColorBoxLike).backgroundFill === undefined;

const STROKE_DESCS: readonly PropertyDescriptor[] = [
  {
    property: 'stroke.color',
    section: 'Path Style',
    fieldKind: 'color',
    label: 'stroke',
    timelineLabel: 'Stroke',
    read: (el) => boxStroke(el)?.color ?? '#000000',
    // D-052 — stroke animation on shapes AND the time-driven kinds (ticker/clock/
    // sequence). Text stroke stays static (text is out of the D-052 scope).
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
// Shape-specific — fill (Path Style) · Box Shadow (reads el.shadow). Stroke +
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
  // D-057 — shape's box shadow is grouped/labelled "Box Shadow" (behaviour unchanged).
  shadowDesc(
    'shadow.offsetX',
    'offset X',
    'Offset X',
    { step: 1, unit: 'px', multiSelect: true },
    'Box Shadow',
  ),
  shadowDesc(
    'shadow.offsetY',
    'offset Y',
    'Offset Y',
    { step: 1, unit: 'px', multiSelect: true },
    'Box Shadow',
  ),
  shadowDesc(
    'shadow.blur',
    'blur',
    'Blur',
    { step: 1, min: 0, unit: 'px', multiSelect: true },
    'Box Shadow',
  ),
  shadowDesc('shadow.color', 'color', 'Color', { color: true, multiSelect: true }, 'Box Shadow'),
];

// ─────────────────────────────────────────────────────────────────────────────
// Text-specific — Text · Text Shadow (reads el.textShadow) · Text Padding · Border Radius.
// D-057 — text ALSO gets a Box Shadow set (BOX_SHADOW_DESCS, reads el.shadow), added in
// the text registry array below.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Text colour — shared by text AND (D-052) the time-driven kinds. Reads `el.color`
 * generically (the static lives in `el.color`, not a `text` object). Keyframe-able on
 * the SOLID variant only (text/clock/sequence carry a gradient `colorFill`; ticker has
 * none ⇒ always solid).
 */
const TEXT_COLOR_DESC: PropertyDescriptor = {
  property: 'text.color',
  section: 'Text',
  fieldKind: 'color',
  label: 'text color',
  timelineLabel: 'Color',
  read: (el) => (el as ColorBoxLike).color ?? '#000000',
  keyframeable: (el) => (el.type === 'text' || isTimeDriven(el)) && solidTextColor(el),
  multiSelect: true,
};

/** Background colour — shared by text AND the time-driven kinds; solid variant only. */
const BACKGROUND_COLOR_DESC: PropertyDescriptor = {
  property: 'backgroundColor',
  section: 'Text',
  fieldKind: 'color',
  label: 'background',
  timelineLabel: 'Background color',
  read: (el) => (el as ColorBoxLike).backgroundColor ?? '#FFFFFF',
  keyframeable: (el) => el.type === 'text' && solidBackground(el),
};

/** Drop/text-shadow sub-tracks — shared by text AND the time-driven kinds (read `textShadow`). */
// The text-shadow descriptor set (`shadow.*` → `textShadow`), shared by text + the
// content-driven kinds. D-057 — grouped/labelled "Text Shadow" (was "Drop Shadow").
const SHADOW_DESCS: readonly PropertyDescriptor[] = [
  shadowDesc('shadow.offsetX', 'offset X', 'Offset X', { step: 1, unit: 'px' }, 'Text Shadow'),
  shadowDesc('shadow.offsetY', 'offset Y', 'Offset Y', { step: 1, unit: 'px' }, 'Text Shadow'),
  shadowDesc('shadow.blur', 'blur', 'Blur', { step: 1, min: 0, unit: 'px' }, 'Text Shadow'),
  shadowDesc('shadow.color', 'color', 'Color', { color: true }, 'Text Shadow'),
];

/** Box-padding sub-tracks — text + (D-052) clock/sequence; NOT ticker (deferred). */
const PADDING_DESCS: readonly PropertyDescriptor[] = [
  paddingDesc('padding.top', 'top', 'Padding top'),
  paddingDesc('padding.right', 'right', 'Padding right'),
  paddingDesc('padding.bottom', 'bottom', 'Padding bottom'),
  paddingDesc('padding.left', 'left', 'Padding left'),
];

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
  TEXT_COLOR_DESC,
  BACKGROUND_COLOR_DESC,
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
  ...SHADOW_DESCS,
  ...PADDING_DESCS,
  // cornerRadius (+ stroke) now come from the shared BOX_DESCS (D-042).
];

/**
 * D-056 — the ONLY styling the content-driven kinds (ticker/clock/sequence) keyframe:
 * text colour (incl. gradient `colorFill`) + text-shadow. Background / border-radius /
 * stroke / padding were removed (they're not boxes — box styling belongs on a separate
 * shape layer). `text` and `shape` keep the full box set via their own arrays.
 */
const TIME_DRIVEN_STYLE: readonly PropertyDescriptor[] = [TEXT_COLOR_DESC, ...SHADOW_DESCS];

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
  section: InspectorSection,
): PropertyDescriptor {
  const sub = property.slice('shadow.'.length) as 'offsetX' | 'offsetY' | 'blur' | 'color';
  const read = (el: Element): number | string => {
    // shape → `shadow` (box-shadow); text + ticker/clock/sequence → `textShadow`.
    const s =
      el.type === 'shape'
        ? el.shadow
        : el.type === 'text' || isTimeDriven(el)
          ? (el as { textShadow?: Shadow }).textShadow
          : undefined;
    if (sub === 'color') return s?.color ?? '#000000';
    return s?.[sub] ?? 0;
  };
  return {
    property,
    section,
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

/**
 * D-057 — the text element's BOX shadow sub-property (`boxShadow.*`), reading `el.shadow`
 * (the box drop-shadow), independent of the `shadow.*` text-shadow. Text-only.
 */
function boxShadowDesc(
  property: AnimatableProperty,
  label: string,
  timelineLabel: string,
  opts: { step?: number; min?: number; unit?: string; color?: boolean },
): PropertyDescriptor {
  const sub = property.slice('boxShadow.'.length) as 'offsetX' | 'offsetY' | 'blur' | 'color';
  const read = (el: Element): number | string => {
    const s = (el as { shadow?: Shadow }).shadow;
    if (sub === 'color') return s?.color ?? '#000000';
    return s?.[sub] ?? 0;
  };
  return {
    property,
    section: 'Box Shadow',
    fieldKind: opts.color === true ? 'color' : 'number',
    label,
    timelineLabel,
    read,
    ...(opts.step !== undefined ? { step: opts.step } : {}),
    ...(opts.min !== undefined ? { min: opts.min } : {}),
    ...(opts.unit !== undefined ? { unit: opts.unit } : {}),
  };
}

/** D-057 — the text element's box-shadow descriptor set (separate from the text-shadow). */
const BOX_SHADOW_DESCS: readonly PropertyDescriptor[] = [
  boxShadowDesc('boxShadow.offsetX', 'offset X', 'Box offset X', { step: 1, unit: 'px' }),
  boxShadowDesc('boxShadow.offsetY', 'offset Y', 'Box offset Y', { step: 1, unit: 'px' }),
  boxShadowDesc('boxShadow.blur', 'blur', 'Box blur', { step: 1, min: 0, unit: 'px' }),
  boxShadowDesc('boxShadow.color', 'color', 'Box color', { color: true }),
];

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
    // D-056 — box padding is text-only again (content-driven kinds carry no box).
    read: (el) => (el.type === 'text' ? (el.padding?.[side] ?? 0) : 0),
    step: 1,
    min: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-kind registry. Order is [Transform, …kind-specific, Filter] so the timeline
// groups render in the section order the D-010 reference uses.
//
// Repeater (no background) and the bare kinds (image/composition/lottie/
// video-placeholder/container) expose only the universal transform + filter. The
// content-driven kinds (ticker/clock/sequence) carry only text — text colour +
// text-shadow (D-056); no box styling.
// ─────────────────────────────────────────────────────────────────────────────

const UNIVERSAL_ONLY: readonly PropertyDescriptor[] = [...TRANSFORM, ...FILTER];

// D-042 — the background-capable kinds (shape, text, ticker, clock, sequence) all
// include the shared BOX_DESCS (stroke + border radius). Order keeps each section's
// descriptors consecutive (shape: fill then stroke under Path Style). Repeater (no
// background) and the bare kinds stay transform + filter only.
export const FIELD_REGISTRY: Record<Element['type'], readonly PropertyDescriptor[]> = {
  shape: [...TRANSFORM, SHAPE_FILL, ...BOX_DESCS, ...SHAPE_SHADOW, ...FILTER],
  // D-057 — text adds an independent box-shadow set (BOX_SHADOW_DESCS, `boxShadow.*`)
  // beside its text-shadow (in TEXT_SPECIFIC via SHADOW_DESCS).
  text: [...TRANSFORM, ...TEXT_SPECIFIC, ...BOX_DESCS, ...BOX_SHADOW_DESCS, ...FILTER],
  image: UNIVERSAL_ONLY,
  // D-052 — time-driven kinds now keyframe stroke + text colour / background / shadow
  // (TIME_DRIVEN_STYLE); clock + sequence also keyframe padding. Ticker padding stays
  // deferred (inner-viewport / crawl-measurement coupling).
  // D-056 — content-driven kinds carry ONLY text: text colour (incl. gradient) +
  // text-shadow. No BOX_DESCS (stroke/radius), no background, no padding.
  ticker: [...TRANSFORM, ...TIME_DRIVEN_STYLE, ...FILTER],
  clock: [...TRANSFORM, ...TIME_DRIVEN_STYLE, ...FILTER],
  sequence: [...TRANSFORM, ...TIME_DRIVEN_STYLE, ...FILTER],
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
