# Add Repeater / Data-Driven Layout Element (D-030)

## Why

Tabular graphics — leaderboards, lineups, results tables — today need manual
duplication of elements per row. The repeater is the scalable primitive: one
nested child-composition instance PER ROW of a data list, laid out
automatically. The instancing, field-scoping, and lifecycle-cascade
groundwork (D-025/D-026) plus the open `list` item shape and structured
bindings (D-028/D-029) were built for exactly this composition; the repeater
is their payoff.

## What Changes

- **Schema (`@cg/shared-schema`):** new `RepeaterElement`
  (`type: 'repeater'`): required `compositionId` (the child to stamp),
  `direction: 'column' | 'row'` (default `'column'`),
  `flow: 'rtl' | 'ltr'` (default `'rtl'`; row-axis order, ignored for
  column), `gap` (default 8), optional `maxItems`, and
  `items: ListItem[]` (default `[]` — the open D-028 item shape; row keys
  are the child composition's field ids). Added to the element unions;
  additive, no migrations. New binding target `repeater-items
{ elementId }`.
- **Runtime (`@cg/template-runtime`):**
  - **The centerpiece refactor (lands first, behavior-preserving):**
    `createRuntime`'s inline per-scope wiring (driver instantiation +
    `buildScopeController`) extracts into a reusable
    `wireScopeSubtree(scope, path, isRootSubtree) → WiredSubtree
{ node, drivers…, destroy }` with symmetric teardown; a `subtrees` set
    replaces the global driver arrays and every runtime cascade iterates
    it. The existing suite pins the static tree's behavior.
  - `buildRepeater` in `scene-builder.ts`: the clipped outer box on
    `scope.repeaters` (NOT `scope.children` — wiring-tree yes,
    namespace-tree no: rows never join the D-025 field aggregation/GDD
    namespaces) + a row builder mirroring `buildComposition`'s inner stage
    (flow-positioned cell; `'column'` ⇒ width-fit / `'row'` ⇒ height-fit,
    aspect preserved, zero-resolution guard; a fresh row scope from the
    child's layers with depth+1/visited+childId). Build-time stamps the
    AUTHORED items so the editor canvas shows rows statically.
  - `repeater-driver.ts`: `RepeaterDriver`
    (start/pause/resume/stop/reset/destroy/setItems; NOT a content source —
    no `whenComplete`). `reset()` at each fresh `play()` tears down the
    current rows and stamps from the CURRENT effective items (the bound
    list's effective value — a retained pre-play `update()` included — else
    the authored items), clamped by `maxItems`, wiring each row subtree
    through `wireScopeSubtree` and attaching it under the hosting scope's
    controller node so rows enter the run like authored children.
    `setItems()` mid-run applies VALUES positionally into stamped rows
    (reorder = live by construction); a SHORTER list hides surplus row
    cells (display only — scopes persist; regrowth within the stamped
    count re-shows them); a LONGER list defers to the next fresh play.
    Per-row value routing reuses the per-scope apply path (the namespaced
    child apply), mapping item keys (minus `id`) onto the row scope's
    child fields.
  - `bindings.ts`: `applyOne` case `repeater-items` → driver `setItems`
    via a `registerRepeaterDriver` registry (the ticker/sequence pattern).
- **GDD (`@cg/vcg-format`):** a `list` field bound `repeater-items` derives
  its ITEM SCHEMA from the referenced child composition's fields (gddType,
  min/max/pattern/default, required) instead of the generic `{id, text}`
  item shape; non-repeater lists unchanged. The same derivation surfaces in
  the designer preflight.
- **Designer:** Repeater tool (`▤`) with an insertion guard (insert only
  when a valid — non-cyclic, not-self — composition exists, preselecting
  the first valid; else no insert + a toast hint); `defaultRepeater`
  (≈480×360, column, gap 8, flow rtl, 3 seeded rows keyed by the chosen
  child's field ids with their defaults); `RepeaterSections` (Composition
  select reusing the existing cycle guard, Direction, Flow for `'row'`,
  Gap, Max items, the items editor); `ListItemsEditor` generalized with a
  `columns: {key, label}[]` prop (the dwell-column precedent) used by BOTH
  the inspector and the preview field form (the bind resolver knows the
  target kind); Data-key flow mirroring ticker/sequence; `PlayoutSection`
  unchanged; timeline icon.
- **Export:** asserted — a repeater scene's single-file export boots clean,
  `update()` with a different row count followed by re-play stamps the new
  count, and the GDD carries the derived item schema.

## Capabilities

### New Capabilities

- `designer-repeater-element`: the repeater end-to-end — schema, flow
  layout and cell scaling, the stamp-at-play / live-values model, rows as
  real nested scopes (lifecycle/cascade/content-hold by reuse), authoring
  UI with the columned items editor and insertion guard, cycle guarding,
  scrub parity, export parity, and the behavior-preserving wiring-refactor
  guarantee.

### Modified Capabilities

- `designer-ticker-element`: the "Export parity and GDD representation"
  requirement (the living owner of the GDD list-field rule from D-028)
  gains the repeater derivation — a list bound `repeater-items` derives its
  item schema from the child composition's fields; other lists keep the
  generic open item shape.

NOT modified: `designer-playout-lifecycle` — stamped rows are ordinary
scopes under its existing per-scope requirements.

## Impact

- **Schema:** `packages/shared-schema/src/elements.ts` (repeater variant +
  unions), `bindings.ts` (`repeater-items`).
- **Runtime:** `packages/template-runtime/src/` — `runtime.ts` (the
  `wireScopeSubtree` refactor + repeater wiring), `scene-builder.ts`
  (`buildRepeater` + row builder + `scope.repeaters`), new
  `repeater-driver.ts`, `bindings.ts` (`repeater-items` case), `types.ts`
  (scope entry), `index.ts`, `README.md` (doc-sync).
- **GDD:** `packages/vcg-format/src/gdd.ts` (derived item schema).
- **Designer:** canvas toolbar/overlay (tool + guard),
  `state/element-defaults.ts`, `features/inspector/StyleSection.tsx`
  (`RepeaterSections`), `features/fields/ListItemsEditor.tsx` (`columns`),
  `PreviewFieldForm/PreviewModal` (columns threading), data-key flow
  (`state/slices/fields.ts`, `DynamicDataSection`, `InspectorPanel`,
  `bind-resolver`), `features/timeline/ElementRow.tsx`.
- **Tests:** runtime units (stamping, layout math, live values, lifecycle
  lockstep, teardown leak-check, refactor pin), vcg-format units (derived
  schema), designer units (defaults/columns/guard), E2E
  `repeater.spec.ts`.
- **Dependencies:** D-025/D-026 (instancing + cascade, merged), D-028
  (list field + open items), D-029 (registry/binding pattern).

## Out of scope (v1)

Live count changes mid-hold + per-row enter/exit transitions (the model-A
follow-up), per-row stagger (D-032), grid layout, explicit `itemSize`
override, guaranteed row drill-in. Recorded in `design.md`.
