import type { InputHTMLAttributes } from 'react';
import { latinDigits } from '@cg/text-shaping';

/**
 * R-020 — Persian/Arabic-Indic digit input for the Runtime's numeric fields.
 *
 * The one shared numeric-input primitive: every Runtime numeric input renders
 * THIS component, so digit normalization lives here once, not per call site.
 * `latinDigits` (from @cg/text-shaping, same helper the render path uses) maps
 * Persian ۰–۹ and Arabic-Indic ٠–٩ to Latin and preserves everything else, so
 * the value a caller receives — and therefore everything stored or put on the
 * wire — is always canonical Latin digits.
 *
 * Deliberately `type="text"` + `inputMode`: a browser `type="number"` input
 * SILENTLY DROPS non-Latin digits before `onChange` ever fires, so a
 * Persian-typed digit would never arrive to be normalized — the operator sees
 * nothing happen. A text input with a numeric input-mode keeps the on-screen
 * keyboard numeric while letting every digit reach us. Normalizing in
 * `onChange` covers typing AND paste (both fire it with the full value).
 */

/**
 * Normalize one raw input value: Persian/Arabic-Indic digits → Latin; with
 * `decimal`, the Persian decimal separator ٫ (U+066B, which `latinDigits`
 * does not cover) → ".". Exported for the non-NumericInput digit sites (the
 * lock PIN) and for tests.
 */
export function normalizeDigits(raw: string, opts: { decimal?: boolean } = {}): string {
  const latin = latinDigits(raw);
  return opts.decimal === true ? latin.replace(/٫/g, '.') : latin;
}

interface NumericInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'inputMode' | 'value' | 'onChange'
> {
  value: string;
  /** Receives the NORMALIZED value (canonical Latin digits) on every change. */
  onValueChange: (next: string) => void;
  /** Accept a decimal value: ٫ also normalizes to "." and the OSK offers one. */
  decimal?: boolean;
}

export function NumericInput({
  value,
  onValueChange,
  decimal = false,
  ...rest
}: NumericInputProps): JSX.Element {
  return (
    <input
      {...rest}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={value}
      onChange={(e) => {
        const el = e.currentTarget;
        const raw = el.value;
        const normalized = normalizeDigits(raw, { decimal });
        if (normalized !== raw) {
          // The mapping is 1:1 per character, so the caret index survives the
          // swap — write the DOM now and restore it, or React's controlled
          // re-render would throw the caret to the end on a mid-string edit.
          const caret = el.selectionStart;
          el.value = normalized;
          if (caret !== null) el.setSelectionRange(caret, caret);
        }
        onValueChange(normalized);
      }}
    />
  );
}
