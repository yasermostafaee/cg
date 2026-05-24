import type { DynamicField, Element, FieldBinding } from '@cg/shared-schema';

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
  // select fields have no canonical visual target; the operator needs
  // to set transform/lottie/etc. by hand. Return null so the UI says
  // "no automatic target".
  return null;
}

/** Human-readable summary for the FieldsPanel's binding list. */
export function describeBinding(binding: FieldBinding): string {
  const t = binding.target;
  switch (t.kind) {
    case 'text':
      return `text on ${t.elementId}`;
    case 'image':
      return `image on ${t.elementId}`;
    case 'color':
      return `color.${t.property} on ${t.elementId}`;
    case 'visible':
      return `visible on ${t.elementId}`;
    case 'transform':
      return `transform.${t.property} on ${t.elementId}`;
    case 'scene-background':
      return 'scene background';
    case 'lottie-override':
      return `lottie ${t.layer}.${t.prop} on ${t.elementId}`;
  }
}
