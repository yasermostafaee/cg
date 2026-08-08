# Persian/Arabic-Indic digit input in Runtime numeric fields (R-020)

## Why

With a Persian keyboard active, the Runtime's numeric inputs reject Persian digits (۰–۹):
the browser's `type="number"` inputs silently DROP them before `onChange` ever fires, so
the operator types and nothing appears — silent rejection that reads as a broken input. An
operator on a Persian keyboard should never have to switch layouts to type a number. This
is the Runtime half of the split item; the Designer half is D-130 (filed, not yet
implemented at this writing). R-014 keeps the DISPLAY half (numbers rendered in Persian
digits) and its open questions; this change narrows R-014's PRD text accordingly.

## What Changes

- **One shared numeric-input primitive.** The Runtime had no shared numeric primitive —
  every numeric input was a raw `<input type="number">` (or a bare text input for ports).
  A new `NumericInput` (`apps/runtime/src/renderer/ui/NumericInput.tsx`) is now the one
  numeric primitive, and every numeric site renders it: normalization lives there ONCE,
  not per call site (D-130's recorded primitive-level direction).
- **Digits normalize on input.** `NumericInput` reuses `latinDigits` from
  `@cg/text-shaping` (already a Runtime dependency — read-only reuse, the package is not
  modified): Persian ۰–۹ and Arabic-Indic ٠–٩ map to Latin 0–9, everything else passes
  verbatim. Normalizing in `onChange` covers typing AND paste. The primitive renders
  `type="text"` + `inputMode` because a `type="number"` input drops non-Latin digits
  before script can see them — the resolution to the gotcha above.
- **Persian decimal separator.** `latinDigits` does not cover ٫ (U+066B). The primitive's
  `decimal` mode (used by the Inspector number field and PositionPicker offsets, which
  accept decimal values) additionally normalizes ٫ → "." — locally in the Runtime, not in
  the shared package. Integer-only inputs (ports) leave ٫ untouched for their validation
  to reject honestly.
- **Sites routed through the primitive:** the Inspector number field, PositionPicker
  dx/dy, and the server-settings AMCP/OSC port inputs (whose `/^\d+$/` validation now
  sees Latin digits — the B-077 interaction: a numeric pattern no longer rejects
  Persian-typed digits).
- **Lock PIN: both ends of the comparison normalize.** The PIN is masked text, not a
  NumericInput; digits in it normalize via the same helper at BOTH bridge-call sites —
  StatusBar's engage prompt and LockOverlay's release — so a PIN typed ۱۲۳۴ matches one
  stored as 1234 in either direction. Non-digit PIN characters pass through verbatim.
- **Canonical storage/wire, text verbatim.** Stored and transmitted values stay Latin —
  the AMCP/field-update path already expects ASCII and does not change. Text-type fields
  are untouched: no `latinDigits` on them, input stays verbatim (display text is display
  text — the R-014 boundary).

## Out of scope

- **Persian numeral DISPLAY** — R-014, open questions recorded there.
- **The Designer half** — D-130, on the Designer track.
- **`@cg/text-shaping` changes** — the package is shared with the Designer track and is
  only read here.

## Impact

- **Affected specs:** `runtime-ui` (new requirement).
- **Affected code:** `apps/runtime/src/renderer/ui/NumericInput.tsx` (new),
  `features/inspector/Inspector.tsx` (NumberField), `features/inspector/PositionPicker.tsx`,
  `features/connections/ServerSettingsPanel.tsx`, `features/lock/LockOverlay.tsx`,
  `features/status/StatusBar.tsx`, `tests/numericInput.dom.test.ts` (new),
  `tests/e2e/stage-inspector-edits.spec.ts` (role selector: the number control is a
  textbox now, not a spinbutton).
