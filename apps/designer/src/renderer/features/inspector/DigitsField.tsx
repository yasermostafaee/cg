import type { FieldDigits } from '@cg/shared-schema';
import { SelectField } from './controls.js';

/**
 * `TEXT-DIGITS-01` — THE owner's words for each Digits choice, in one place. The stored values stay
 * what old documents read (`as-typed` is shown as **Keyboard**: a typed digit follows the keyboard
 * language active as it is typed).
 */
const DIGITS_WORDS: Readonly<Record<FieldDigits, string>> = {
  'as-typed': 'Keyboard',
  persian: 'Persian',
  latin: 'Latin',
  'arabic-indic': 'Arabic-Indic',
};

/** The owner's word for a Digits choice — for a surface that renders its own `<Select>` row. */
export function digitsWord(digits: FieldDigits): string {
  return DIGITS_WORDS[digits];
}

/**
 * 🔴 `TEXT-DIGITS-01` — **THE ONE DIGITS CONTROL**, wherever digits are drawn: the clock's own
 * `SelectField` under its label `digits`, with the owner's words — Keyboard · Persian · Latin ·
 * Arabic-Indic, or without Keyboard for a number, a clock or a countdown. Every Digits setting in the
 * Designer is this component; none spells the words itself.
 */
export function DigitsField<T extends FieldDigits>({
  value,
  options,
  onCommit,
}: {
  value: T;
  /** The schema's own list — `FieldDigitsSchema.options` or `NumberFieldDigitsSchema.options`. */
  options: readonly T[];
  onCommit: (digits: T) => void;
}): JSX.Element {
  return (
    <SelectField
      label="digits"
      value={value}
      options={options}
      labels={options.map(digitsWord)}
      onCommit={onCommit}
    />
  );
}
