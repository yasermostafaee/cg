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
  /**
   * 🔴 `SETTINGS-MATCH-02` §10.3 — **DIGITS ONLY: keep `0-9`, drop everything else.**
   *
   * ── WHY IT IS OPT-IN RATHER THAN THIS PRIMITIVE'S DEFAULT ───────────────────
   *
   * Normalising Persian digits is right for every numeric field and always has been, which is
   * why it is unconditional above. FILTERING is not: this component also serves values that
   * legitimately hold a character that is not a digit — a position offset can be negative
   * (`-`), a `decimal` field carries a `.`, and both are mid-typing states (`-`, `1.`) that a
   * filter would eat as the operator typed them.
   *
   * So the fields whose contract is a WHOLE NUMBER say so — the ports, a device index, a route
   * channel, a layer — and nothing else changes. `fieldValue.ts` carries the contract table
   * that decides which ones those are.
   *
   * ⚠ Applied to the VALUE, in `onChange`, never to the keystroke: `preventDefault` on keydown
   * would break paste, Ctrl+A/C/V, the arrows, Home/End and undo — and paste is the path that
   * actually carries `port 5250 (AMCP)` into a field.
   */
  allow?: 'digits';
}

export function NumericInput({
  value,
  onValueChange,
  decimal = false,
  scrub,
  allow,
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
        /*
          §10.3 — normalise FIRST, then filter. The order is the whole of §10.2: a Persian
          `۵` has to become `5` before anything asks whether it is a digit, or the operator's
          own keyboard produces a field he cannot type into.
        */
        const next = allow === 'digits' ? normalized.replace(/[^0-9]/g, '') : normalized;
        if (next !== raw) {
          /*
            Normalising is 1:1 per character, so the caret index survives it — write the DOM
            now and restore it, or React's controlled re-render would throw the caret to the
            end on a mid-string edit.

            ⚠ FILTERING is not 1:1: dropping a character means everything after it moves left
            by one, so the caret is walked back by however many characters were removed BEFORE
            it. Without that, typing a letter in the middle of `5250` left the caret one place
            to the right of where the operator was working.
          */
          const caret = el.selectionStart;
          el.value = next;
          if (caret !== null) {
            const removedBefore = raw.slice(0, caret).length - next.slice(0, caret).length;
            const dropped =
              allow === 'digits'
                ? normalizeDigits(raw.slice(0, caret), { decimal }).replace(/[^0-9]/g, '').length
                : caret - removedBefore;
            const at = Math.max(0, Math.min(next.length, allow === 'digits' ? dropped : caret));
            el.setSelectionRange(at, at);
          }
        }
        onValueChange(next);
      }}
    />
  );
}
