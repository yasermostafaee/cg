# Tasks — fixed operator layers (R-021)

## STAGE MAP (implementation lands in staged PRs)

- **Stage 1** = 1.1–1.3, 2.1, 2.2, 4.2a — install config + LayerManager fixed mechanism
  (pure logic; no UI, no channels, no on-air change). **Shipped.**
- **Stage 2a** = 4.1, 4.2b — the WIRE CONTRACT: channels, bridge routes, live bank
  changes, per-slot state publish, platform seam + mock parity. No renderer. **Shipped
  (this PR).** Honest note (D7): the busy predicate reads the LayerManager's fixed
  binding + the retained-intent slot keys — both empty until stage 3, so the END-TO-END
  shrink-with-resident refusal becomes testable only in stage 3 (the predicate itself is
  unit-tested directly, and the validator's refusal is pinned by stage 1's T13).
- **Stage 2b** = 5.1, 5.1b, 5.2, 5.4, 5.5 — the renderer (fixed-bank panel, rows,
  rowAction, DOM/E2E tests); owes Linux `gate:e2e`.
- **Stage 3** = 5.3 — the one-action import+create+load chain; owes e2e + hardware.
- **Stage 4** = 3.1–3.3, 4.3, 4.4 — restore branch + `restore-blocked` + the fixed-row
  Clear carve-out; owes hardware.

## 0. Owner decisions — ANSWERED (owner, 2026-07-23; encoded in design.md + specs delta)

a1 disjointness prohibition (load + extension); b1 silent-slot hard Clear PERMITTED
confirm-gated (honest unknown-occupancy dialog naming the layer); d1 separate
Clear-then-load with the named `restore-blocked` state; e1 shrink-with-residents refused
naming slots. No open decisions block implementation.

## 1. Config + validation

- [x] 1.1 Install config: `fixedLayers` with channel, immutable `start: 70`, `count` (≤ 20,
      so max layer 89) and `aliases` — schema in `@cg/shared-ipc`
      (`channels/fixedLayers.ts`, shape only — no channel yet); persistence in
      `tools/caspar-bridge/src/fixed-layers-store.ts` (`connection-store` pattern, atomic
      tmp+rename), loaded at boot via `fixedLayersPath` / `--fixed-layers-path`
      (precedence: explicit option > persisted file > no bank). A PRESENT-but-unusable
      file is a HARD boot failure (deliberate divergence from connection-store's
      warn-and-ignore — module header records why).
- [x] 1.2 Config validation (a1/e1): `validateFixedBank` / `validateFixedBankChange` refuse
      fixed∩policy-range overlap AND fixed∩reserved (C-015 Live Source seam —
      `reservedLayers`, `[]` until that item lands) — errors naming BOTH ranges, checked at
      load AND on any change; refuse mid-session renumber/channel change; grow-at-end
      accepted; shrink refused while affected slots are busy, error naming the occupied
      slot numbers; alias keys validated in-bank.
- [x] 1.3 Validation unit tests (T8–T15, `tests/fixed-layers-store.test.ts`) — message
      CONTENT asserted (both ranges named; occupied slot numbers named).

## 2. LayerManager fixed mechanism (@cg/caspar-client)

- [x] 2.1 `LayerManagerOptions.fixed?: readonly LayerSlot[]` beside `pinned`; born-allocated
      fencing (no templateType until bound — a fenced-but-unbound slot is not an
      allocation); `isFixed()` / `fixedSlots()` / `bindFixed()` / `unbindFixed()` /
      `fixedBinding()` as the exact-slot path (`reserve()` refuses fixed slots); no
      auto-start semantics leak from template-pinned; pinned∩fixed throws
      `FixedPinnedConflictError` naming the slot; `quarantine()`/`observe()` no-op on fixed
      (stage 4 derives `restore-blocked` from the occupancy TAP, not the quarantine set).
- [x] 2.2 Tests T1–T7 (`packages/caspar-client/tests/layer-manager.test.ts`): fencing under
      range exhaustion, deallocate no-op, bind/unbind round-trip + fence-after-unbind,
      reserve refusal, allocations() visibility, quarantine/observe no-ops, pinned∩fixed
      throw.

## 3. Restore branch (tools/caspar-bridge)

