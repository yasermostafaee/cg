import type { DynamicField, Element, FieldBinding, Scene } from '@cg/shared-schema';

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
export function resolveBinding(field: DynamicField, element: Element): FieldBinding | null {
  if (field.type === 'text' || field.type === 'multiline') {
    if (element.type === 'text') {
      return { fieldId: field.id, target: { kind: 'text', elementId: element.id } };
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
    case 'repeater-items':
      return `repeater rows ${on(t.elementId)}`;
  }
}
