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
      `pattern`/`minLength`/`maxLength`; seed from defaults. Lives only in the
      Preview modal (5.4), driven by a `dispatch` it receives.
- [x] 5.2 On a value change call `dispatch.update(values)`; **Play / Stop / Next /
      Reset** controls call `dispatch.{play,stop,next,reset}` — the modal posts
      these straight to its dedicated iframe.
- [x] 5.3 `platform/preview.ts` — handle `action: 'next'` (→ `window.next()`) and
      `action: 'reset'` (replace-mode update → re-seeds every field to its default)
- [x] 5.4 Present the preview in a **modal** opened by a "PREVIEW" button in
      `features/shell/TopToolbar.tsx` (`PreviewModal.tsx`): a dedicated preview
      iframe (the `platform/preview.ts` harness) on a checkerboard at the
      composition resolution scaled-to-fit, the `PreviewFieldForm`, and
      Play/Stop/Next/Reset; built + seeded on open, stopped on close (the iframe
      unmounts with the modal — close via ✕ / ESC / backdrop). Reuses the shared
      `shell/Modal` dialog (focus trap / portal); `@cg/ui` exposes no dialog. The
      form is no longer docked in the inspector.

## 6. Tests + gate

- [x] 6.1 `shared-schema` — new constraints validate; bad pattern/length rejected
- [x] 6.2 `template-runtime` — update→play retained; play merges; XML parses;
      unknown keys ignored; `maxLength` truncates
- [x] 6.3 `apps/designer` store test — `setElementDataKey` creates / renames /
      removes field+binding; duplicate key rejected (+ `setElementFieldMeta`
      variant switch)
- [x] 6.6 One binding per field — `FieldsPanel` "Bind from canvas" is disabled
      (shared `Button` `disabled` state) while the field already has a binding;
      removing the binding (`×`) re-enables it (`canBindFromCanvas` predicate).
      Duplicate field→target binds are also dropped in `store.addBinding` (B-008).
      Test: `canBindFromCanvas` — enabled at zero bindings, disabled once bound,
      re-enabled after removal, unaffected by other fields' bindings.
- [x] 6.4 Green gate: typecheck + lint + test + build for `@cg/shared-schema`,
      `@cg/template-runtime`, `@cg/designer`
- [x] 6.5 `pnpm openspec validate add-dynamic-text-fields --strict`