- [ ] 3.1 `#slotForRestore` (`caspar-runtime.ts:814-824`): fixed retained slot → NEVER
      `#allocate()` fall-through; reservable → same-slot reserve + standard B-092 deferred
      adopt-vs-re-ADD; unreservable (foreign observed) → the named `restore-blocked` state
      (d1), zero wire traffic, honest row state.
- [ ] 3.2 Tests 1–5 from design.md §d (same-layer adopt; `restore-blocked` on foreign with
      the producer surviving and zero CLEAR; own-html adopt without CLEAR; silent-slot
      deferral; dynamic fall-through regression).
- [ ] 3.3 `restore-blocked` lifecycle tests (design.md §d test 8): entered on
      foreign-occupied restore; exits via explicit operator Clear + take AND via the foreign
      producer vacating (observed empty → deferred re-ADD); never via allocate-elsewhere or
      auto-clear; the row names the retained item and the observed occupancy while blocked.

## 4. Bridge surface + channels

- [x] 4.1 (stage 2a) `@cg/shared-ipc`: the fixed-bank channels — `fixedLayers.config` /
      `.set-config` (reason = the validator's code union, single-sourced via
      `FIXED_LAYERS_SET_CONFIG_REASONS`) / `.config-changed` / `.state` /
      `.state-changed` — all in `channels/fixedLayers.ts` beside the stage-1 schema, with
      contracts documented; bridge routes + `wirePublishes`; `set-config` order
      validate → apply → persist (non-fatal) → publish, with NO on-air block (design (e));
      `LayerManager.applyFixed` for live bank changes (bound slots may never be removed —
      defence in depth behind the validator); the typed `RuntimeBridge.fixedLayers` seam +
      `WebSocketRuntime` impl + `MockRuntime` parity (applies + publishes, offline
      occupancy honestly UNKNOWN, never re-implementing the validators). Exact-slot load
      and layer-verb channels are stages 3/4.
- [x] 4.2a Orphan-sweep exclusion (pulled into stage 1): fixed layers excluded from R-009
      orphan candidates by unioning `LayerManager.fixedSlots()` into the sweep's `owned`
      set — the LayerManager is the single source of the bank, never a second local copy.
      Pulled forward because a bank fenced from allocation but still shouted about in the
      orphan banner is an incoherent intermediate state. Integration-tested (T16: foreign
      on a fixed layer never surfaces; a non-fixed control layer does; T18: no bank → today's
      behaviour, byte-identical).
- [x] 4.2b (stage 2a) Per-slot occupancy publish from the SAME sweep tick that already
      samples the tap (no second timer, no second staleness constant): D3 honesty
      (unhealthy primary or silent tap ⇒ every slot `unknown`, never 'empty'; hearing tap
      ⇒ `producer`/`empty` per B-053), published only on deep-compare change (two
      identical sweeps ⇒ zero publishes), computed BEFORE the tick's healthy guard so a
      disconnect honestly re-publishes `unknown` instead of freezing stale state. The
      wire carries FACTS only — `{observed, binding}` — never a computed row state
      (design (f) note); `binding` ships now, null until stage 3.
- [ ] 4.3 Fixed-row hard Clear per (b)/b1: confirm-gated always; under OSC silence the
      confirmation dialog states occupancy is unknown AND names the layer number; outside
      the fixed range R-015's silence-refusal is untouched (regression-test the boundary).
      Graceful Stop offered only for observed `html` (RECON: `CG STOP` on a non-html layer
      on real 2.3.2 — probe via `tools/caspar-amcp-probe`, never assume).
- [ ] 4.4 Test 6 from design.md §d (Clear observed vs silent-with-honest-dialog; C-012
      Stop/Clear distinction; outside-range refusal unchanged).

## 5. Runtime UI

- [ ] 5.1 Fixed-bank panel: permanent rows (alias + layer number), occupancy honest incl.
      explicit UNKNOWN and the `restore-blocked` state (retained item + observed occupancy
      both named); verb derivation as ONE function of `(localItem, observation)`.
- [ ] 5.1b Install doc: the b′ deployment invariant — all stations sharing one CasparCG
      declare the SAME fixed bank — documented beside the config (the C-009 operator-contract
      class); repeated foreign html inside the bank surfaced as a soft divergence hint,
      information only.
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
