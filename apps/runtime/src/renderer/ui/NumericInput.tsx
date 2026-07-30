import type { InputHTMLAttributes } from 'react';
import { latinDigits } from '@cg/text-shaping';
import { arrowStep, runScrubGesture } from './scrubGesture.js';

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
  /**
   * Opt IN to horizontal drag-to-adjust + arrow-key stepping — the Designer's
   * feel, which the owner asked for on the Runtime's numeric and position fields.
   *
   * Opt-in rather than always-on because this primitive also serves fields that are
   * NOT a continuous quantity — the lock PIN is the clear case: dragging or
   * arrowing a PIN is meaningless, and grabbing digits by accident on a security
   * control is worse than meaningless. A caller says when the value is a magnitude.
   */
  scrub?: { step?: number | undefined; min?: number | undefined; max?: number | undefined };
}

export function NumericInput({
  value,
  onValueChange,
  decimal = false,
  scrub,
  ...rest
}: NumericInputProps): JSX.Element {
  // The gestures operate on a NUMBER while the input is controlled by a STRING (so
  // "-", "1." and "" survive typing). A value that is not yet a number simply has
  // no magnitude to adjust, so both gestures no-op rather than guessing at 0.
  const numeric = scrub === undefined ? null : Number(value);
  const current =
    numeric !== null && value.trim() !== '' && Number.isFinite(numeric) ? numeric : null;
  const emit = (next: number): void => onValueChange(String(next));

  return (
    <input
      {...rest}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={value}
      // `ew-resize` is the affordance: it says "drag me sideways" before the
      // operator tries. Only when scrubbing is actually enabled.
      style={scrub !== undefined ? { cursor: 'ew-resize', ...rest.style } : rest.style}
      onPointerDown={(e) => {
        rest.onPointerDown?.(e);
        if (scrub === undefined || current === null || e.button !== 0) return;
        const el = e.currentTarget;
        // Already editing? Let the click place the caret normally — a scrub would
        // hijack an ordinary text interaction.
        if (document.activeElement === el) return;
        e.preventDefault(); // suppress the focus-on-mousedown so a drag is a drag
        runScrubGesture({
          startX: e.clientX,
          value: current,
          ...scrub,
          onCommit: emit,
          // A press that never travelled was a CLICK: focus for typing, which is
          // what `preventDefault` above would otherwise have swallowed.
          onEnd: (moved) => {
            if (!moved) el.focus();
          },
        });
      }}
      onKeyDown={(e) => {
        rest.onKeyDown?.(e);
        if (scrub === undefined || current === null || e.defaultPrevented) return;
        const next = arrowStep(e, { value: current, ...scrub });
        if (next === null) return;
        // Stop the caret from also jumping to the start/end of the text.
        e.preventDefault();
        emit(next);
      }}
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
