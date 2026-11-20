import { isFieldNamespace, type FieldValues } from '@cg/shared-schema';
import type { TemplateInfo } from './channels/templates.js';

/** Authored text that a Control layout can apply without a row override. */
export function controlLiveLayoutFieldDefaults(
  template: Pick<TemplateInfo, 'controlLiveLayout' | 'groups'>,
): FieldValues {
  if (template.controlLiveLayout === undefined) return {};
  const frameCompositions = new Set(
    template.controlLiveLayout.frames.map(({ id }) => `layout-frame-${id}`),
  );
  const looks: [string, FieldValues][] = [];
  for (const look of template.groups ?? []) {
    const plates: [string, FieldValues][] = [];
    for (const plate of look.aggregate.groups) {
      if (!frameCompositions.has(plate.compositionId)) continue;
      const captions: [string, string][] = [];
      for (const field of plate.aggregate.fields) {
        if (field.type === 'text') captions.push([field.id, field.default]);
      }
      if (captions.length > 0) plates.push([plate.name, Object.fromEntries(captions)]);
    }
    if (plates.length > 0) looks.push([look.name, Object.fromEntries(plates)]);
  }
  return Object.fromEntries(looks);
}

/**
 * Keep inherited captions out of row data. On layout replacement, only remove old
 * seeds whose authored default changed. Explicit values that differ from a seed
 * (including an empty title) remain owned by the row.
 */
export function withoutInheritedControlLiveLayoutFields(
  fields: FieldValues,
  previousDefaults: FieldValues,
  nextDefaults?: FieldValues,
): FieldValues {
  let result = fields;
  for (const [key, previous] of Object.entries(previousDefaults)) {
    if (!Object.hasOwn(fields, key)) continue;
    const current = fields[key];
    const next = nextDefaults?.[key];
    if (isFieldNamespace(previous)) {
      if (!isFieldNamespace(current)) continue;
      const values = withoutInheritedControlLiveLayoutFields(
        current,
        previous,
        nextDefaults === undefined ? undefined : isFieldNamespace(next) ? next : {},
      );
      if (values === current) continue;
      if (result === fields) result = { ...fields };
      if (Object.keys(values).length === 0) delete result[key];
      else result[key] = values;
    } else if (current === previous && (nextDefaults === undefined || next !== previous)) {
      if (result === fields) result = { ...fields };
      delete result[key];
    }
  }
  return result;
}
