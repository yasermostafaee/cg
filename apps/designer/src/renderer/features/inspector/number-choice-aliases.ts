import { numberFieldValueAlias } from '@cg/shared-schema';
import { parseLocalizedNumber } from '@cg/text-shaping';

interface NumberChoices {
  readonly allowedValues?: readonly number[] | undefined;
  readonly allowedValueLabels?: Readonly<Record<string, string>> | undefined;
}

export type ParsedNumberChoices =
  | {
      readonly ok: true;
      readonly values: readonly number[];
      readonly labels: Readonly<Record<string, string>>;
    }
  | { readonly ok: false; readonly error: string };

export interface NumberChoiceEditorRow {
  readonly value: string;
  readonly alias: string;
}

function choiceNumber(raw: string): number | undefined {
  const text = raw.trim();
  if (text === '') return undefined;
  const plain = Number(text);
  const localized = Number.isFinite(plain) ? plain : parseLocalizedNumber(text);
  return typeof localized === 'number' && Number.isFinite(localized) ? localized : undefined;
}

function tidyNumber(value: number): number {
  return Number(value.toFixed(12));
}

/** Continue a consistent arithmetic progression; otherwise append after the current maximum. */
export function suggestNumberChoiceValue(rows: readonly NumberChoiceEditorRow[]): string {
  const values = rows.flatMap((row) => {
    const value = choiceNumber(row.value);
    return value === undefined ? [] : [value];
  });
  if (values.length === 0) return '0';

  const used = new Set(values);
  const last = values.at(-1) ?? 0;
  let step: number | undefined;
  if (values.length >= 2) {
    const differences: number[] = [];
    for (let index = 1; index < values.length; index += 1) {
      const previous = values[index - 1];
      const current = values[index];
      if (previous === undefined || current === undefined) continue;
      differences.push(tidyNumber(current - previous));
    }
    const candidate = differences[0];
    if (
      candidate !== undefined &&
      candidate !== 0 &&
      differences.every((difference) => Math.abs(difference - candidate) < 1e-9)
    ) {
      step = candidate;
    }
  }

  let candidate = tidyNumber(step === undefined ? Math.max(...values) + 1 : last + step);
  const fallbackStep = step ?? 1;
  while (used.has(candidate)) candidate = tidyNumber(candidate + fallbackStep);
  return String(candidate);
}

/** Validate the modal's row-based editor and return canonical numeric values. */
export function validateNumberChoiceRows(
  rows: readonly NumberChoiceEditorRow[],
): ParsedNumberChoices {
  if (rows.length === 0) {
    return { ok: false, error: 'Add at least one choice.' };
  }

  const parsed = rows.map((row, index) => {
    const value = choiceNumber(row.value);
    return { index, value, alias: row.alias.trim() };
  });

  const invalid = parsed.find(({ value }) => value === undefined);
  if (invalid !== undefined) {
    return { ok: false, error: `Choice ${invalid.index + 1}: enter a valid number.` };
  }

  const seenValues = new Set<number>();
  for (const row of parsed) {
    const value = row.value as number;
    if (seenValues.has(value)) {
      return { ok: false, error: `Choice ${row.index + 1} repeats value ${String(value)}.` };
    }
    seenValues.add(value);
  }

  const seenAliases = new Set<string>();
  for (const row of parsed) {
    if (row.alias === '') continue;
    const normalized = row.alias.toLocaleLowerCase();
    if (seenAliases.has(normalized)) {
      return { ok: false, error: `Choice ${row.index + 1} repeats alias “${row.alias}”.` };
    }
    seenAliases.add(normalized);
  }

  return {
    ok: true,
    values: parsed.map(({ value }) => value as number),
    labels: Object.fromEntries(
      parsed.flatMap(({ value, alias }) => (alias === '' ? [] : [[String(value), alias]])),
    ),
  };
}

/** Legacy compact spelling retained for compatibility; aliases are optional. */
export function formatNumberChoicesInput(field: NumberChoices): string {
  return (field.allowedValues ?? [0, 1])
    .map((value) => {
      const alias = numberFieldValueAlias(field, value);
      return alias === undefined ? String(value) : `${String(value)} = ${alias}`;
    })
    .join(', ');
}

/** Parse the compact spelling while accepting localized digits for the canonical number. */
export function parseNumberChoicesInput(raw: string): ParsedNumberChoices {
  const parts = raw
    .split(/[,،;\n]/u)
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const rows = parts.map((part) => {
    const separator = part.indexOf('=');
    return {
      value: (separator < 0 ? part : part.slice(0, separator)).trim(),
      alias: separator < 0 ? '' : part.slice(separator + 1).trim(),
      hasAliasSeparator: separator >= 0,
    };
  });
  if (rows.length === 0 || rows.some((row) => row.hasAliasSeparator && row.alias === '')) {
    return { ok: false, error: 'Use “number” or “number = alias”, separated by commas.' };
  }
  return validateNumberChoiceRows(rows);
}
