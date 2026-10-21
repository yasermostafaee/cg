import type { AggregatedFields, FieldDoc } from './composition-fields.js';
import { repeaterRowLimit, type Element, type RepeaterElement } from './elements.js';
import type { DynamicField } from './fields.js';
import type { Scene } from './scene.js';

/**
 * `RUN-NEXT-VERSION-02` Q3 / Q4 — the field form with every `list` field's `maxItems` as its own doc's
 * bindings say — set, or dropped when nothing justifies it — through the nested composition groups
 * (each looked up in its own composition). What CG Control's import records and what the Designer's
 * preview form reads, so the two stop the list at the same row.
 */
export function withListLimits(
  scene: Pick<Scene, 'compositions'>,
  doc: FieldDoc,
  aggregate: AggregatedFields,
): AggregatedFields {
  return {
    fields: aggregate.fields.map((field) => limitField(doc, field)),
    groups: aggregate.groups.map((group) => {
      const child = scene.compositions?.find((c) => c.id === group.compositionId);
      return child === undefined
        ? group
        : { ...group, aggregate: withListLimits(scene, child, group.aggregate) };
    }),
  };
}

function limitField(doc: FieldDoc, field: DynamicField): DynamicField {
  if (field.type !== 'list') return field;
  const maxItems = listFieldMaxItems(doc, field.id);
  if (maxItems !== undefined) return field.maxItems === maxItems ? field : { ...field, maxItems };
  if (field.maxItems === undefined) return field;
  const rest = { ...field };
  delete rest.maxItems;
  return rest;
}

/**
 * 🔴 `RUN-NEXT-VERSION-02` Q3 / Q4 — **THE MOST ITEMS A `list` FIELD TAKES**, in its own doc: the row
 * limit ({@link repeaterRowLimit}) of the repeater it drives through a `repeater-items` binding — the
 * smallest when it drives several — or `undefined` when no limit applies. The ONE answer the
 * Designer's preview form, the GDD and CG Control's import all ask (golden rule 6): the page shows
 * the first N rows and drops the rest, so every editor of the list stops at N.
 */
export function listFieldMaxItems(
  doc: Pick<FieldDoc, 'bindings' | 'layers'>,
  fieldId: string,
): number | undefined {
  let limit: number | undefined;
  for (const binding of doc.bindings ?? []) {
    if (binding.fieldId !== fieldId || binding.target.kind !== 'repeater-items') continue;
    const repeater = repeaterIn(doc, binding.target.elementId);
    const n = repeater === undefined ? undefined : repeaterRowLimit(repeater);
    if (n !== undefined && (limit === undefined || n < limit)) limit = n;
  }
  return limit;
}

/** The repeater element `id` in a doc's own layers, at any container depth. */
function repeaterIn(doc: Pick<FieldDoc, 'layers'>, id: string): RepeaterElement | undefined {
  const walk = (children: readonly Element[]): RepeaterElement | undefined => {
    for (const el of children) {
      if (el.id === id) return el.type === 'repeater' ? el : undefined;
      if (el.type === 'container') {
        const found = walk(el.children);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  for (const layer of doc.layers) {
    const found = walk(layer.children);
    if (found !== undefined) return found;
  }
  return undefined;
}
