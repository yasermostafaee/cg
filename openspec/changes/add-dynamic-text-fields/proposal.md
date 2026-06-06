## Why

The editor renders scenes, but text cannot be driven by data at playout and the
operator can't try field values in the preview. A broadcast CG template's whole
point is data-bindable text. The data model for this already exists
(`@cg/shared-schema` `Scene.fields[]` + `Scene.bindings[]`, applied by
`@cg/template-runtime` `applyFieldValues`) and the starters use it, but there is
no element-level UX to author it, no preview form to edit values, and two runtime
bugs break the CasparCG flow.

## What Changes

- **Convenience layer (no new data model):** a text element becomes dynamic when
  it has a non-empty **Data key**. Setting the key auto-creates/updates a
  scene-level `field` (id = key) and a `text` binding to that element; clearing
  it removes both. `fields[]`+`bindings[]` remain the single source of truth that
  the runtime, preview form, and exporters read. We do **not** store field config
  on the element (that would fork the model and break the runtime/starters).
- **Schema:** add optional `minLength` and `pattern` to `TextFieldSchema` (and
  `MultilineFieldSchema` where sensible). `label` already covers "title";
  `description`/`required`/`default`/`maxLength` already exist. No `schemaVersion`
  bump (additive optional fields).
- **Inspector:** a new **Dynamic / Data** `CollapseSection`, shown only for
  `type === 'text'` elements, editing Data key, Title, Description, Required,
  Field type (text|number), Multiline (mirrors the element), Min/Max length,
  Pattern, Default. Key uniqueness is validated live (warn on duplicate; empty =
  static). The element-name row is relabeled **"Key" → "Name"** (it edits
  `element.name`, the timeline layer label) so it isn't confused with the new
  **Data key**.
- **Preview form:** a data-entry form generated from `scene.fields`
  (text→input, multiline→textarea, number→number, plus color/boolean/select),
  validating against `pattern`/`minLength`/`maxLength`, seeded from each field's
  default. On change it calls the existing `bridge.preview.update(values)`
  (→ `postMessage 'update'` → `window.update` → `applyFieldValues`). Adds `next`
  and `reset` actions to the preview message handler.
- **Runtime correctness (two fixes):**
  1. `runtime.play()` currently does `currentValues = { ...data }` (replace),
     which wipes values set by a prior `update()` — so `CG ADD … "{data}" 1`
     then `CG PLAY` shows blank. Change to **merge**:
     `currentValues = { ...currentValues, ...data }`.
  2. The legacy-XML branch in `caspar-globals.ts` `parsePayload` is a stub
     (returns `{}`). Implement the CasparCG XML format → `{key:value}`. Keep JSON
     canonical; accept a JSON string or an already-parsed object; ignore unknown
     keys.

## Capabilities

### New Capabilities

- `designer-dynamic-fields`: author runtime data fields on text elements, edit
  their values live in the preview, and apply them through the shared runtime
  (order-independent, JSON or legacy-XML payloads).

### Modified Capabilities

<!-- None. -->

## Impact

- **Schema:** `packages/shared-schema/src/fields.ts` — optional `minLength`,
  `pattern` on text/multiline fields.
- **Runtime:** `packages/template-runtime/src/runtime.ts` (`play()` merge);
  `adapters/caspar-globals.ts` (XML parser); `bindings.ts`/`transforms.ts`
  (`maxLength` truncation on text targets).
- **Designer:** `state/store.ts` (`setElementDataKey`, `setElementFieldMeta`,
  field/binding sync + key-uniqueness validation); new
  `features/inspector/DynamicDataSection.tsx` wired into `ElementInspector`;
  new `features/fields/PreviewFieldForm.tsx`; `platform/preview.ts` (+`next`,
  `reset` actions).
- **Unchanged:** `@cg/vcg-format`, existing starter scenes (placeholder bindings
  still work), the Fields panel.
- **Tests:** `shared-schema/tests/fields.test.ts` (new constraints validate);
  `template-runtime` tests (update-before-play retained; play merges; XML parses;
  maxLength truncates); `apps/designer` store test (`setElementDataKey` creates /
  renames / removes field+binding; duplicate key rejected).
- **Dependencies:** none.
