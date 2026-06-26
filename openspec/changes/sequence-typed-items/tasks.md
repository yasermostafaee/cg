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
