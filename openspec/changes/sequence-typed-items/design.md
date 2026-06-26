# Design — sequence typed items (D-083 Phase 1)

## Schema: a non-breaking discriminated union

`SequenceItemSchema = z.union([SequenceTextItemSchema, SequenceCompositionItemSchema])`.

- TEXT variant: `{ kind: z.literal('text').optional(), id, text, dwellMs? }`.
- COMPOSITION variant: `{ kind: z.literal('composition'), id, compositionId: IdSchema, dwellMs? }`.

Why `z.union` (not `z.discriminatedUnion`): an old item `{ id, text }` carries no
`kind`, and `discriminatedUnion` requires the discriminant present. The text
variant's `kind` is `.optional()` (NOT `.default('text')`) so an old item parses
**unchanged** — no `kind` injected — and the OUTPUT type doesn't force `kind`
onto the ~30 hardcoded `{id,text}` defaults. The variants are unambiguous via the
required `text` vs `compositionId` field; the `kind` literal is belt-and-braces.
This matches the D-039ext / D-040 / D-103 widening precedent: **no
`CURRENT_SCHEMA_VERSION` bump, no migration** (the D-084 standing decision).

The runtime treats an absent `kind` as text (`item.kind === 'composition'` is the
only branch).

## Runtime: the SequenceDriver delegates item rendering + inner-driver lifecycle

The `SequenceDriver` was text-only (item nodes were text spans). It now delegates
node creation to an internal `renderItem(item)`:

- TEXT → the existing text span (no-op lifecycle hooks).
- COMPOSITION → an injected `renderComposition(item)` factory that returns a
  `RenderedSequenceItem = { node, show(), pause(), resume(), hide() }`.

The driver calls these hooks in lockstep with the item's stage lifecycle:
`show()` when the item enters (start its inner drivers — the clock ticks),
`pause()`/`resume()` with the sequence, `hide()` when it leaves a transition /
on `stop()`/`reset()` (tear the inner drivers down). For a text item every hook
is a no-op, so the existing motion/dwell/reconcile path is unchanged.

`renderComposition` (built in `runtime.ts`, where the wiring machinery lives)
reuses the **repeater-row** pattern exactly:

1. `buildSequenceCompositionItem(scene, compositionId, box, guard, doc)` builds
   the referenced composition's content scaled to FILL the sequence box, in a
   grid-cell node (so it stacks with the outgoing item during a transition), into
   a FRESH scope (never in `scope.children`). Returns null for a missing /
   over-deep / cyclic reference (⇒ an empty box).
2. `wireScopeSubtree(scope, path, false)` wires that scope's drivers — the SAME
   call repeater rows use.
3. `show()` starts the subtree's `clocks`/`tickers`/`sequences`; the composition's
   own intro/outro **controllers are NOT run** (HELD content). `hide()` calls
   `itemSub.destroy()` (idempotent).

Because the inner drivers use the same injectable `RuntimeClock` as the sequence,
pause/resume are exact and tests are deterministic.

### Static authoring render

`buildSequence` renders a composition **item-1** statically via
`buildSequenceCompositionItem` with a THROWAWAY scope (never wired) — the
authoring canvas shows the comp's held content (a clock's initial value, not
ticking). The DRIVER owns the live render: on `start()`/`reset()` it re-renders
item-1 through `renderComposition` (wired, ticking). This avoids double-wiring
item-1's drivers.

`SequenceEntry` now carries `depth` + `visited` so the comp-item build inherits
the composition cycle/runaway guard at the sequence's build site.

## Binding: text-only in Phase 1

A bound `list` value carries only text items, so a sequence holding any
composition item is not bindable: `resolveBinding` returns null, and the
inspector's Dynamic/Data section disables the Data key with a hint. Removing the
composition items re-enables binding.

## Export: the closure follows sequence composition refs

`collectChildCompositionRefs` (the ONE ref-collector shared by the export closure
AND the author-time cycle guard) now follows `sequence` composition items in
addition to `composition`/`repeater` elements. So a composition referenced only
by a sequence item joins the per-composition export closure (its assets are
gathered by the existing recursive walk) and the cycle guard treats it as a real
reference. No new export code path is needed.

## Deferred to Phase 2

- Per-item field injection into composition items (they are static refs now).
- A nested crawler's liveness inside a composition item (clocks ARE live now; a
  ticker inside a comp item rides the same `wireScopeSubtree` machinery and runs,
  but is not a Phase-1 acceptance target).
