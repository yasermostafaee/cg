## 1. Schema

- [x] 1.1 Add optional `minLength` (int ≥0) and `pattern` (string) to
      `TextFieldSchema` and `MultilineFieldSchema` in
      `packages/shared-schema/src/fields.ts` (additive; no `schemaVersion` bump)
      — `pattern` validated to compile as a `RegExp`.

## 2. Runtime correctness

- [ ] 2.1 `runtime.ts` `play()` merges instead of replacing:
      `currentValues = { ...currentValues, ...data }` (update-before-play retained)
- [ ] 2.2 `adapters/caspar-globals.ts` `parsePayload` — implement the CasparCG
      legacy XML parser (`componentData id` / `data id="text" value`) → `{key:value}`;
      keep JSON canonical; accept JSON string or parsed object; ignore unknown keys
- [ ] 2.3 `bindings.ts`/`transforms.ts` — truncate text targets to the field's
      `maxLength` before applying (code-point safe; ZWNJ preserved)

## 3. Store (convenience layer)

- [x] 3.1 `setElementDataKey(elementId, key)` — validate uniqueness across
      `scene.fields` (project-global — `editSceneOf` keeps one `fields[]` for the
      whole project, so this is project-wide); create / rename / remove the
      backing field + text binding accordingly. Returns `false` on a duplicate.
- [x] 3.2 `setElementFieldMeta(elementId, patch)` — patch
      title/description/required/fieldType/multiline/minLength/maxLength/pattern/default
      (variant switch text ↔ multiline ↔ number handled in `rebuildField`)

## 4. Inspector UI

- [x] 4.1 `features/inspector/DynamicDataSection.tsx` — Data key, Title,
      Description, Required, Field type (text|number), Multiline, Min/Max length,
      Pattern, Default; live key-uniqueness warning; empty key = static
- [x] 4.2 Wire it into `ElementInspector` (only for `type === 'text'`); leave the
      existing "Key" (= element name) row untouched

## 5. Preview form

- [ ] 5.1 `features/fields/PreviewFieldForm.tsx` — inputs generated from
      `scene.fields`; validate `pattern`/`minLength`/`maxLength`; seed from defaults
- [ ] 5.2 On change call `bridge.preview.update(values)`; add **Play / Stop /
      Next / Reset** controls
- [ ] 5.3 `platform/preview.ts` — handle `action: 'next'` (→ `window.next()`) and
      `action: 'reset'` (re-seed defaults + `update`)

## 6. Tests + gate

- [x] 6.1 `shared-schema` — new constraints validate; bad pattern/length rejected
- [ ] 6.2 `template-runtime` — update→play retained; play merges; XML parses;
      unknown keys ignored; `maxLength` truncates _(Feature 2 — not started)_
- [x] 6.3 `apps/designer` store test — `setElementDataKey` creates / renames /
      removes field+binding; duplicate key rejected (+ `setElementFieldMeta`
      variant switch)
- [~] 6.4 Green gate: typecheck + lint + test + build — **done for
      `@cg/shared-schema` + `@cg/designer`** (Feature 1); `@cg/template-runtime`
      pending Feature 2
- [x] 6.5 `pnpm openspec validate add-dynamic-text-fields --strict`
