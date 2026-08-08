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

## 4. The row surface — DONE (part B, 2026-07-29)

- [x] 4.1 ONE row list replacing the Stack and Library panels; DESCENDING layer order. DONE:
      `features/layers/LayersPanel.tsx`; `LibraryPanel`, `StackPanel`, `StackRow`,
      `FixedLayersPanel`, `FixedRow` and `fixedRowActions` DELETED; the 240px library grid
      column removed from `layout.ts`.
- [x] 4.2 Row content: alias · REAL layer number (always) · template name · description · state
      indicator. DONE (`LayerRow.tsx`): layer number + alias in their own cell, `StatusBadge`
      (carrying R-006's SIM treatment and B-087's link-down mask), the resolved template label,
      and the honest occupancy line. An empty row says "Empty — load a template".
- [x] 4.3 ONE Load button running the whole chain — reuses #419's shipped
      `importVcgFile` → `fixedLayers.load` → `bindFixed` path. DONE, unchanged and promoted to
      the primary path; the already-imported variant is menu-placed beside it.
- [x] 4.4 Keep the Inspector, driven by row selection. DONE — the row's body click reports the
      bound item id up to `App`, exactly as the stack row did; the Inspector is untouched.
- [x] 4.5 Settings: the candidate-layer table. DONE via the existing bank config modal
      (per-layer visibility tick + alias, ceiling read-only), reached from the Layers header.

## 5. Verbs — DONE (part B, 2026-07-29), with 5.3 REVERSED by owner decision

- [x] 5.1 Verb set LOAD · PLAY · NEXT · UPDATE · STOP · CLEAR · REMOVE with OUR C-012 semantics.
      DONE (`layerRowActions.ts`) — STOP stays the graceful exit and CLEAR the hard kill; the
      reference product's inverted vocabulary is not adopted.
- [x] 5.2 `RowAction` gains a PLACEMENT hint (`surface?: 'button' | 'menu'`, default button) and
      `buttonActions()` is the ONE reader of it; `toMenuItems` still receives the whole list. No
      second array. UPDATE, REMOVE and LOAD-FROM-LIBRARY are menu-placed.
- [x] 5.3 **REVERSED — see R-032.** The owner decided that declared playout layers SHOULD be
      clearable from a deliberate surface. The main Layers list still offers playout rows no
      verbs; a separate PLAYOUT TAB lists them with a yellow tab indicator and clears them,
      individually and all at once, gated: html-only, unknown-never-empty, confirm-gated
      clear-all, and part A's automatic-path exclusions (orphan sweep, `layers.clear`) UNCHANGED.
      Foreign-row wording: task 1.3's recon was RUN this session (see `DEBT.md`) — producer kind
      IS legible for layers we did not create, so the tab names the observed kind.
- [x] 5.4 `hasNext` derived at IMPORT via `produceTemplateDelivery`, by the new canonical
      `hasNextStep` predicate in `@cg/shared-schema` (the Designer's duplicate now delegates to
      it). It rides `TemplateInfo` rather than a browser-local store — so it is persisted with
      the bridge registry and identical in every browser — and NEXT is withheld entirely without
      it. `stack.next` channel → `nextItem` → `CG … NEXT`, wire-tested.
- [x] 5.5 DOM tests: `layerRow.dom.test.ts` (19) asserts the verb split per row state and
      COMPARES the button surface against the menu surface (menu is a superset; every menu item
      disabled exactly when its declaration is; link-down disables both);
      `playoutPanel.dom.test.ts` (13) covers the tab's three occupant cases (html · non-html ·
      unknown) plus empty, the gated clear-all, and the pure gate without a DOM.

## 6. Retiring the dynamic path (design.md §k — each piece keeps its recorded reason)

- [ ] 6.1 **REWRITTEN 2026-08-08** (`live-source-multibox` §7.2 — see 6.5 below).
      `LayerManager.allocate()` keeps existing but MUST have no caller that puts an **operator
      graphic** on air. Assert that in a test, rather than deleting code other items may need.
      ⚠ **The test asserts the absence of an OPERATOR-graphic caller, NOT the absence of every
      caller.** A **declared, non-operator** allocation is PERMITTED and the test must be written so
      it passes — C-015's Live Source layers are exactly that: allocated by the bridge, on a declared
      range, recorded in a bridge-owned ledger, and never an operator's graphic. Written as "no
      caller at all", this test is a **silently correct-looking** fixture that forbids the third
      ownership class, and nothing in review would flag it.
- [ ] 6.2 R-009 orphan sweep NARROWED, still running: candidates become layers nobody declared —
      **against all THREE declared classes** (6.5), not two. Requires 1.2 first — otherwise it flags
      healthy playout graphics as orphans (§i) — and requires 6.5, or it flags live guest boxes as
      orphans, which is an operator being invited to clear a face off air.
