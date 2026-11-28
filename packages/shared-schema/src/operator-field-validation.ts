import { parseLocalizedNumber, valueMatchesPattern } from '@cg/text-shaping';
import {
  defaultNestedValues,
  isFieldNamespace,
  type CompositionFieldGroup,
} from './composition-fields.js';
import { patternPresetOf } from './field-patterns.js';
import {
  type DynamicField,
  type FieldValues,
  type FieldValidationText,
  fieldValidationText,
  ListItemSchema,
  numberFieldValueError,
} from './fields.js';
import { HexColorSchema } from './primitives.js';

export interface OperatorFieldIssue {
  code: 'invalid-field' | 'pattern';
  line: string;
}

interface OperatorFieldForm {
  fields: readonly DynamicField[];
  groups?: readonly CompositionFieldGroup[] | undefined;
}

export interface OperatorFieldRefusal extends OperatorFieldIssue {
  label: string;
}

function invalid(line: string): OperatorFieldIssue {
  return { code: 'invalid-field', line };
}

export function operatorPatternRefusalLine(pattern: string, text = fieldValidationText): string {
  const preset = patternPresetOf(pattern);
  return preset === undefined
    ? text('Not in the form this field takes.')
    : text('Not a {format}, e.g. {example}.', {
        format: text(preset.label),
        example: preset.example,
      });
}

/** The author's constraints on one value, including localized digits in numbers and patterns. */
export function operatorFieldError(
  field: DynamicField,
  value: unknown,
  text = fieldValidationText,
): OperatorFieldIssue | undefined {
  const assetId =
    typeof value === 'object' && value !== null && 'assetId' in value ? value.assetId : value;
  const empty =
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (field.type === 'image' && assetId === '') ||
    (field.type === 'list' && Array.isArray(value) && value.length === 0);
  if (empty) return field.required ? invalid(text('A value is required.')) : undefined;

  switch (field.type) {
    case 'text':
    case 'multiline': {
      if (typeof value !== 'string') return invalid(text('Must be text.'));
      const length = [...value].length;
      if (field.minLength !== undefined && length < field.minLength) {
        return invalid(text('Enter at least {limit} characters.', { limit: field.minLength }));
      }
      if (field.type === 'text' && field.maxLength !== undefined && length > field.maxLength) {
        return invalid(text('Enter at most {limit} characters.', { limit: field.maxLength }));
      }
      if (
        field.type === 'multiline' &&
        field.maxLines !== undefined &&
        value.split(/\r\n?|\n/u).length > field.maxLines
      ) {
        return invalid(text('Enter at most {limit} lines.', { limit: field.maxLines }));
      }
      return field.pattern === undefined || valueMatchesPattern(field.pattern, value)
        ? undefined
        : { code: 'pattern', line: operatorPatternRefusalLine(field.pattern, text) };
    }
    case 'number': {
      const number = typeof value === 'string' ? parseLocalizedNumber(value) : value;
      const error =
        typeof number === 'number'
          ? numberFieldValueError(field, number, text)
          : text('Must be a number.');
      return error === undefined ? undefined : invalid(error);
    }
    case 'select':
      return field.options.some((option) => option.value === value)
        ? undefined
        : invalid(
            text('Choose one of: {choices}.', {
              choices: field.options.map((option) => option.label).join(', '),
            }),
          );
    case 'boolean':
      return typeof value === 'boolean' ? undefined : invalid(text('Must be true or false.'));
    case 'color':
      return HexColorSchema.safeParse(value).success
        ? undefined
        : invalid(text('Must be a hex color.'));
    case 'image':
      return typeof assetId === 'string' ? undefined : invalid(text('Choose a picture.'));
    case 'list': {
      if (!Array.isArray(value)) return invalid(text('Must be a list.'));
      if (field.maxItems !== undefined && value.length > field.maxItems) {
        return invalid(text('Use at most {limit} items.', { limit: field.maxItems }));
      }
      if (field.itemFields === undefined) return undefined;
      for (const [index, raw] of value.entries()) {
        const row = ListItemSchema.safeParse(raw);
        if (!row.success)
          return invalid(text('Row {row} must be a list item.', { row: index + 1 }));
        for (const cell of field.itemFields) {
          const issue = operatorFieldError(cell, row.data[cell.id], text);
          if (issue !== undefined) {
            return {
              ...issue,
              line: text('Row {row} · {field}: {reason}', {
                row: index + 1,
                field: cell.label || cell.id,
                reason: issue.line,
              }),
            };
          }
        }
      }
      return undefined;
    }
  }
}

function scope(value: unknown): FieldValues | undefined {
  return isFieldNamespace(value) ? value : undefined;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b);
}

function collectRefusals(
  form: OperatorFieldForm,
  values: FieldValues,
  previous: FieldValues | undefined,
  defaults: FieldValues,
  out: OperatorFieldRefusal[],
  text: FieldValidationText,
): void {
  for (const field of form.fields) {
    const value = values[field.id];
    if (previous === undefined) {
      if (!Object.prototype.hasOwnProperty.call(values, field.id)) continue;
    } else if (sameValue(value ?? defaults[field.id], previous[field.id] ?? defaults[field.id])) {
      continue;
    }
    const issue = operatorFieldError(
      field,
      previous === undefined ? value : (value ?? defaults[field.id]),
      text,
    );
    if (issue !== undefined) out.push({ label: field.label || field.id, ...issue });
  }
  for (const group of form.groups ?? []) {
    const next = scope(values[group.name]);
    if (next === undefined && previous === undefined) continue;
    collectRefusals(
      group.aggregate,
      next ?? {},
      previous === undefined ? undefined : (scope(previous[group.name]) ?? {}),
      scope(defaults[group.name]) ?? {},
      out,
      text,
    );
  }
}

/**
 * With no applied snapshot, values are the operator's sparse draft. With a snapshot, values are
 * the resulting row and only changed effective values are checked. That permits unrelated edits on
 * a previously loaded row even if it holds legacy values the current constraints would reject.
 */
export function operatorFieldRefusals(
  form: OperatorFieldForm,
  values: FieldValues,
  applied?: FieldValues,
  text = fieldValidationText,
): OperatorFieldRefusal[] {
  const out: OperatorFieldRefusal[] = [];
  const defaults =
    applied === undefined
      ? {}
      : defaultNestedValues({ fields: form.fields, groups: form.groups ?? [] });
  collectRefusals(form, values, applied, defaults, out, text);
  return out;
}

/** The common Bridge/Mock preflight for stack.update, including its exact merge/replace semantics. */
export function operatorFieldUpdateRefusal(
  form: OperatorFieldForm | null,
  applied: FieldValues,
  fields: FieldValues,
  mergeMode: 'merge' | 'replace',
): { errorCode: OperatorFieldIssue['code']; message: string } | undefined {
  if (form === null) return undefined;
  const next = mergeMode === 'merge' ? { ...applied, ...fields } : fields;
  const issue = operatorFieldRefusals(form, next, applied)[0];
  return issue === undefined
    ? undefined
    : { errorCode: issue.code, message: `Not sent: ${issue.label} — ${issue.line}` };
}
