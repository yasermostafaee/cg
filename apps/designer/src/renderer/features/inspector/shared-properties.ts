import type { AnimatableProperty, Element, Scene } from '@cg/shared-schema';

/**
 * Shared-property model for multi-selection editing (D-041 / D-049 / D-050).
 *
 * Pure, kind-driven, data-driven: each element KIND declares its editable
 * property descriptors; `sharedEditableProperties` intersects those across the
 * selected elements and reports, per shared property, whether the selection
 * AGREES (a common value) or DIFFERS (a neutral "mixed" state). No hardcoded
 * pairwise kind combinations — adding a kind or a property is a table edit.
 *
 * D-050 widens the per-kind sets to the FULL editable-property set the single
 * inspector exposes (scale, stroke, border-radius, drop-shadow, filter, …), so
 * a multi-selection exposes every property common to its kinds, grouped under
 * the same `section`s as the single inspector.
 *
 * ⚠️ SYNC WITH StyleSection.tsx / TransformSection.tsx. There is no central
 * per-kind property-metadata table in the codebase — the single inspector
 * hand-writes its sections (`ShapeSections`, `TransformSection`, …). These
 * descriptors MIRROR those fields' `prop` ids + read accessors. This is an
 * accepted SHORT-PATH duplication (a central-metadata refactor is a separate
 * quality item, parked near D-035). When a shape property is added/changed in
 * the single inspector, UPDATE BOTH SITES. See the matching note in
 * `StyleSection.tsx` (ShapeSections) and `design.md` of
 * `complete-multi-select-shared-props`.
 *
 * Writes go through the keyframe-free base path (`writeStaticAnimatable` /
 * `updateElement`) — `prop` is the animatable-property id that path understands.
 */

export type SharedFieldKind = 'number' | 'color' | 'fill';

/** Inspector section a shared property is grouped under (the CollapseSection title). */
export type SharedSection = 'Transform' | 'Path Style' | 'Border Radius' | 'Drop Shadow' | 'Filter';

export interface SharedPropertyDescriptor {
  /** Stable key used for the kind intersection and as the React key. */
  key: string;
  /** Inspector label. */
  label: string;
  kind: SharedFieldKind;
  /** Section the field is grouped under (parity with the single inspector). */
  section: SharedSection;
  /** Animatable-property id understood by `writeStaticAnimatable`. */
  prop: AnimatableProperty;
  /** The element's CURRENT static value (null = no representable value). */
  read: (el: Element) => number | string | null;
  step?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
  /** Unit suffix for non-transform number fields (transform units come from TRANSFORM_FIELD_META). */
  suffix?: string | undefined;
}

const FILTER_DEFAULTS: Record<string, number> = {
  blur: 0,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  hueRotate: 0,
  invert: 0,
  opacity: 100,
  saturate: 100,
  sepia: 0,
};

function filterDesc(
  key: keyof typeof FILTER_DEFAULTS,
  label: string,
  opts: { step: number; min?: number; max?: number; suffix: string },
): SharedPropertyDescriptor {
  const prop = `filter.${key}` as AnimatableProperty;
  return {
    key: prop,
    label,
    kind: 'number',
    section: 'Filter',
    prop,
    read: (el) => {
      const f = el.filter as Record<string, number | undefined> | undefined;
      return f?.[key] ?? FILTER_DEFAULTS[key] ?? 0;
    },
    step: opts.step,
    min: opts.min,
    max: opts.max,
    suffix: opts.suffix,
  };
}

/**
 * On every element kind. Transform + opacity live on `ElementBase`; `filter` is
 * also on `ElementBase`, so the Filter section is shared by any selection.
 */
const UNIVERSAL: readonly SharedPropertyDescriptor[] = [
  {
    key: 'position.x',
    label: 'X',
    kind: 'number',
    section: 'Transform',
    prop: 'position.x',
    read: (el) => el.transform.position.x,
    step: 1,
  },
  {
    key: 'position.y',
    label: 'Y',
    kind: 'number',
    section: 'Transform',
    prop: 'position.y',
    read: (el) => el.transform.position.y,
    step: 1,
  },
  {
    key: 'size.w',
    label: 'W',
    kind: 'number',
    section: 'Transform',
    prop: 'size.w',
    read: (el) => el.transform.size.w,
    step: 1,
    min: 0,
  },
  {
    key: 'size.h',
    label: 'H',
    kind: 'number',
    section: 'Transform',
    prop: 'size.h',
    read: (el) => el.transform.size.h,
    step: 1,
    min: 0,
  },
  {
    key: 'scale.x',
    label: 'Scale X',
    kind: 'number',
    section: 'Transform',
    prop: 'scale.x',
    read: (el) => el.transform.scale.x,
    step: 1,
  },
  {
    key: 'scale.y',
    label: 'Scale Y',
    kind: 'number',
    section: 'Transform',
    prop: 'scale.y',
    read: (el) => el.transform.scale.y,
    step: 1,
  },
  {
    key: 'rotation',
    label: 'Rotation',
    kind: 'number',
    section: 'Transform',
    prop: 'rotation',
    read: (el) => el.transform.rotation,
    step: 1,
  },
  {
    key: 'opacity',
    label: 'Opacity',
    kind: 'number',
    section: 'Transform',
    prop: 'opacity',
    read: (el) => el.opacity,
    step: 0.05,
    min: 0,
    max: 1,
  },
  // Filter (CSS filter) — stored value == displayed value (see FilterSection).
  filterDesc('blur', 'blur', { step: 0.5, min: 0, suffix: 'px' }),
  filterDesc('brightness', 'brightness', { step: 1, min: 0, suffix: '%' }),
  filterDesc('contrast', 'contrast', { step: 1, min: 0, suffix: '%' }),
  filterDesc('grayscale', 'grayscale', { step: 1, min: 0, max: 100, suffix: '%' }),
  filterDesc('hueRotate', 'hue rotate', { step: 1, suffix: '°' }),
  filterDesc('invert', 'invert', { step: 1, min: 0, max: 100, suffix: '%' }),
  filterDesc('opacity', 'opacity', { step: 1, min: 0, max: 100, suffix: '%' }),
  filterDesc('saturate', 'saturate', { step: 1, min: 0, suffix: '%' }),
  filterDesc('sepia', 'sepia', { step: 1, min: 0, max: 100, suffix: '%' }),
];

