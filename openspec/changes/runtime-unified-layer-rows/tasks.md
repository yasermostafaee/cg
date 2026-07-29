# Tasks — one layer surface (R-028)

**Implementation started 2026-07-29 (fast-mode session `dev-r028-a`, part A of three: config +
the bridge-owned template store). Sections 4–9 are parts B/C. See `DEBT.md` in this change dir
for what part A deliberately skipped or found un-runnable.**

## 0. BLOCKING owner calls (design.md OPEN CALLS) — ANSWERED (owner, 2026-07-29)

- [x] 0.1 **(o1) Where template files live** — DECIDED: **the BRIDGE owns the templates,
      persisted to disk** (design.md §h route 1, the recommendation, adopted). Every browser
      that connects sees the same library, and a bridge restart does not empty it.
      Implemented in part A: `TemplateRegistry` persists one JSON file per template under
      `--templates-dir` (default `~/.cg-runtime/bridge-templates`), hydrated at boot;
      `templates.changed` publishes the full catalogue to every browser on import/removal;
      `templates.list/get` are bridge-served while live (browser-local `LibraryStore` remains
      the offline fallback + reconnect re-delivery source).
- [x] 0.2 **(o2) The `CG NEXT` wire gap IS in scope** — DECIDED: yes. Part A adds the NEXT
      verb to `command-builder.ts` (`CG <ch>-<layer> NEXT 0`) so the capability the template
      already implements stops being designed out; the channel/UI wiring lands in part B with
      the rest of the verbs (5.1/5.4).

## 1. Prerequisites that must land FIRST

- [ ] 1.1 **R-021 stage 4 task 3.1** (`#slotForRestore`: a declared row NEVER falls through to
      `#allocate()`). Under this model every item is on a declared row, so the fall-through would
      misplace EVERY item after a bridge restart, not an edge case (design.md §l). Blocking.
- [x] 1.2 **C-015 `reservedLayers` wired to real config** — the playout split's only mechanism.
      DONE (part A): `ReservedLayersSchema` in `@cg/shared-ipc`; `reserved-layers-store.ts`
      loads it (`--reserved-layers 60-69` flag or `bridge-reserved-layers.json`;
      present-but-unusable = HARD boot failure); the SAME resolved list reaches the boot
      validator, every live `setFixedLayers` validation, AND the `LayerManager` — which now
      fences reserved layer numbers from `allocate()` and `reserve()` so no automatic path
      can put our graphic on a playout layer.
- [ ] 1.3 RECON: **does CasparCG 2.3.2 expose template identity** beyond producer kind (OSC tree
      and the `INFO` family)? `tools/caspar-amcp-probe` against real hardware, never reasoned
      from our own code (design.md §j). Blocks only the foreign-row wording (5.3).
      **UNRUN — no hardware in the part-A session, and NO LONGER LOAD-BEARING for row
      identity: with 0.1 answered, per-row identity comes from the bridge's own records +
      persisted registry, never from what CasparCG reports. See `DEBT.md`.**

## 2. Config — the fixed ceiling and per-layer visibility — DONE (part A, 2026-07-29)

- [x] 2.1 Config shape: a FIXED ceiling of candidate layers (never grows/shrinks at runtime),
      each with a visibility tick and an optional alias. Replaces R-021's mutable `count` and the
      grow/shrink/renumber rules it required. DONE: `FixedLayerBankSchema` gains
      `visibility` (per-layer, absent = visible — canonical predicate `isLayerVisible`);
      `validateFixedBankChange` refuses ANY count change (`resize-refused`); the config
      modal shows channel/start/count as read-only facts and edits ticks + aliases only.
- [x] 2.2 Fence the WHOLE ceiling from automatic allocation regardless of tick — visibility and
      fencing are separate (design.md §b4). DONE structurally: fencing derives from
      `start`/`count` (every validated slot goes to the LayerManager as fixed), never from
      the `visibility` record; the panel filter is the ONLY reader of the tick. Tested.
- [x] 2.3 Untick refused when the row is occupied AND when occupancy is UNKNOWN (fail closed).
      DONE: `untick-occupied` / `untick-unknown` (distinct codes + messages naming the
      layer); occupancy composed from the bridge's own records FIRST, then the OSC tap with
      the same hearing predicate the per-slot state publishes from (`#fixedSlotOccupancy`).
- [x] 2.4 Remove-template-from-config carries the row's own confirm gate, and the dialog states
      explicitly when the item is ON AIR (removal implies clear). DONE: the config modal's
      per-row "Remove…" → `useConfirm` dialog naming the template, stating ON AIR + "CLEARS
      layer N" when the stack says playing/on-air → `stack.remove` (whose CLEAR is the
      existing behaviour).
- [x] 2.5 Validation: candidate ceiling ∩ reserved playout range refused at load AND at change,
      error naming both ranges (extends the existing `validateFixedBank` checks). DONE — the
      boot path throws before the WebSocket binds; the change path re-runs the same check
      with the same resolved list; the message names the ceiling range AND the reserved
      range(s) AND the intersecting layers.
- [x] 2.6 Unit tests for 2.1–2.5, message CONTENT asserted (both ranges named; the occupied /
      unknown refusals distinguishable). DONE: `fixed-layers-store.test.ts` (message-content
      asserts per refusal), `fixed-layers-wire.integration.test.ts` S5/S10 (live resize
      refusal; fail-closed untick against REAL occupancy over the wire),
      `template-persistence.integration.test.ts` (boot refusal naming both ranges),
      `layer-manager.test.ts` (reserved fencing), `fixedBankConfigModal.dom.test.ts`
      (renderer half incl. the 2.4 gate).

## 3. Template identity across browsers (shape per 0.1) — DONE (part A, 2026-07-29)

- [x] 3.1 The bridge reports, per row, WHICH template is on it — the same answer to every browser
      (design.md §b2). DONE: `FixedSlotState.binding` gains optional `templateId` +
      `templateName`, resolved bridge-side (item → reconciler `templateId` → own registry);
      published state, so every browser reads the same answer; the row and the config modal
      display the name.
- [x] 3.2 The bridge's `TemplateRegistry` gains persistence + a catalogue channel every browser
      reads (0.1's route 1). DONE: one JSON file per template (atomic tmp+rename), hydrated
      at boot before the WS binds; corrupt entries warned + skipped, never fatal;
      `templates.changed` publish carries the full catalogue; `templates.list/get`
      bridge-served while live. The RESTART path is tested explicitly
      (`template-persistence.integration.test.ts`, `template-registry.test.ts`).
- [x] 3.3 Row state after a BRIDGE restart reports template identity as unknown honestly, rather
      than guessing (§b2's only carve-out). DONE + tested: after a restart with the producer
      still on air and the registry fully persisted, `binding` is `null` (the observed
      producer kind is all the row claims) — identity is never inferred from what happens to
      be on disk.

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
