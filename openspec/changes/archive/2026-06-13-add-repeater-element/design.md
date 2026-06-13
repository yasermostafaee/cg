# Design — add-repeater-element

## D1. Schema: a reference + a flow, data on ONE list

`RepeaterElementSchema = ElementBaseSchema.extend({ type: 'repeater',
compositionId: IdSchema (required — the child to stamp),
direction: 'column'|'row' default 'column',
flow: 'rtl'|'ltr' default 'rtl' (row-axis order; ignored for column),
gap: number ≥ 0 default 8, maxItems?: positive int,
items: ListItem[] default [] })` — `items` reuses the OPEN D-028 item shape
(`{ id, …open }`); row keys are the child composition's FIELD IDS. Additive,
no migrations. The data surface at runtime is ONE `list` field bound
`repeater-items` — rows are NOT per-instance namespaced field groups.

## D2. Rows are real scopes — wiring-tree yes, namespace-tree NO

`buildRepeater` registers `{ element, host }` on `scope.repeaters`. The row
builder mirrors `buildComposition`'s inner stage: per row a flow-positioned
cell (`'column'` ⇒ cell width = box width, scale = width/childWidth;
`'row'` ⇒ cell height = box height, scale = height/childHeight; aspect
preserved; zero-resolution guard) containing a FRESH row scope (`newScope`)
built from the child's layers with depth+1 and visited+childId (the
existing cycle/runaway guard renders an empty box if forced). CRITICAL: row
scopes are NOT pushed into `scope.children` — that list feeds the D-025
namespace aggregation (preview form groups, GDD object namespaces) and rows
must never appear there; the repeater keeps its own row registry.
Build-time stamps the AUTHORED items so the editor canvas shows rows
statically with zero runtime.

## D3. The centerpiece: wireScopeSubtree (refactor first, then reuse)

`createRuntime`'s per-scope wiring (ticker/clock/sequence driver
instantiation + the recursive controller-tree build) extracts into
`wireScopeSubtree(scope, path, isRootSubtree) → WiredSubtree
{ node, tickers, clocks, sequences, destroy }`. A `subtrees` set replaces
the global driver arrays; play-resets, pause/resume, settle-freeze,
`next()` dispatch, and `remove()` iterate it kind-major in wiring order —
identical observable behavior for the static tree (the refactor lands as
its own commit with the existing suite green and untouched). `destroy()`
is symmetric: controllers first (stop timers/rAF), then drivers,
deregister. The repeater stamps each row through this same factory
(`isRootSubtree: false` — row scopes get plain per-scope semantics: own
content-hold, settle-freeze, no global machine hooks) and attaches the
row's `ScopeNode` under the hosting scope's node so every cascade reaches
rows exactly like authored children.

## D4. Liveness model B: values live, count stamped

`RepeaterDriver` (start/pause/resume/stop/reset/destroy/setItems; NOT a
content source — no `whenComplete`; an empty list is simply an empty box).

- **Stamp at fresh play:** `reset()` tears down the current row subtrees
  (symmetric `destroy()`) and stamps from the CURRENT effective items —
  the bound list field's effective value when bound (a retained pre-play
  `update()` included; the CasparCG ADD-data → PLAY flow honors any
  count) else the authored items — clamped by `maxItems`. Each row: build
  cell + row scope, apply the row's values, wire the subtree, attach to
  the cascade. Rows then enter the run like authored children (the
  hosting `play()` cascade reaches them).
- **Live values mid-hold:** `setItems()` applies VALUES positionally into
  the stamped rows (row i ← item i) — reordering values is live by
  construction. A SHORTER list hides the surplus row cells
  (`display: none` only — scopes/controllers persist and keep their
  lifecycle state); a later regrowth within the stamped count re-shows
  them with the new values. A LONGER list cannot grow mid-hold (no
  mid-run scope creation in v1) — it takes effect at the next fresh play.
- **Value routing:** row values reuse the existing per-scope apply path
  (`applyDocScope` semantics for a namespaced child): the item's keys
  (minus `id`) are the child's field values for that row's scope.

## D5. GDD: the item schema comes from the child

When a `list` field is bound `repeater-items`, `buildGddSchema` derives the
items' object schema from the referenced child composition's OWN fields —
each child field maps through the existing `gddPropertyFor` (gddType,
min/max/pattern/default) and the child's `required` fields become the item
schema's `required` — instead of the generic `{id, text}` shape. `id` stays
declared (the reconcile key). Non-repeater lists are unchanged. The same
derivation shows in the designer preflight surface. This extends the
LIVING owner of the GDD list rule — `designer-ticker-element` → "Export
parity and GDD representation" — via `## MODIFIED Requirements` (reported:
that capability owns "The GDD SHALL represent a `list` field as a typed
array property…"; no separate dynamic-fields/export capability exists).

## D6. Designer: guard-gated insertion, columned editor

The Repeater tool inserts ONLY when at least one valid composition exists —
valid = `canNestCompositionInActive(id)` (the existing BFS cycle guard) and
not the active composition itself; the first valid is preselected;
otherwise no insert and a `showNotice` toast explains why.
`defaultRepeater` (≈480×360, column, gap 8, flow rtl) seeds 3 rows
(`row-1..3`) keyed by the chosen child's field ids with their default
values (a field-less child seeds 3 bare `{id}` rows). `RepeaterSections`:
Composition select (options = valid compositions via the same guard),
Direction, Flow (shown for `'row'`), Gap, Max items, items editor.
`ListItemsEditor` generalizes with `columns: {key, label}[]` (the
dwell-column precedent): one input per column, preserving unknown fields;
the column for a child `number` field uses a number input where the editor
already distinguishes, else text. BOTH the inspector and the preview field
form pass columns (the preview modal derives a per-field columns map from
`repeater-items` bindings + the child's fields, like the D-029
dwellFieldIds threading). `PlayoutSection` unchanged (a repeater is NOT a
content source).

## D7. Out of scope (v1)

- **Live count changes mid-hold + per-row enter/exit transitions** — the
  model-A follow-up (animated row add/remove).
- **Per-row stagger** — D-032's temporal offsets.
- **Grid layout** (one axis only).
- **Explicit `itemSize` override** (cells always fit the cross axis).
- **Guaranteed row drill-in** (canvas editing inside a stamped row).