- [ ] 6.3 R-015's foreign refusal unchanged outside declared ranges; regression-test the boundary.
      **The Live Source range is INSIDE a declared range under 6.5**, so the refusal does not reach
      it — and it is refused there for a different, distinct reason (`live-source`), never as
      `foreign`. See `live-source-multibox` design.md §4 (C5): granting C-015's exemption as
      originally worded would have made those layers operator-CLEARABLE, inverting the protection.
- [ ] 6.4 `LayerPolicy` ranges become DESCRIPTIVE. Record that `logo-bug` remains a `templateType`
      in the scene schema (`scene.ts:123`) even when its 90–99 RANGE is freed — the type does not
      go with the range (§c).
      ✅ **CONFIRMED 2026-08-08 that this frees 10–59** — `live-source-multibox` §7.3, and checked
      against the CODE rather than against §c's prose. `DEFAULT_LAYER_POLICY`
      (`packages/caspar-client/src/layers/layer-manager.ts:49-56`) is today `lower-third` 10–19 ·
      `ticker` 20–29 · `breaking-news` 30–39 · `logo-bug` 40–49 · `fullscreen` 50–59 · `custom`
      60–69. Making these descriptive releases **10–69**; `custom`'s 60–69 is the reserved playout
      range, which stays fenced by `reservedLayers`. **The residue is exactly 10–59** — fifty layers,
      directly below the 70–99 operator bank, which is the range C-015 needs (sources must sit BELOW
      the template's layer). Note `logo-bug` has since MOVED from 90–99 to 40–49, inside the freed
      span, so §c's "90–99" wording is about the bank and this confirmation does not rest on it.
- [ ] 6.5 🔴 **AMEND SECTION 6 TO A THREE-CLASS DECLARED MODEL — BEFORE 6.1–6.3 ARE
      IMPLEMENTED.** Added 2026-08-08 as `live-source-multibox`'s cross-change obligation (§7.1
      there; the full argument is that change's design.md §4). Section 6 as originally written
      cements a **TWO**-class model — fixed operator rows and the reserved playout range — with no
      room for a **bridge-owned non-html layer**. The declared classes are **three**: 1. **fixed operator rows** (the candidate bank, 70–99) — declared config, today; 2. **the reserved playout range** (60–69) — declared config, wired by 1.2; 3. **bridge-owned Live Source layers** (10–59, freed by 6.4) — declared config PLUS a
      bridge-owned ledger (`#liveLayers`), which is what makes them ownable at all.
      **Why this order, and why the reverse does not work.** Section 6 is a NARROWING: it removes
      candidates from a sweep and asserts an ABSENCE in a test. A narrowing written against an
      incomplete class list is not a bug that shows up in review — it is a silently correct-looking
      test that forbids the third class. Landing Live Sources first instead would leave a window in
      which R-009's sweep flags live guest boxes as orphans. The doctrine being extended is R-028's
      OWN — **"Declared, never detected"** (design.md §i): OSC carries producer KIND, not identity,
      so a bridge-owned non-html layer is the same problem one step further out and gets the same
      answer. This adds a third member to an existing set; it invents no mechanism.
      ⚠ **The third class is NOT `reservedLayers`** — that is a fence AWAY from a foreign owner, the
      exact inverse of a record of layers we own. A Live Source placed there would be unplaceable
      (`layer-manager.ts:210`), unreservable (`:246`) and unclearable
      (`caspar-runtime.ts:2679-2681`) through every existing door. 1.2's `[x]` tags calling
      `reservedLayers` "the C-015 Live Source seam" are misleading and are corrected by
      `live-source-multibox` phase 2.6; 1.2 satisfied C-015's **disjointness** half and none of its
      **ownership** half.

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
      declaration point), R-024/C-002 (rundowns/presets reference rows), C-015 — **BOTH halves,
      extended 2026-08-08** (`live-source-multibox` §7.4): (a) `reservedLayers`, the playout fence
      1.2 wired, and (b) the **OWNERSHIP CLASS** — C-015's bridge-owned Live Source layers are the
      THIRD declared class 6.5 adds, on 10–59 freed by 6.4, recorded in a bridge-owned ledger rather
      than inferred from producer kind. Naming only (a) is what let 1.2 read as "C-015 is handled"
      while the ownership half was untouched.

## 9. Gate

- [ ] 9.1 `pnpm openspec validate runtime-unified-layer-rows --strict`.
- [ ] 9.2 Full green gate (uncached) + `gate:e2e`; Linux `gate:e2e` debt recorded honestly
      (see [B-078] — the local E2E gate is a known flake surface).
- [ ] 9.3 Real-hardware pass on CasparCG 2.3.2 before archive — on-air behaviour throughout.
