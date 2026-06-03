## 1. Schema

- [x] 1.1 Add optional `timelineColor: HexColorSchema` to `ElementBaseSchema`
  (`packages/shared-schema/src/elements.ts`); absent ⇒ deterministic per-id color

## 2. Store

- [x] 2.1 `setElementTimelineColor(elementId, color)` — persist the chosen color
- [x] 2.2 `fitElementLifespanToActiveRange(elementId)` — set lifespan to
  `activeRangeOf(scene)`
- [x] 2.3 Module-level `clipboardElement` + deep-clone helpers
  (`cloneElementWithNewIds` / `reassignIdsDeep`) and an `insertElementAt` helper
- [x] 2.4 `copyElement`, `cutElement`, `pasteElement`, `duplicateElement`,
  `hasClipboardElement`
- [x] 2.5 Clear the clipboard on `setScene` and `_reset`

## 3. Timeline UI

- [x] 3.1 `LayerContextMenu.tsx` — Color ▶ (swatch submenu), Fit workspace,
  Copy, Cut, Paste (disabled when empty), Duplicate, Delete; closes on
  outside-click / Escape; clamps into the viewport
- [x] 3.2 `ElementRow` gains an `onContextMenu` prop wired on the label and lane
  (right-click selects then opens the menu)
- [x] 3.3 `TimelineDock` owns the menu state, renders `LayerContextMenu`, and
  sources the lifespan-bar color from `element.timelineColor ?? lifespanColorFor(id)`

## 4. Tests + gate

- [x] 4.1 `apps/designer/tests/store-layer-actions.test.ts` — color,
  fit-to-active-region (with and without an active region), copy+paste clone
  identity, empty-clipboard no-op, cut, duplicate adjacency, clipboard cleared
  on scene switch
- [x] 4.2 Green gate: `typecheck` + `lint` + `test` + `build` for
  `@cg/shared-schema` and `@cg/designer`
- [x] 4.3 `pnpm openspec validate add-layer-context-menu --strict` passes
