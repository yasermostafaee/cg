## 1. Schema

- [x] 1.1 Add optional `minLength` (int ≥0) and `pattern` (string) to
      `TextFieldSchema` and `MultilineFieldSchema` in
      `packages/shared-schema/src/fields.ts` (additive; no `schemaVersion` bump)
      — `pattern` validated to compile as a `RegExp`.

## 2. Runtime correctness

- [x] 2.1 `runtime.ts` `play()` merges instead of replacing:
      `currentValues = { ...currentValues, ...data }` (update-before-play retained)
- [x] 2.2 `adapters/caspar-globals.ts` `parsePayload` — implement the CasparCG
      legacy XML parser (`componentData id` / `data id="text" value`) → `{key:value}`;
      keep JSON canonical; accept JSON string or parsed object; ignore unknown keys
- [x] 2.3 `bindings.ts` — truncate text targets to the field's `maxLength` before
      applying (code-point safe; surrogate pairs / ZWNJ preserved)

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

- [x] 5.1 `features/fields/PreviewFieldForm.tsx` — inputs generated from
      `scene.fields` (text/multiline/number/color/boolean/select/image); validate
      `pattern`/`minLength`/`maxLength`; seed from defaults. Mounted in the scene
      inspector; the canvas iframe (D-011 checkerboard, stage scaled to the
      composition resolution) is the preview surface.
- [x] 5.2 On change call `window.cg.preview.update(values)`; **Play / Stop /
      Next / Reset** controls via new `preview.play/stop/next/reset` bridge methods
- [x] 5.3 `platform/preview.ts` — handle `action: 'next'` (→ `window.next()`) and
      `action: 'reset'` (replace-mode update → re-seeds every field to its default)

## 6. Tests + gate

- [x] 6.1 `shared-schema` — new constraints validate; bad pattern/length rejected
- [x] 6.2 `template-runtime` — update→play retained; play merges; XML parses;
      unknown keys ignored; `maxLength` truncates
- [x] 6.3 `apps/designer` store test — `setElementDataKey` creates / renames /
      removes field+binding; duplicate key rejected (+ `setElementFieldMeta`
      variant switch)
- [x] 6.4 Green gate: typecheck + lint + test + build for `@cg/shared-schema`,
      `@cg/template-runtime`, `@cg/designer`
- [x] 6.5 `pnpm openspec validate add-dynamic-text-fields --strict`
