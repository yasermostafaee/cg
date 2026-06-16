import type { AnimatableProperty, Element, Scene } from '@cg/shared-schema';
import {
  multiSelectDescriptors,
  type InspectorSection,
  type PropertyDescriptor,
} from './field-registry.js';

/**
 * Shared-property model for multi-selection editing (D-041 / D-049 / D-050 / D-051).
 *
 * Pure, kind-driven, data-driven: each element kind's editable descriptors come
 * from the CENTRAL field registry (`field-registry.ts`); `sharedEditableProperties`
 * intersects those across the selected elements and reports, per shared property,
 * whether the selection AGREES (a common value) or DIFFERS (a neutral "mixed"
 * state). No hardcoded pairwise kind combinations — adding a kind or a property is
 * a single registry declaration.
 *
 * D-051 retired the previous SHORT-PATH duplication: the per-kind `UNIVERSAL` /
 * `BY_KIND` tables (which mirrored `StyleSection.tsx` and `keyframe-helpers.ts` and
 * carried `⚠️ SYNC-WITH` warnings) are gone — these descriptors are derived from the
 * one registry the single inspector and the timeline also read.
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
  /** The element's CURRENT static value (null = no representable value → "mixed"). */
  read: (el: Element) => number | string | null;
  step?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
  /** Unit suffix for non-transform number fields (transform units come from TRANSFORM_FIELD_META). */
  suffix?: string | undefined;
}

/**
 * The multi editor groups under a narrower section set than the registry (it has no
 * dedicated Text / Text Padding headers); map the registry section to the editor's.
 * Today only `text.color` (registry section "Text") is multi-exposed among the
 * text-specific properties, and it has always shown under "Path Style".
 */
function toSharedSection(section: InspectorSection): SharedSection {
  switch (section) {
    case 'Transform':
      return 'Transform';
    case 'Border Radius':
      return 'Border Radius';
    // D-057 — text/shape shadow sections map to the multi editor's single shadow group.
    case 'Drop Shadow':
    case 'Text Shadow':
    case 'Box Shadow':
      return 'Drop Shadow';
    case 'Filter':
      return 'Filter';
    case 'Path Style':
    case 'Text':
    case 'Text Padding':
      return 'Path Style';
  }
}

/** Map a central-registry descriptor to the multi editor's shared-property descriptor. */
function toShared(d: PropertyDescriptor): SharedPropertyDescriptor {
  const read = d.multiRead ?? d.read;
  return {
    key: d.property,
    label: d.label,
    kind: d.fieldKind,
    section: toSharedSection(d.section),
    prop: d.property,
    read: (el) => read(el),
    step: d.step,
    min: d.min,
    max: d.max,
    suffix: d.unit,
  };
}

function descriptorsFor(el: Element): readonly SharedPropertyDescriptor[] {
  return multiSelectDescriptors(el).map(toShared);
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
