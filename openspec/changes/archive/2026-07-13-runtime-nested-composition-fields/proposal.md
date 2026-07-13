# Nested-composition fields reach the operator Inspector (B-067)

## Why

A D-119 starter is **two compositions**: a small graphic composition (the actual
lower-third / title card) nested inside a full-frame 1920×1080 composition that
positions it. The authored fields live on the **nested** comp — that is where the
bound text elements are.

The Runtime builds the operator's field form from the **root** composition's fields
only (`templateDelivery.ts` → `fields: scene.fields ?? []`). For a starter that array
is **empty**: on load, `migrateGlobalFieldsToCompositions` relocates each field to the
composition that owns its bound element, and the Designer exports the _entry_ comp
scoped — so the entry comp's own `fields` is `[]` and the real fields sit one level
down.

Result: the operator loads a starter and the Inspector says **"No fields."** The
graphic goes on air with its authored defaults and **cannot be edited on air**. This is
the missing half of D-119 (starters) and R-011 usability — the starters ship, but they
are not operator-editable.

Long-standing, not a regression: the root-only line dates to #236 (B-038 Phase 2), well
before D-119 existed.

## What Changes

The nested field's **address already exists and is canonical** — the composition
instance's `name` namespace, as a nested value object `{ instanceName: { fieldId: … } }`:

- `@cg/vcg-format`'s GDD exporter already advertises exactly that shape
  (`gdd.ts` emits a nested `type: 'object'` property per group).
- `@cg/template-runtime` already **resolves** it at render (`bindings.ts` reads
  `values[child.name]`), and `window.update` already `JSON.parse`s a nested payload.
- The Designer's preview already drives nested values end-to-end.

So **nothing about field identity is invented, and the AMCP line is untouched** — the
bridge serializes with plain `JSON.stringify`, which is depth-transparent. The bug is
that the Runtime's own plumbing cannot _carry_ the address the rest of the system
already speaks. Five coordinated edits:

1. **Aggregate at import** — `templateDelivery` calls the EXISTING collector
   `aggregateCompositionFields(scene, scene)` (the same one the GDD exporter uses)
   instead of reading root `fields`. No new collector.
2. **`TemplateInfo` carries the groups** — additive: `fields` (the comp's own flat
   fields) is unchanged; a new optional `groups` carries the nested namespaces.
3. **`FieldValuesSchema` becomes recursive** — the one real blocker. It is a flat
   `z.record(string, FieldValue)` today, so a nested payload is **rejected by Zod at the
   IPC boundary** (it gates `stack.load`, `stack.update`, `Intent`, `StackItemState`, the
   journal). Widened to the already-declared `NestedFieldValues` shape. A **superset** —
   every existing flat payload still validates unchanged.
4. **The Inspector renders the group tree** — recursing `groups` into labelled sections,
   mirroring the Designer's existing preview form. Drafts become **path**-addressed.
5. **Defaults seed nested** — `LibraryPanel` seeds with the existing
   `defaultNestedValues(aggregate)`.

## Non-goals / explicitly unchanged

- **No AMCP/wire change.** `CommandBuilder.serialize()` stays `JSON.stringify`; ADR-0006
  escaping is untouched. The nested object rides the existing `CG ADD` / `CG UPDATE` data
  argument as-is.
- **No Reconciler change.** The Inspector applies the **complete** field set
  (`{...applied, ...drafts}`), so whole-namespace objects arrive intact and the existing
  shallow top-level merge stays correct. B-044 and reconnect-reconciliation are untouched.
- **No new field identity.** Same instance-name namespace the GDD and the renderer already
  use; same-name collisions across comps are already prevented by the parent-unique `name`.
- R-003 staged edits, B-070's update producer-state rule, B-072's position read-back, R-011
  set-position and the B-064 serve contract are all unchanged — nested fields commit through
  the SAME Update path.

## Capabilities

- `runtime-template-library` — MODIFIED: import aggregates the full field closure; the
  Inspector renders and edits nested-composition fields.

## Impact

- `@cg/shared-schema` — recursive `FieldValuesSchema`; Zod schemas for the existing
  `AggregatedFields` / `CompositionFieldGroup` types.
- `@cg/shared-ipc` — `TemplateInfo.groups` (additive).
- `apps/runtime` — `templateDelivery`, `Inspector`, `draftStore` (path-addressed),
  `LibraryPanel`.
- `tools/caspar-bridge`, `tools/amcp-mock`, `@cg/template-runtime` — **no change**
  (all three are already shape-transparent / nested-aware).
- B-067 → `[x]` on archive, with a live-confirmation checklist pending hardware.
