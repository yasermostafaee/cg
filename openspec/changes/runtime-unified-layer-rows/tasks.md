# Tasks — one layer surface (R-028)

**ALL UNCHECKED — this change is DESIGN ONLY. No production code in this PR.**

## 0. BLOCKING owner calls (design.md OPEN CALLS) — implementation cannot start without them

- [ ] 0.1 **(o1) Where template files live** under one bridge / many browsers (design.md §h).
      The library is BROWSER-LOCAL today (§a), so operator B cannot see or load what operator A
      imported. Recommendation on file: upload once, serve from the bridge, give the bridge's
      registry persistence. Alternative: a shared filesystem. This decides whether section 3
      below is a small channel addition or a `runtime-template-library` change.
- [ ] 0.2 **(o2) Is the `CG NEXT` wire gap in scope** (design.md §f)? `command-builder.ts` has no
      NEXT verb, so the bridge cannot send `CG NEXT` at all today.

## 1. Prerequisites that must land FIRST

- [ ] 1.1 **R-021 stage 4 task 3.1** (`#slotForRestore`: a declared row NEVER falls through to
      `#allocate()`). Under this model every item is on a declared row, so the fall-through would
      misplace EVERY item after a bridge restart, not an edge case (design.md §l). Blocking.
- [ ] 1.2 **C-015 `reservedLayers` wired to real config** — the playout split's only mechanism.
      It is `[]` at both call sites today (`bridge.ts:194`, `caspar-runtime.ts:1370-1373`); the
      validator half already exists (`fixed-layers-store.ts:79`/`:127`). Blocking for section 5.
- [ ] 1.3 RECON: **does CasparCG 2.3.2 expose template identity** beyond producer kind (OSC tree
      and the `INFO` family)? `tools/caspar-amcp-probe` against real hardware, never reasoned
      from our own code (design.md §j). Blocks only the foreign-row wording (5.3).

## 2. Config — the fixed ceiling and per-layer visibility

- [ ] 2.1 Config shape: a FIXED ceiling of candidate layers (never grows/shrinks at runtime),
      each with a visibility tick and an optional alias. Replaces R-021's mutable `count` and the
      grow/shrink/renumber rules it required.
- [ ] 2.2 Fence the WHOLE ceiling from automatic allocation regardless of tick — visibility and
      fencing are separate (design.md §b4). Mechanism is R-021's born-allocated fencing applied
      to the ceiling, not to the visible subset.
- [ ] 2.3 Untick refused when the row is occupied AND when occupancy is UNKNOWN (fail closed).
- [ ] 2.4 Remove-template-from-config carries the row's own confirm gate, and the dialog states
      explicitly when the item is ON AIR (removal implies clear).
- [ ] 2.5 Validation: candidate ceiling ∩ reserved playout range refused at load AND at change,
      error naming both ranges (extends the existing `validateFixedBank` checks).
- [ ] 2.6 Unit tests for 2.1–2.5, message CONTENT asserted (both ranges named; the occupied /
      unknown refusals distinguishable).

## 3. Template identity across browsers (shape depends on 0.1)

- [ ] 3.1 The bridge reports, per row, WHICH template is on it — the same answer to every browser
      (design.md §b2). The stack is already bridge-published (§a), so this is an extension of the
      existing per-row state, not a new ownership model.
- [ ] 3.2 Whatever 0.1 decides: either give the bridge's `TemplateRegistry` persistence + a
      catalogue channel every browser reads (recommended), or a shared-filesystem path contract.
      NOTE: the registry is in-memory and empty on restart today.
- [ ] 3.3 Row state after a BRIDGE restart reports template identity as unknown honestly, rather
      than guessing (§b2's only carve-out).

## 4. The row surface

- [ ] 4.1 ONE row list replacing the Stack and Library panels; DESCENDING layer order.
- [ ] 4.2 Row content: alias · REAL layer number (always) · template name · description · state
      indicator (playing / stopped / empty). A display index may sit beside the real number.
- [ ] 4.3 ONE Load button running the whole chain — reuses #419's shipped
      `importVcgFile` → `fixedLayers.load` → `bindFixed` path, promoted from special case to
      primary path.
- [ ] 4.4 Keep the Inspector, driven by row selection (position + full nested field set).
- [ ] 4.5 Settings: the candidate-layer table — every candidate layer, checkbox, alias field.

## 5. Verbs

- [ ] 5.1 Verb set LOAD · PLAY · NEXT · UPDATE · STOP · CLEAR · REMOVE with OUR C-012 semantics.
      Cinegy's LAYOUT and icons; NEVER its vocabulary (design.md §d — adopting its labels would
      invert STOP).
- [ ] 5.2 Extend `RowAction` with a PLACEMENT hint so buttons and menu still derive from ONE list
      (`toMenuItems` keeps receiving the whole list). A second "menu-only actions" array is
      forbidden — that is the drift `rowAction.ts` exists to prevent.
- [ ] 5.3 Playout-owned rows: visible, labelled, honest occupancy, NO operator verbs. Foreign
      (undeclared) rows state what is known — wording depends on 1.3.
- [ ] 5.4 Derive `hasNext` at IMPORT (the `produceTemplateDelivery` seam that already yields
      R-011's `defaultPosition` and R-018's `listFieldTargets`) and gate NEXT on it. No
      always-enabled-and-no-op control.
- [ ] 5.5 DOM tests: the verb split per row state, asserted by COMPARING the button and menu
      surfaces; playout rows offer nothing; NEXT hidden without `hasNext`.

## 6. Retiring the dynamic path (design.md §k — each piece keeps its recorded reason)

- [ ] 6.1 `LayerManager.allocate()` keeps existing but MUST have no caller that puts an operator
      graphic on air. Assert that in a test, rather than deleting code other items may need.
- [ ] 6.2 R-009 orphan sweep NARROWED, still running: candidates become layers nobody declared.
      Requires 1.2 first — otherwise it flags healthy playout graphics as orphans (§i).
- [ ] 6.3 R-015's foreign refusal unchanged outside declared ranges; regression-test the boundary.
- [ ] 6.4 `LayerPolicy` ranges become DESCRIPTIVE. Record that `logo-bug` remains a `templateType`
      in the scene schema (`scene.ts:123`) even when its 90–99 RANGE is freed — the type does not
      go with the range (§c).

## 7. Migration

- [ ] 7.1 Items already on dynamic layers are NOT auto-relocated; they keep running until removed.
      Auto-moving a live graphic at upgrade is an unattended on-air action (§m).
- [ ] 7.2 Upgrade note in `docs/operator-guide/README.md`: clear and reload onto rows at a safe
      moment.

## 8. Docs + PRD

- [ ] 8.1 Engine doc-sync where contracts changed.
- [ ] 8.2 `docs/prd/runtime.md` R-028 → `[~]` with an honest status note (on-air behaviour
      throughout; hardware verification owed).
- [ ] 8.3 Cross-refs: R-021 (plumbing + stage 4), R-023 (per-row shortcuts bind to 5.2's
      declaration point), R-024/C-002 (rundowns/presets reference rows), C-015 (`reservedLayers`).

## 9. Gate

- [ ] 9.1 `pnpm openspec validate runtime-unified-layer-rows --strict`.
- [ ] 9.2 Full green gate (uncached) + `gate:e2e`; Linux `gate:e2e` debt recorded honestly
      (see [B-078] — the local E2E gate is a known flake surface).
- [ ] 9.3 Real-hardware pass on CasparCG 2.3.2 before archive — on-air behaviour throughout.
