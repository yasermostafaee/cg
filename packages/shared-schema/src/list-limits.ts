import type { AggregatedFields, FieldDoc } from './composition-fields.js';
import { repeaterRowLimit, type Element, type RepeaterElement } from './elements.js';
import {
  imageFieldAllowsChoices,
  type DynamicField,
  type ImageFieldAssetOption,
  type ListItemField,
} from './fields.js';
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
  imageAssets?: readonly ImageFieldAssetOption[],
): AggregatedFields {
  return {
    fields: aggregate.fields.map((field) => describeField(scene, doc, field, imageAssets)),
    groups: aggregate.groups.map((group) => {
      const child = scene.compositions?.find((c) => c.id === group.compositionId);
      return child === undefined
        ? group
        : { ...group, aggregate: withListLimits(scene, child, group.aggregate, imageAssets) };
    }),
  };
}

function withImageAssets(
  field: Extract<DynamicField, { type: 'image' }>,
  imageAssets: readonly ImageFieldAssetOption[] | undefined,
): Extract<DynamicField, { type: 'image' }> {
  const next = { ...field };
  if (!imageFieldAllowsChoices(field)) return next;
  // Designer Preview has no package manifest at this stage: retain the author's allowlist.
  if (imageAssets === undefined) return next;
  const packaged = new Map(imageAssets.map((option) => [option.assetId, option] as const));
  if (field.assetOptions !== undefined) {
    // Keep the authored subset/order, but prefer the packaged filename when available.
    next.assetOptions = field.assetOptions.map((option) => {
      const packagedOption = packaged.get(option.assetId);
      return {
        ...option,
        ...(packagedOption?.label === undefined ? {} : { label: packagedOption.label }),
      };
    });
  } else if (field.inputMode === undefined) {
    // Backward compatibility: fields authored before inputMode implicitly offered every packaged
    // image. B-413 deliberately limits that fallback to legacy records only.
    next.assetOptions = [...imageAssets];
  } else {
    // B-413 — a modern author explicitly chose an image mode but checked no images. Preserve that
    // empty allowlist instead of silently widening it to every picture in the package.
    next.assetOptions = [];
  }
  return next;
}

function describeField(
  scene: Pick<Scene, 'compositions'>,
  doc: FieldDoc,
  field: DynamicField,
  imageAssets: readonly ImageFieldAssetOption[] | undefined,
): DynamicField {
  if (field.type === 'image') return withImageAssets(field, imageAssets);
  if (field.type !== 'list') return field;
  const maxItems = listFieldMaxItems(doc, field.id);
  const itemFields = listFieldItemFields(scene, doc, field.id, imageAssets);
  const next = { ...field };
  if (maxItems === undefined) delete next.maxItems;
  else next.maxItems = maxItems;
  if (itemFields === undefined) delete next.itemFields;
  else next.itemFields = itemFields;
  return next;
}

/** Child-derived flat row schema for a list bound to a Repeater. */
export function listFieldItemFields(
  scene: Pick<Scene, 'compositions'>,
  doc: Pick<FieldDoc, 'bindings' | 'layers'>,
  fieldId: string,
  imageAssets?: readonly ImageFieldAssetOption[],
): ListItemField[] | undefined {
  for (const binding of doc.bindings ?? []) {
    if (binding.fieldId !== fieldId || binding.target.kind !== 'repeater-items') continue;
    const repeater = repeaterIn(doc, binding.target.elementId);
    if (repeater === undefined) continue;
    const child = scene.compositions?.find(
      (composition) => composition.id === repeater.compositionId,
    );
    if (child === undefined) continue;
    return (child.fields ?? [])
      .filter((field): field is ListItemField => field.type !== 'list')
      .map((field) =>
        field.type === 'image' ? (withImageAssets(field, imageAssets) as ListItemField) : field,
      );
  }
  return undefined;
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
