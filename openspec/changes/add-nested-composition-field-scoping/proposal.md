## Why

Two bugs in the dynamic-fields model once compositions can be nested:

1. **Fields were project-global.** `fields`/`bindings` lived only on the root
   `Scene`, so every composition's data-key list (inspector + preview) showed
   *all* fields across the whole project, not the open composition's.
2. **Nested children's values never updated.** The runtime only put top-level
   elements in its binding map and applied a flat `{fieldId: value}` payload, so a
   nested child composition's fields couldn't be set; and the same child instanced
   twice had no way to be set independently.

We adopt **Option C — instance-scoped namespacing via nested objects.**

## What Changes

- **Per-composition fields (schema):** add `fields`/`bindings` to `Composition`
  (each composition owns its own; flat + unique within it). Legacy projects with
  global root fields are migrated into the owning composition on load
  (`migrateGlobalFieldsToCompositions`). Standalone compositions stay flat — no
  namespace, no behavioral change.
- **Per-composition scope (Bug 1):** the inspector + preview show ONLY the open
  composition's own fields, PLUS its nested children's fields aggregated under each
  instance's namespace (`aggregateCompositionFields`).
- **Instance-scoped namespacing:** a nested child instance exposes its fields in the
  parent under the instance's user-editable, parent-unique **name** as a NESTED
  OBJECT (`{ home: { teamName, score }, away: { … } }`). The same child instanced
  twice → two namespaces, independently settable; arbitrary depth nests deeper.
  Instance names are kept unique within a parent (`uniqueInstanceName`).
- **Parent→child update routing (Bug 2):** `buildScene` builds a field-scope tree
  (one scope per instance with its own element map); `applyScopedFieldValues` walks
  the nested value object by namespace so each child copy updates correctly.
  `runtime.update()` deep-merges nested data.
- **GDD + exporter:** the GDD emits nested `type: 'object'` sub-schemas per instance
  namespace; the single-file exporter inlines the composition's own fields/bindings.

## Capabilities

### Modified Capabilities

- `designer-dynamic-fields`: fields become per-composition and, when nested, are
  exposed/edited/exported under each child instance's namespace as nested objects.

## Impact

- **Schema:** `@cg/shared-schema` — `Composition.fields/bindings`;
  `composition-fields.ts` (aggregate, nested defaults, migration, unique names).
- **Runtime:** `@cg/template-runtime` — field-scope tree in `scene-builder`,
  `applyScopedFieldValues` in `bindings`, nested deep-merge in `runtime.update`.
- **GDD:** `@cg/vcg-format` — nested-object schema for namespaces.
- **Designer:** `state/store` (per-comp field ops, migration, instance-name
  uniqueness), `editSceneOf` (surface comp fields/bindings), `FieldsPanel`
  (own + namespaced groups), `PreviewModal`/`PreviewFieldForm` (nested grouped form
  + nested values), `InspectorPanel` (FIELDS shown when nested instances exist).
- **Tests:** schema aggregate/defaults/migration/naming; runtime nested routing
  (same child twice, partial update, default fallback); designer per-comp scope +
  instance-name uniqueness.
- **No `schemaVersion` bump** (additive optional fields); standalone comps unchanged.
