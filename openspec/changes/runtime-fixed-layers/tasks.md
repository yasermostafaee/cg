# Tasks — fixed operator layers (R-021). ALL UNCHECKED — this PR is design-only.

## 0. Owner decisions (block implementation start, not this design PR)

- [ ] 0.1 Owner answers a1 (fixed∩Live-Source disjointness prohibition vs precedence),
      b1 (silent-slot blind Clear: absolute refusal vs own-intent exception),
      d1 (foreign-at-restore: separate steps vs compound action),
      e1 (shrink-with-residents: refuse vs defer-until-empty). Record answers in design.md;
      move anything newly settled into the specs delta before implementing it.

## 1. Config + validation

- [ ] 1.1 Install config: `fixedLayers` with channel, immutable `start: 70`, `count` (≤ 20,
      so max layer 89) and `aliases` — in the bridge's install-config class
      (`connection-store` persistence family).
- [ ] 1.2 Load-time validation: refuse fixed∩policy-range overlap; refuse fixed∩C-015
      Live Source layer plan (per a1); refuse mid-session renumber; grow-at-end applies live;
      shrink refused while affected slots hold residents/retained intent (per e1), error names
      the slots. Alias changes live.
- [ ] 1.3 Validation unit tests (design.md test 7).

## 2. LayerManager fixed mechanism (@cg/caspar-client)

- [ ] 2.1 `LayerManagerOptions.fixed: readonly LayerSlot[]` beside `pinned`; born-allocated
      fencing; `isFixed()`; exact-slot bind path for fixed slots (reserve-class, consults the
      fixed set — never `allocate()`); no auto-start semantics leak from template-pinned.
- [ ] 2.2 Tests: `allocate()` can never return a fixed slot even under range exhaustion;
      `deallocate()` never frees one; exact-slot bind/unbind round-trip.

## 3. Restore branch (tools/caspar-bridge)

- [ ] 3.1 `#slotForRestore` (`caspar-runtime.ts:814-824`): fixed retained slot → NEVER
      `#allocate()` fall-through; reservable → same-slot reserve + standard B-092 deferred
      adopt-vs-re-ADD; unreservable (foreign observed) → park retained-pending, zero wire
      traffic, honest row state.
- [ ] 3.2 Tests 1–5 from design.md §d (same-layer adopt; parked-on-foreign with producer
      surviving and zero CLEAR; own-html adopt without CLEAR; silent-slot deferral; dynamic
      fall-through regression).

## 4. Bridge surface + channels

- [ ] 4.1 `@cg/shared-ipc`: fixed-bank channels (config read/update, per-slot state publish,
      exact-slot load, layer verbs) with contracts documented; `MockRuntime` parity.
- [ ] 4.2 Orphan-sweep exclusion: fixed layers excluded from R-009 orphan candidates
      (single fixed-config source — no second local copy); occupancy per fixed slot published
      from the same tap sample.
- [ ] 4.3 Fixed-row hard Clear per (b): observed-only, confirm-gated, refuses on silence with
      the stated reason; graceful Stop offered only for observed `html` (RECON: `CG STOP` on a
      non-html layer on real 2.3.2 — probe via `tools/caspar-amcp-probe`, never assume).
- [ ] 4.4 Test 6 from design.md §d (Clear observed vs silent; C-012 Stop/Clear distinction).

## 5. Runtime UI

- [ ] 5.1 Fixed-bank panel: permanent rows (alias + layer number), occupancy honest incl.
      explicit UNKNOWN state; verb derivation as ONE function of `(localItem, observation)`.
- [ ] 5.2 One `fixedRowActions(state): RowAction[]` declaration point (R-013 pattern); buttons + context menu from the same list.
- [ ] 5.3 Row import+load chain: pick `.vcg` → library import (stays for reuse) → item bound
      to the exact slot → Load; Load-from-library variant.
- [ ] 5.4 DOM tests: verb split by residency; unknown-occupancy display; menu/button parity.
- [ ] 5.5 E2E: fixed rows render with aliases; import+load lands on the exact slot; foreign
      occupancy shows layer verbs only. (Owed Linux `gate:e2e` recorded per the standing rule
      when this lands.)

## 6. Docs + PRD

- [ ] 6.1 Engine doc-sync where contracts changed; `docs/prd/runtime.md` R-021 → `[~]` with an
      honest status note (hardware verification owed: on-air behavior changes).
- [ ] 6.2 Cross-refs: R-023 binds shortcuts to the (f) declaration point; R-024/C-002 use the
      (h) binding shape.

## 7. Gate

- [ ] 7.1 `pnpm openspec validate runtime-fixed-layers --strict`.
- [ ] 7.2 Full green gate (uncached) + `gate:e2e`; Linux `gate:e2e` debt recorded honestly.
- [ ] 7.3 Real-hardware pass on CasparCG 2.3.2 (fixed-slot load, restore-in-place, foreign
      occupancy handling) before archive — on-air behavior throughout.
