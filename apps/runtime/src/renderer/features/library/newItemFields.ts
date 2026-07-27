import type { TemplateInfo } from '@cg/shared-ipc';
import { defaultNestedValues, type FieldValues } from '@cg/shared-schema';
import { uuid } from '../../lib/uuid.js';

/**
 * The field-set a NEWLY created stack item starts with.
 *
 * B-038 Phase 3 — seeded from the template's field-schema defaults (not `{}`),
 * so `CG ADD` carries real data on load; operator edits flow as subsequent
 * `stack.update` values.
 * B-067 — seeded in the NESTED shape: a two-comp starter's fields live under
 * the nested instance's namespace, which is the address the template's binding
 * reads at render. `defaultNestedValues` is the same seeder the Designer's
 * preview uses.
 *
 * R-021 stage 3 — declared once here because there are now TWO places that
 * create an item from a template (the Library's Load onto the dynamic stack,
 * and a fixed row's exact-slot load). Two copies of the seed would mean the
 * same template could reach air with different data depending on which button
 * the operator pressed.
 */
export function newItemFields(template: TemplateInfo): FieldValues {
  return defaultNestedValues({ fields: template.fields, groups: template.groups ?? [] });
}

/** A fresh stack item id — the same shape both creation paths use. */
export function newItemId(): string {
  return `item-${uuid()}`;
}
