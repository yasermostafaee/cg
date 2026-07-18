# Tasks — add-field-validation-presets (D-059)

## 1. Recon

- [x] The raw `pattern` box: `DynamicDataSection.tsx` → `FieldMeta` → `<TextField label="Pattern">`,
      shown for `fieldType === 'text'` (text AND multiline); commits via `setElementFieldMeta`
      (`ElementFieldMetaPatch.pattern`) → `rebuildField` (`state/slices/fields.ts`), where an
      empty/whitespace pattern clears the constraint.
- [x] The Preset-with-custom-escape idiom: `EasingEditor.tsx` (`PRESET_ORDER` + `presetKeyFor`,
      Custom is a no-op) and the pure module `sequence-presets.ts` (+ its unit test) consumed by
      `StyleSection` through `SelectField` — mirrored here.
- [x] `pattern` is a plain string on the schema (`RegexSourceSchema = z.string().refine(compiles)`,
      optional on `text` + `multiline`) → NO schema change. Consumers build it with
      `new RegExp(pattern)` and NO flags (`PreviewFieldForm.validateField`) → `\p{L}` is unusable;
      explicit `\uXXXX` ranges, anchored.

## 2. Implementation

- [x] NEW `features/inspector/pattern-presets.ts` — vetted ANCHORED regexes (Email, Phone, Digits
      only, Letters only, Uppercase code, Time HH:MM, URL) with an example each, the dropdown order
      (None → presets → Custom (advanced)), `patternPresetKeyFor` (stored pattern → key) and
      `patternForPresetKey` (key → pattern; Custom writes nothing). Persian / Arabic-Indic digits
      and Persian letters (incl. ZWNJ) accepted.
- [x] `DynamicDataSection.tsx` — the `Pattern` row becomes `PatternField`: the preset `SelectField` + the "Accepts e.g. …" hint, with Custom revealing the pre-filled raw `TextField`. Local
      Custom-escape flag, re-mounted per element/field (B-009). Same `patch({ pattern })` commit.
- [x] `controls.tsx` — `TextField` gains an optional `ariaLabel` (the raw regex box's accessible
      name); omitted elsewhere, so no existing control changes.

## 3. Tests

- [x] Unit `tests/pattern-presets.test.ts` — every preset compiles, is anchored, accepts its own
      example; the anchors reject substring matches; per-preset accept/near-miss; Persian digits +
      letters; the round trip (preset regex → its key, arbitrary regex → custom, empty → none); None
      clears, Custom writes nothing; the dropdown order is complete.
- [x] Component `tests/field-pattern-presets-inspector.test.ts` — the REAL section against the live
      store: none by default; picking a preset writes its exact regex + hides the raw box + shows the
      example; a preset-equal pattern loads as that preset; a hand-written regex loads as Custom with
      the box populated (value untouched); Custom reveals the pre-filled box and commits an edit;
      None clears; presets apply to a multiline field.
- [x] E2E `tests/e2e/field-validation-presets.spec.ts` — preset → no raw box + example; Custom →
      pre-filled raw box; a hand-written regex round-trips as Custom across a reselect; and the regex
      a preset writes is what the PREVIEW form enforces (bad value → alert, good value → none).
- [x] Existing dynamic-field / inspector tests still green (`inspector-input-resync`,
      `store-dynamic-fields`, `fields-and-bindings`, `preview-field-form`).

## 4. Docs

- [x] PRD `docs/prd/designer.md` D-059 → `[~]` with the branch + change dir.
- [x] Engine doc-sync check: none needed (no structural / contract change — a new leaf control inside
      an existing Inspector section; the inspector engine doc covers how sections are built, not the
      individual controls).

## 5. Gate + ship

- [x] Green gate: `pnpm --filter @cg/designer typecheck lint test build`, then the uncached repo-wide
      `pnpm turbo run typecheck lint test build --force` + `pnpm format:check`.
- [x] `pnpm openspec validate add-field-validation-presets --strict`.
- [ ] Owner verification on the served Designer preview (click path in the report). PAUSED here — no
      commit, no push, no archive until the owner confirms.
