import {
  isFieldNamespace,
  patternPresetOf,
  type CompositionFieldGroup,
  type DynamicField,
  type FieldValues,
} from '@cg/shared-schema';
import { valueMatchesPattern } from '@cg/text-shaping';

/**
 * 🔴 `R-101` — **CG CONTROL REFUSES A MISTYPED VALUE AGAINST ITS FIELD'S PATTERN, BEFORE IT IS SENT.**
 * The Inspector sent any text. A time like `25:00` reached the page, which refused it and kept the old
 * target, and its report reached no console: the operator typed a new azan time, pressed Update, and
 * the countdown went on counting to the old one with nothing said. The rule is the Designer preview's
 * (`valueMatchesPattern`): as typed or with Latin digits, so `۲۰:۳۲` is a time.
 */

/**
 * The one line under a refused field: the form in the operator's words — a preset's name and its
 * example — never the regex (golden rule 11).
 */
export function patternRefusalLine(pattern: string): string {
  const preset = patternPresetOf(pattern);
  return preset === undefined
    ? 'Not in the form this field takes.'
    : `Not a ${preset.label}, e.g. ${preset.example}.`;
}

/** The line for `value` in `field`, or `null` when the field has no pattern or the value fits it. */
export function fieldPatternRefusal(
  field: DynamicField | null | undefined,
  value: unknown,
): string | null {
  if (field === null || field === undefined) return null;
  if (field.type !== 'text' && field.type !== 'multiline') return null;
  if (field.pattern === undefined || typeof value !== 'string') return null;
  return valueMatchesPattern(field.pattern, value) ? null : patternRefusalLine(field.pattern);
}

/** A staged value its field refuses: the field's label and the line. */
export interface PatternRefusal {
  label: string;
  line: string;
}

/**
 * Every STAGED value its field's pattern refuses, through the template's composition groups (a
 * group's values ride under its namespace, as the field form stages them). Only what the operator
 * staged is checked: an applied value already went, and is not this press's to refuse.
 */
export function patternRefusalsOf(
  template: {
    fields: readonly DynamicField[];
    groups?: readonly CompositionFieldGroup[] | undefined;
  },
  staged: FieldValues,
): PatternRefusal[] {
  const out: PatternRefusal[] = [];
  for (const field of template.fields) {
    const line = fieldPatternRefusal(field, staged[field.id]);
    if (line !== null) out.push({ label: field.label, line });
  }
  for (const group of template.groups ?? []) {
    const nested = staged[group.name];
    if (!isFieldNamespace(nested)) continue;
    out.push(...patternRefusalsOf(group.aggregate, nested as FieldValues));
  }
  return out;
}
