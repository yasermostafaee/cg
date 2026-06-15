## 1. Schema (@cg/shared-schema)

- [x] 1.1 Add optional `fields`/`bindings` to `CompositionSchema` (per-composition;
      absent ⇒ none). No `schemaVersion` bump.
- [x] 1.2 `composition-fields.ts` — `aggregateCompositionFields` (own + nested
      namespaces), `defaultNestedValues`, `duplicateFieldKeys`, `uniqueInstanceName`,
      `compositionInstancesOf`, `migrateGlobalFieldsToCompositions`,
      `NestedFieldValues`.
- [x] 1.3 Tests — aggregate (standalone/parent/twice/deep), defaults, migration,
      unique names.

## 2. Runtime (@cg/template-runtime)

- [x] 2.1 `scene-builder` — build a field-scope tree (one scope per instance, own
      element map + child scopes by namespace); return `scopeTree`.
- [x] 2.2 `bindings` — `applyScopedFieldValues` walks the nested value object by
      namespace, applying each doc's bindings within its scope.
- [x] 2.3 `runtime` — nested `currentValues`; `update()`/`play()` deep-merge nested
      data; apply via the scope tree.
- [x] 2.4 Test — same child instanced twice updates independently; partial update;
      missing namespace falls back to defaults.

## 3. GDD + export (@cg/vcg-format, designer)

- [x] 3.1 `gdd` — emit nested `type: 'object'` sub-schemas per instance namespace
      via the aggregate.
- [x] 3.2 Exporter inlines the composition's own fields/bindings (via `editSceneOf`).

## 4. Designer (@cg/designer)

- [x] 4.1 `editSceneOf` surfaces the active composition's fields/bindings; field
      ops (`addField`/`updateField`/`removeField`/`addBinding`/`removeBindingAt`/
      `setElementDataKey`/`setElementFieldMeta`/`removeElement` cascade) target the
      active composition.
- [x] 4.2 Migration on load (`ensureCompositions` → `migrateGlobalFieldsToCompositions`).
- [x] 4.3 Instance-name uniqueness on add (`addCompositionInstance`) and rename
      (`updateElement`).
- [x] 4.4 `FieldsPanel` shows own fields + namespaced nested groups; `InspectorPanel`
      shows FIELDS when nested instances exist; `PreviewModal`/`PreviewFieldForm`
      build the namespaced (nested) form, hold nested values, and push nested objects.
- [x] 4.5 Tests — per-composition scope; instance-name uniqueness; existing
      dynamic-field tests updated to the per-comp model.

## 5. Gate

- [x] 5.1 Green gate: typecheck + lint + test + build for `@cg/shared-schema`,
      `@cg/template-runtime`, `@cg/vcg-format`, `@cg/designer`.
- [x] 5.2 `pnpm openspec validate add-nested-composition-field-scoping --strict`.
