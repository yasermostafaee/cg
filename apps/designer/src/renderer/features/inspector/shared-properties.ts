import type { AnimatableProperty, Element, Scene } from '@cg/shared-schema';

/**
 * Shared-property model for multi-selection editing (D-041).
 *
 * Pure, kind-driven, data-driven: each element KIND declares its editable
 * property descriptors; `sharedEditableProperties` intersects those across the
 * selected elements and reports, per shared property, whether the selection
 * AGREES (a common value) or DIFFERS (a neutral "mixed" state). No hardcoded
 * pairwise kind combinations — adding a kind or a property is a table edit.
 *
 * v1 surface: the universal transform set (position X/Y, width, height,
 * rotation, opacity) on every kind, plus `fill` on shapes and `color` on text.
 * The table is intentionally easy to extend toward each kind's full property set.
 * Writes go through the keyframe-free base path (`writeStaticAnimatable` /
 * `updateElement`) — `prop` is the animatable-property id that path understands.
 */

export type SharedFieldKind = 'number' | 'color';

export interface SharedPropertyDescriptor {
  /** Stable key used for the kind intersection and as the React key. */
  key: string;
  /** Inspector label. */
  label: string;
  kind: SharedFieldKind;
  /** Animatable-property id understood by `writeStaticAnimatable`. */
  prop: AnimatableProperty;
  /** The element's CURRENT static value (null = no representable value). */
  read: (el: Element) => number | string | null;
  step?: number;
  min?: number;
  max?: number;
}

/** On every element kind (transform + opacity live on `ElementBase`). */
const UNIVERSAL: readonly SharedPropertyDescriptor[] = [
  {
    key: 'position.x',
    label: 'X',
    kind: 'number',
    prop: 'position.x',
    read: (el) => el.transform.position.x,
    step: 1,
  },
  {
    key: 'position.y',
    label: 'Y',
    kind: 'number',
    prop: 'position.y',
    read: (el) => el.transform.position.y,
    step: 1,
  },
  {
    key: 'size.w',
    label: 'W',
    kind: 'number',
    prop: 'size.w',
    read: (el) => el.transform.size.w,
    step: 1,
    min: 0,
  },
  {
    key: 'size.h',
    label: 'H',
    kind: 'number',
    prop: 'size.h',
    read: (el) => el.transform.size.h,
    step: 1,
    min: 0,
  },
  {
    key: 'rotation',
    label: 'Rotation',
    kind: 'number',
    prop: 'rotation',
    read: (el) => el.transform.rotation,
    step: 1,
  },
  {
    key: 'opacity',
    label: 'Opacity',
    kind: 'number',
    prop: 'opacity',
    read: (el) => el.opacity,
    step: 0.05,
    min: 0,
    max: 1,
  },
];

/** Additional editable descriptors per element kind (extend freely). */
const BY_KIND: Partial<Record<Element['type'], readonly SharedPropertyDescriptor[]>> = {
  shape: [
    {
      key: 'fill.color',
      label: 'Fill',
      kind: 'color',
      prop: 'fill.color',
      read: (el) => (el.type === 'shape' && el.fill?.kind === 'solid' ? el.fill.color : null),
    },
  ],
  text: [
    {
      key: 'text.color',
      label: 'Color',
      kind: 'color',
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
