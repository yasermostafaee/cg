import type { LottieLayerInfo } from '@cg/lottie-bridge';
import type { DynamicField, Element, FieldBinding, Scene } from '@cg/shared-schema';

/**
 * D-125 Phase 3c — context the caller supplies for targets the (field, element) pair
 * alone cannot resolve. A `lottie-override` needs a LAYER name, which lives in the
 * parsed animation (the renderer's lottieAssetCache), not on the element.
 */
export interface ResolveBindingContext {
  /** Named top-level layers of the hit Lottie's animation (`lottieLayerNames`). */
  lottieLayers?: readonly LottieLayerInfo[] | undefined;
}

/**
 * Best-effort default binding for a (field, element) pair.
 *
 * The Designer's "bind from canvas" workflow picks the most natural
 * target kind for the field/element type combo. The operator can refine
 * it later via the Inspector. Unsupported combos return null and the UI
 * surfaces "can't bind" feedback.
 *
 * Why each rule exists:
 *   - text|multiline + text       → replace the element's text content
 *   - text|multiline + image      → swap the image asset by id-string
 *   - color           + shape     → fill (default shape color slot)
 *   - color           + text      → text color
 *   - boolean         + any       → visibility toggle
 *   - number          + any       → opacity (the most "universally useful" numeric prop)
 *   - image           + image     → swap image asset
 */
export function resolveBinding(
  field: DynamicField,
  element: Element,
  context?: ResolveBindingContext,
): FieldBinding | null {
  if (field.type === 'text' || field.type === 'multiline') {
    if (element.type === 'text') {
      return { fieldId: field.id, target: { kind: 'text', elementId: element.id } };
    }
    // D-137 — a text field on a Live Source drives its symbolic source id: the
    // Cinegy variable-bound Live ID, so the operator picks which source feeds the
    // hole per take. Defaults to the FILL role — the only id v1 composites, and the
    // one that exists on every Live Source; the KEY role is set by hand in the
    // Inspector, because binding it by default would silently promise a fill+key
    // pair on a source that has no key.
    if (element.type === 'video-placeholder') {
      return {
        fieldId: field.id,
        target: { kind: 'live-source-id', elementId: element.id, role: 'fill' },
      };
    }
    // D-125 Phase 3c — a text field on a Lottie targets the clip's FIRST text layer
    // (the natural default; the binding row shows `lottie <layer>.text` so the pick is
    // visible). A clip with no text layer can't take a text override — null, and the
    // UI's existing "can't bind" feedback surfaces it.
    if (element.type === 'lottie') {
      const layer = context?.lottieLayers?.find((l) => l.kind === 'text');
      if (layer === undefined) return null;
      return {
        fieldId: field.id,
        target: { kind: 'lottie-override', elementId: element.id, layer: layer.name, prop: 'text' },
      };
    }
    return null;
  }
  if (field.type === 'image') {
    if (element.type === 'image') {
      return { fieldId: field.id, target: { kind: 'image', elementId: element.id } };
    }
    return null;
  }
  if (field.type === 'color') {
    // D-125 Phase 3c — a colour field on a Lottie recolours the FIRST DRAWABLE
    // (shape/solid) layer's static fill: the typical single-furniture-shape case.
    // Deliberately NOT "first non-text" — AE rigs often lead with a null controller
    // or a precomp, whose subtree carries no direct paint to hit.
    if (element.type === 'lottie') {
      const layer = context?.lottieLayers?.find((l) => l.kind === 'shape');
      if (layer === undefined) return null;
      return {
        fieldId: field.id,
        target: { kind: 'lottie-override', elementId: element.id, layer: layer.name, prop: 'fill' },
      };
    }
    if (element.type === 'shape') {
      return {
        fieldId: field.id,
        target: { kind: 'color', elementId: element.id, property: 'fill' },
      };
    }
    if (element.type === 'text') {
      return {
        fieldId: field.id,
        target: { kind: 'color', elementId: element.id, property: 'text' },
      };
    }
    return null;
  }
  if (field.type === 'boolean') {
    return { fieldId: field.id, target: { kind: 'visible', elementId: element.id } };
  }
  if (field.type === 'number') {
    return {
      fieldId: field.id,
      target: { kind: 'transform', elementId: element.id, property: 'opacity' },
    };
  }
  // D-028/D-029/D-030 — a list field drives a ticker's, sequence's, or
  // repeater's items.
  if (field.type === 'list') {
    if (element.type === 'ticker') {
      return { fieldId: field.id, target: { kind: 'ticker-items', elementId: element.id } };
    }
    if (element.type === 'sequence') {
      // D-083 — binding is TEXT-ONLY in Phase 1: a sequence holding any composition
      // item can't be data-bound (a bound `list` value carries only text items).
      if (element.items.some((it) => it.kind === 'composition')) return null;
      return { fieldId: field.id, target: { kind: 'sequence-items', elementId: element.id } };
    }
    if (element.type === 'repeater') {
      return { fieldId: field.id, target: { kind: 'repeater-items', elementId: element.id } };
    }
    return null;
  }
  // select fields have no canonical visual target; the operator needs
  // to set transform/lottie/etc. by hand. Return null so the UI says
  // "no automatic target".
  return null;
}

/**
 * Build an `elementId → display name` resolver from a scene's layers (recursing
 * into containers). Used to show friendly element names in binding summaries
 * instead of raw ids like `el-1780763992325`.
 */
export function elementNameResolver(scene: Scene): (id: string) => string {
  const names = new Map<string, string>();
  function walk(children: readonly Element[]): void {
    for (const el of children) {
      names.set(el.id, el.name);
      const kids = (el as { children?: readonly Element[] }).children;
      if (kids !== undefined) walk(kids);
    }
  }
  for (const layer of scene.layers) walk(layer.children);
  return (id) => names.get(id) ?? id;
}

/**
 * Human-readable summary for a binding's target. Pass `nameOf` (see
 * {@link elementNameResolver}) to print the element's name rather than its id.
 */
export function describeBinding(binding: FieldBinding, nameOf?: (id: string) => string): string {
  const t = binding.target;
  const on = (id: string): string => `on ${nameOf?.(id) ?? id}`;
  switch (t.kind) {
    case 'text':
      return `text ${on(t.elementId)}`;
    case 'image':
      return `image ${on(t.elementId)}`;
    case 'color':
      return `color.${t.property} ${on(t.elementId)}`;
    case 'visible':
      return `visible ${on(t.elementId)}`;
    case 'transform':
      return `transform.${t.property} ${on(t.elementId)}`;
    case 'scene-background':
      return 'scene background';
    case 'lottie-override':
      return `lottie ${t.layer}.${t.prop} ${on(t.elementId)}`;
    case 'ticker-items':
      return `ticker items ${on(t.elementId)}`;
    case 'sequence-items':
      return `sequence items ${on(t.elementId)}`;
    case 'sequence-item-text':
      return `sequence item text ${on(t.elementId)}`;
    case 'repeater-items':
      return `repeater rows ${on(t.elementId)}`;
    case 'clock-target':
      // D-141 — the countdown's target time, the clock's ONE bindable value.
      return `countdown target ${on(t.elementId)}`;
    case 'live-source-id':
      // D-137 — name the ROLE, always. "live source id on Guest box" would read the
      // same for the fill and the key, and a key bound where a fill was meant is a
      // hole that stays empty on air with the binding row looking correct.
      return `live source ${t.role} id ${on(t.elementId)}`;
  }
}
