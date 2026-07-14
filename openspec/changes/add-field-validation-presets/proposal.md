# Friendly validation presets for dynamic text fields (D-059)

## Why

A text/multiline dynamic field's `pattern` (D-018) is a RAW REGEX SOURCE box in the Inspector's
"Dynamic / Data" section. That is developer-facing: a broadcast designer doesn't write regex, so in
practice the constraint goes unused — the one control that could stop an operator sending a
malformed email / phone / time into a live graphic is the one control nobody touches.

The common shapes are few and knowable. Numeric range, constrained choice, and length are ALREADY
covered by the `number` / `select` / `boolean` field types plus `minLength` / `maxLength`, so the
gap is only FREE-TEXT shapes: email, phone, digits, letters, uppercase code, time, URL.

## What Changes

- **The `pattern` row becomes a named-preset select** over the SAME stored regex — None, Email,
  Phone, Digits only, Letters only, Uppercase code, Time (HH:MM), URL, and **Custom (advanced)**.
  Picking a preset writes its vetted regex SOURCE through the existing `setElementFieldMeta`
  `pattern` patch; picking None clears it. A short "Accepts e.g. …" example is shown under the
  select so the shape is legible without reading regex.
- **Every preset regex is ANCHORED (`^…$`)**. The consumers test with `new RegExp(src).test(value)`,
  which is a SUBSTRING match — an unanchored `[0-9]+` would accept "abc1abc". They also build the
  regex with NO flags, so the presets use explicit `\uXXXX` ranges, never `\p{L}` (which needs the
  `u` flag and would silently match a literal "p"). Digits/letters accept Persian and Arabic-Indic
  forms (۱۴۰۳, می‌رود) alongside Latin — Persian values are first-class here.
- **Custom (advanced) is the escape hatch**: it reveals today's raw regex box, pre-filled with the
  current pattern, so every regex stays authorable. It is a DISPLAY state, not a stored value (the
  EasingEditor / sequence-presets idiom): a stored pattern equal to a preset's regex shows that
  preset, an empty pattern shows None, anything else shows Custom — so **existing hand-written
  patterns load unchanged**.
- **UI-ONLY and non-breaking**: no schema, runtime, exporter, or `.vcg` change. The value written to
  `pattern` is the same kind of string it has always been (`RegexSourceSchema`), so the preview
  form's and the runtime's validation enforce a preset exactly as they enforce a hand-written regex.

## Capabilities

- **`designer-dynamic-fields`** (ADDED requirement): "Validation presets for a text field's
  pattern" — the preset select over `pattern`, anchored vetted regexes, the Custom escape, and the
  stored-pattern → preset round trip.

## Impact

- `apps/designer/src/renderer/features/inspector/pattern-presets.ts` — NEW pure module (the vetted
  regexes, the dropdown order, `patternPresetKeyFor` / `patternForPresetKey`).
- `apps/designer/src/renderer/features/inspector/DynamicDataSection.tsx` — the `Pattern` row becomes
  `PatternField` (preset select + Custom escape); no change to how it commits.
- `apps/designer/src/renderer/features/inspector/controls.tsx` — `TextField` gains an optional
  `ariaLabel` (the raw regex box needs an accessible name distinct from its "Regex" row label).
- Tests: NEW unit `apps/designer/tests/pattern-presets.test.ts` (the regexes: anchored, compiling,
  accepting their own example, Persian digits/letters, near-miss rejection, the round trip) and NEW
  component `apps/designer/tests/field-pattern-presets-inspector.test.ts` (the real section drives
  the store); NEW E2E `apps/designer/tests/e2e/field-validation-presets.spec.ts` (preset → hidden
  raw box; Custom → pre-filled raw box; a preset's regex is what the preview form enforces).
- Docs: PRD `docs/prd/designer.md` D-059. No engine doc-sync (no structural or contract change — a
  new leaf control inside an existing Inspector section).

## Notes / non-goals

- A pattern on a MULTILINE field still applies to the whole value (no `m` flag) — unchanged from
  today, and the presets are single-line shapes by nature.
- The preview form's mismatch message still quotes the raw regex (`Doesn't match ^…$`). Making the
  operator-facing message name the preset instead is a separate, runtime-side concern.
