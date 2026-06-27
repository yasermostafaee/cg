# Tasks — sequence typed items (D-083 Phase 1)

## 1. Schema (`@cg/shared-schema`)

- [x] `SequenceItemSchema` → `z.union([SequenceTextItemSchema, SequenceCompositionItemSchema])`; text `kind` optional (non-breaking), composition variant reuses `compositionId: IdSchema`.
- [x] Export `SequenceTextItem` / `SequenceCompositionItem` types.
- [x] Round-trip + non-breaking tests: old `{id,text}` parses unchanged (no `kind` injected); composition item + mixed list round-trip; reject a comp item without `compositionId`; reject an item that is neither.
- [x] `collectChildCompositionRefs` follows `sequence` composition items (export closure + cycle guard).

## 2. Runtime (`@cg/template-runtime`)

- [x] `SequenceDriverItem` widened to the union; `RenderedSequenceItem` + `SequenceCompositionRenderer` added; `renderComposition` option.
- [x] Driver delegates node creation to `renderItem`; `show`/`pause`/`resume`/`hide` forwarded on enter / pause / resume / leave+stop; `setItems` reconcile narrowed to text items.
- [x] `buildSequenceCompositionItem` (scene-builder) builds the comp content scaled to the box into a fresh scope; `buildSequence` static-renders a composition item-1 (throwaway scope) + carries `depth`/`visited`.
- [x] `runtime.ts` builds `renderComposition` reusing `wireScopeSubtree`; HELD content (no intro/outro controllers); inner drivers start on show, destroy on advance; inner clocks use the injectable clock.
- [x] Tests: composition item renders the comp content with a LIVE ticking clock (10:00 → 09:57); advancing tears the comp item down; pause freezes the inner clock in lockstep.

## 3. Inspector + binding (`@cg/designer`)

- [x] `ListItemsEditor` gains a per-item KIND picker + composition picker (sequence context only, via the shared `Select`); preserves add/remove/reorder/dwell + unknown fields.
- [x] `SequenceSections` passes the nestable compositions; `setSequenceItems` preserves the typed union.
- [x] Binding TEXT-ONLY gate: `resolveBinding` returns null for a sequence with a composition item; `DynamicDataSection` disables the Data key + shows a hint.

## 4. Export (`@cg/designer`)

- [x] Composition referenced only by a sequence item joins the export closure; coverage test asserts its asset is bundled.

## 5. E2E (`@cg/designer`)

- [x] Rotating title: a composition item (clock card) renders live + the transport Next advances to a text item.
- [x] Binding guard: a sequence with a composition item disables the Data key with a hint.

## 6. Adversarial review fixes

- [x] CRITICAL — adding a composition item to a BOUND sequence now DROPS the text-only `sequence-items` binding + its list field (`setSequenceItems`), so the runtime no longer coerces the composition back to empty text; store regression test added.
- [x] HIGH — `SequenceDriver.destroy()` no longer strands a rebuilt composition subtree (set `destroyed` before `reset()`; `renderCurrentStatic()` no-ops when destroyed); driver leak test added.
- [x] MEDIUM — a deleted/missing composition reference now shows as "(missing composition)" in the item picker instead of silently displaying the first option.
- [x] LOW — `coerceSequenceItems` preserves composition items (kind-aware) for the hand-authored `.vcg` seam.

## 7. Gate + docs

- [x] PRD D-083 → `[~]` with the revised text|composition design.
- [x] Combined green gate (turbo --force) across `@cg/shared-schema` + `@cg/template-runtime` + `@cg/designer`; lint 0 errors; format clean; E2E 6/6.
- [x] `pnpm openspec validate sequence-typed-items --strict`.

## 8. Correction — surface composition-item fields + narrow the item-list guard

The original guard conflated (A) the item-LIST `sequence-items` binding (text-only, correctly
disabled) with (B) per-ELEMENT field binding/editing (must never be blocked), and a composition
sequence item didn't expose its fields, so the operator couldn't edit e.g. the city label next to a
clock.

- [x] Schema: `sequenceCompositionItemsOf` + shared `sequenceItemNamespace`/`sequenceItemInstanceId`; `aggregateCompositionFields` emits a `CompositionFieldGroup` per composition item (namespace `<seq name>[<index>]`); `compositionInstancesOf` stays composition-only. Aggregation tests added.
- [x] Runtime: each composition item applies its namespaced field values to its dynamic scope after `wireScopeSubtree` (build-time + re-applied on `update()` via a new `applyFields` hook + `applyFieldsToCurrent`). Runtime test added (default applied, then live update).
- [x] Guard: reword the message to scope it to the item list only ("the item list can't be data-bound … you can still edit each item's text and bind fields inside composition items"); confirm per-element binding/static-text editing remain available (structurally already independent).
- [x] E2E: a composition item's text field is exposed in the operator form + setting it updates the preview; the item-list guard message is scoped + a text item stays typeable.

## 9. Correction — per-item editing symmetry (TEXT items too)

Composition items exposed fields, but plain TEXT items exposed nothing, so a mixed sequence wasn't
fully operator-editable without wrapping text in a composition. Make TEXT items operator-editable
per-item, parallel to composition items, when the item-list is NOT bound.

- [x] Schema: `aggregateCompositionFields` (for a NON-list-bound sequence) exposes EVERY item — a TEXT item as a flat per-item text field (seeded with its text), a COMPOSITION item as a group; a LIST-BOUND sequence exposes nothing (no double-exposure). New helpers `sequencesOf` + `listBoundSequenceIds`. Tests: mixed (flat field + group), text-only (flat fields), bound (none).
- [x] Runtime: a TEXT item's text comes from its per-item field (`textValueFor`, gated to non-bound sequences) read at the item's own scope path; re-applied live on `update()` via the existing `applyFields`. `item.text` is read LIVE so a bound reconcile (setItems) still wins. Tests: non-bound text item shows + updates; a bound sequence ignores stale per-item keys.
- [x] E2E: a non-bound MIXED sequence (text item + clock+text composition item) exposes BOTH fields; editing each updates the right slide in the preview.