/** Additional editable descriptors per element kind (mirror StyleSection — keep in sync). */
const BY_KIND: Partial<Record<Element['type'], readonly SharedPropertyDescriptor[]>> = {
  shape: [
    {
      key: 'fill.color',
      label: 'fill',
      kind: 'fill',
      section: 'Path Style',
      prop: 'fill.color',
      read: (el) => (el.type === 'shape' && el.fill?.kind === 'solid' ? el.fill.color : null),
    },
    {
      key: 'stroke.color',
      label: 'stroke',
      kind: 'color',
      section: 'Path Style',
      prop: 'stroke.color',
      read: (el) => (el.type === 'shape' ? (el.stroke?.color ?? '#000000') : null),
    },
    {
      key: 'stroke.width',
      label: 'stroke width',
      kind: 'number',
      section: 'Path Style',
      prop: 'stroke.width',
      read: (el) => (el.type === 'shape' ? (el.stroke?.width ?? 0) : null),
      step: 1,
      min: 0,
    },
    {
      key: 'stroke.dash',
      label: 'dash array',
      kind: 'number',
      section: 'Path Style',
      prop: 'stroke.dash',
      read: (el) => (el.type === 'shape' ? (el.stroke?.dash?.[0] ?? 0) : null),
      step: 1,
      min: 0,
    },
    {
      key: 'cornerRadius',
      label: 'radius',
      kind: 'number',
      section: 'Border Radius',
      prop: 'cornerRadius',
      // cornerRadius may be a single radius or a per-corner tuple (D-042). The
      // multi editor edits the UNIFORM radius: a scalar reads as itself, unset
      // reads 0, a per-corner tuple reads null (shows "mixed" until set uniform).
      read: (el) => {
        if (el.type !== 'shape') return null;
        const cr = el.cornerRadius;
        return typeof cr === 'number' ? cr : cr === undefined ? 0 : null;
      },
      step: 1,
      min: 0,
    },
    {
      key: 'shadow.offsetX',
      label: 'offset X',
      kind: 'number',
      section: 'Drop Shadow',
      prop: 'shadow.offsetX',
      read: (el) => (el.type === 'shape' ? (el.shadow?.offsetX ?? 0) : null),
      step: 1,
    },
    {
      key: 'shadow.offsetY',
      label: 'offset Y',
      kind: 'number',
      section: 'Drop Shadow',
      prop: 'shadow.offsetY',
      read: (el) => (el.type === 'shape' ? (el.shadow?.offsetY ?? 0) : null),
      step: 1,
    },
    {
      key: 'shadow.blur',
      label: 'blur',
      kind: 'number',
      section: 'Drop Shadow',
      prop: 'shadow.blur',
      read: (el) => (el.type === 'shape' ? (el.shadow?.blur ?? 0) : null),
      step: 1,
      min: 0,
    },
    {
      key: 'shadow.color',
      label: 'color',
      kind: 'color',
      section: 'Drop Shadow',
      prop: 'shadow.color',
      read: (el) => (el.type === 'shape' ? (el.shadow?.color ?? '#000000') : null),
    },
  ],
  text: [
    {
      key: 'text.color',
      label: 'text color',
      kind: 'color',
      section: 'Path Style',
      prop: 'text.color',
      read: (el) => (el.type === 'text' ? el.color : null),
    },
  ],
};

function descriptorsFor(el: Element): readonly SharedPropertyDescriptor[] {
  return [...UNIVERSAL, ...(BY_KIND[el.type] ?? [])];
}

export interface SharedProperty {
  descriptor: SharedPropertyDescriptor;
  /** The agreed value when every selected element matches; undefined when mixed. */
  value: number | string | undefined;
  /** True when the selected elements DIFFER on this property (show "mixed"). */
  mixed: boolean;
}

/**
 * The editable properties COMMON to every selected element's kind, each tagged
 * with its agreed value or a mixed flag. Empty for an empty selection.
 */
export function sharedEditableProperties(elements: readonly Element[]): SharedProperty[] {
  if (elements.length === 0) return [];
  const perElement = elements.map(descriptorsFor);
  const [firstList] = perElement;
  if (firstList === undefined) return [];
  const shared = firstList.filter((d) =>
    perElement.every((list) => list.some((x) => x.key === d.key)),
  );
  return shared.map((descriptor) => {
    const values = elements.map((el) => descriptor.read(el));
    const allEqual = values.every((v) => v === values[0]);
    return {
      descriptor,
      value: allEqual ? (values[0] ?? undefined) : undefined,
      mixed: !allEqual,
    };
  });
}

/**
 * The selected elements (top-level layer children, layer order) for the
 * multi-selection path. `InspectorPanel.findSelected` stays the `size === 1`
 * accessor; this one feeds the multi editor and is not overloaded with it.
 */
export function selectedElements(scene: Scene, selection: ReadonlySet<string>): Element[] {
  const out: Element[] = [];
  for (const layer of scene.layers) {
    for (const el of layer.children) {
      if (selection.has(el.id)) out.push(el);
    }
  }
  return out;
}
