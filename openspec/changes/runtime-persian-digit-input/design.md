# Design — Persian/Arabic-Indic digit input (R-020)

## D1 — Primitive-level normalization, not per-field patches

D-130's recorded direction, honored Runtime-side: the Runtime had no shared numeric
primitive (raw `<input type="number">` at each site), so one small shared component —
`NumericInput` in `apps/runtime/src/renderer/ui/` — was introduced and the sites routed
through it. Normalization is implemented ONCE; a future numeric input gets it by using the
primitive. The sole numeric surface that is NOT a NumericInput is the lock PIN (masked
password input); it shares the primitive's exported `normalizeDigits` helper instead.

## D2 — `latinDigits` reuse, read-only

`@cg/text-shaping` is already a Runtime dependency and its `latinDigits` is the canonical
Persian/Arabic-Indic → Latin map (pure, preserves all other characters — the same helper
the render path uses). It is imported, never modified: the package is shared with the
Designer track (D-130), and writing there from this track would be a cross-track
collision. A second local copy of the digit map would also be exactly the "re-derived
predicate" hazard the repo's golden rules name.

## D3 — The `type="number"` resolution

A browser number input silently drops non-Latin digits BEFORE `onChange` fires — there is
nothing to normalize because the event never arrives with them. `NumericInput` therefore
renders `type="text"` with `inputMode="numeric"` (integer sites) or `"decimal"` (decimal
sites), and normalizes in `onChange`, which fires for typing AND paste with the input's
full value. The digit mapping is 1:1 per character, so the component restores the caret
index after a normalizing swap (otherwise React's controlled re-render throws the caret
to the end on a mid-string edit).

Consequences, judged acceptable:

- The number control's ARIA role changes spinbutton → textbox (the existing E2E selector
  was updated — a ripple, not new coverage).
- The Inspector number field no longer renders `step`/`min`/`max`: on `type="number"`
  they only drove the native spinner and `:invalid` styling — the staged value was never
  clamped by them, so no commit behavior changed.

## D4 — The ٫ decision (Persian decimal separator, U+066B)

`latinDigits` does not handle ٫. The Runtime is NOT integer-only — the Inspector number
field and the PositionPicker offsets accept decimal values (their commit parse is
`Number(raw)`, which accepts fractions) — so ٫ → "." is normalized, locally in the
Runtime primitive behind its `decimal` option, not in the shared package. Integer-only
inputs (the AMCP/OSC ports) do not opt in: a ٫ typed there stays put and the port rule
rejects it honestly rather than silently inventing a decimal point.

## D5 — The PIN: normalize both ends of one comparison

The PIN comparison is a hash equality in the platform (engage stores `sha256(pin)`,
release compares). Normalizing only one side would MANUFACTURE mismatches, so digits are
normalized at both renderer call sites — StatusBar before `lock.engage`, LockOverlay
before `onRelease` — and nowhere else (the generic `usePrompt` dialog stays verbatim: it
serves text prompts too). A PIN engaged as ۱۲۳۴ releases with 1234 and vice versa;
non-digit characters pass through verbatim, so a mixed-text PIN is unaffected.

## D6 — B-077 interaction

The only pattern-shaped validation on a Runtime numeric input today is the ports'
`/^\d+$/`. Normalization runs in the input's own `onChange` — upstream of any
validation — so a numeric pattern never sees Persian digits at all. That is the
acceptance's intent (match the Designer's `pattern-presets.ts` DIGIT-class inclusion):
whenever B-077 pattern validation lands Runtime-side, patterns validate the canonical
value.

## D7 — No new E2E

The behavior is fully exercised in jsdom unit tests (primitive + every routed site +
both PIN ends). The one E2E touch is the ripple in D3's selector. No new E2E spec is
added, so this item closes on the local gate without owing a Linux `gate:e2e` run.
