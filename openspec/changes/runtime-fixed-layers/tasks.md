# Tasks — fixed operator layers (R-021)

## STAGE MAP (implementation lands in staged PRs)

- **Stage 1** = 1.1–1.3, 2.1, 2.2, 4.2a — install config + LayerManager fixed mechanism
  (pure logic; no UI, no channels, no on-air change). **Shipped.**
- **Stage 2a** = 4.1, 4.2b — the WIRE CONTRACT: channels, bridge routes, live bank
  changes, per-slot state publish, platform seam + mock parity. No renderer. **Shipped.**
  Honest note (D7): the busy predicate reads the LayerManager's fixed
  binding + the retained-intent slot keys — both empty until stage 3, so the END-TO-END
  shrink-with-resident refusal becomes testable only in stage 3 (the predicate itself is
  unit-tested directly, and the validator's refusal is pinned by stage 1's T13).
- **Stage 2b** = 5.1, 5.1b (doc half), 5.2, 5.4, 5.5 (renderer half), 5.6 — the renderer:
  fixed-bank panel + permanent rows, the ONE verb-derivation point, the declaration-time
  confirm gate (`withConfirm` + the `cancelled` async path), the bank config modal, mock
  seed + DOM/unit/E2E tests. **Shipped (this PR).** Honest notes: **(D1)** the ONLY verb
  stage 2b sends is `layers.clear`, on an OBSERVED `html` producer — for unknown / empty /
  non-html the row shows honest occupancy and NO control, because today's bridge refuses
  those Clears (R-015) and an enabled button must never invite a click that only rejects;
  the b1 blind-Clear and the non-html carve-out are task 4.3 (stage 4), so the spec
  scenario _"Silence shows unknown; Clear stays available with an honest confirmation"_ is
  satisfied only at stage 4. **(D6)** 5.1b's divergence hint is deferred to stage 3 (see
  5.1b). **(D7)** 5.5's "import+load lands on the exact slot" E2E moves to stage 3 beside
  5.3. Owes a Linux `gate:e2e` (the Windows run is a signal, non-authoritative for render
  geometry) and the stage-2b hardware pass (7.3).
- **Stage 3** = 5.3 — the one-action import+create+load chain (+ the D7 E2E stage 2b
  deferred here). **Shipped (this PR).** Honest notes: **(D9)** the chain is offered on an
  OBSERVED-EMPTY slot only — the load's adopt-`CLEAR`, and a real `CG ADD`'s own stage
  replace, would otherwise hide a destructive step behind a constructive label (d1); a
  non-empty fixed slot is cleared by the operator's own explicit step, which is task 4.3.
  **(D10)** the bound-row ITEM verb set (Take/Update/Stop/Clear) is NOT here: design (f)
  requires it to be the STACK row's own declarations, which are currently inline in
  `StackRow.tsx`, so mirroring them means extracting that declaration point — a change to
  the DYNAMIC row's surface, outside 5.3's "import → bind → load". The bound row does its
  stage-3 job meanwhile (it NAMES the bound item) and grows no private copy of those verbs;
  the item's verbs are on its stack row. **(D11) READ BEFORE MERGING:** a fixed binding is
  now REACHABLE, and `#slotForRestore` still falls through to allocate-elsewhere for one —
  a restored fixed item would come back on a DYNAMIC layer, which R-021 forbids. That is
  task 3.1 (stage 4), deliberately not folded in here; stage 4 must land before this ships
  to an installation that restarts its bridge. Owes a Linux `gate:e2e` (the Windows run is
  a signal, non-authoritative for render geometry) and the stage-3 hardware pass (7.3).
- **Stage 4** = 3.1–3.3, 4.3, 4.4 — restore branch + `restore-blocked` + the fixed-row
  Clear carve-out. **Shipped (this PR).** Honest notes: **(D12)** the restore branch turned up
  a SECOND defect beside the one D11 predicted — B-114 REPLACED `reserve()` with
  `bindFixed()` instead of branching, so every DYNAMIC retained coordinate had silently lost
  its exact-slot restore and fell straight through to `#allocate()` (the
  wrong-layer-occupancy hazard `#slotForRestore`'s own contract forbids). Both doors are now
  reached through an explicit `isFixed` test, and §d test 5 pins both halves; it was
  verified FAILING before the fix. **(D13)** `restore-blocked` is a RECORDED decision
  (`#restoreBlocked`, written only in `#decidePendingRestores` against a HEARING tap) and
  never re-derived from `observed` — the same shape from a BLIND tap means `unverified`,
  and collapsing the two would let silence claim knowledge (B-093). **(D14)** 4.3's
  graceful-Stop half needs no RECON to be SAFE: STOP is withheld wherever the observation is
  not `html`, so `CG STOP` is never addressed to a foreign producer. The probe itself
  (what real 2.3.2 does with `CG STOP` on a non-html layer) is STILL UNRUN and stays owed
  with 7.3. Owes a Linux `gate:e2e` and the stage-4 hardware pass (7.3).

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

- [x] 3.1 `#slotForRestore` + `#decidePendingRestores` (`caspar-runtime.ts` — the
      `:814-824` hint was stale; locate by symbol): fixed retained slot → NEVER
      `#allocate()` fall-through; bindable → same-slot `bindFixed` + standard B-092
      deferred adopt-vs-re-ADD; foreign observed → the named `restore-blocked` state (d1),
      zero wire traffic, honest row state.
      **Where the two halves landed, and why they are not in one place.** The fall-through ban
      is a SLOT-SELECTION rule and lives in `#slotForRestore`; the foreign-observed branch
      is a DECISION and lives in `#decidePendingRestores`, because at restore time CasparCG
      may not be reachable at all and occupancy is not yet knowable. (The design's
      "quarantined" wording predates `quarantine()` becoming a no-op on fixed slots — stage 1
      recorded that stage 4 would read the TAP instead, and it does.) Keeping the item in
      `#pendingRestore` while blocked is what makes d1's second exit work with NO separate
      un-block mechanism to drift from the first.
      A third case the design did not name — the retained fixed slot already bound by another
      restored item — is SKIPPED with its own `fixed-slot-taken` reason (B-108), never
      allocated elsewhere.
- [x] 3.2 Tests 1–5 from design.md §d — `tools/caspar-bridge/tests/fixed-restore-branch.integration.test.ts`
      (same-layer adopt; `restore-blocked` on foreign with the producer surviving and zero
      CLEAR; own-html adopt without CLEAR; silent-slot deferral; dynamic fall-through
      regression, plus the `fixed-slot-taken` skip). Asserted on the WIRE — the mock's NDJSON
      trace: which layer a `CG ADD` addressed, and that no `CLEAR` was sent at all — never
      on internal bookkeeping, because the failure being prevented is a broadcast one.
      **Verified failing first:** with ONLY `caspar-runtime.ts` reverted, 6 of the 9 fail,
      including the dynamic regression. The 3 that pass are the ones B-114 had already made
      true (free-slot same-layer restore, own-html adopt, blind-tap deferral), which is the
      honest result rather than a tuned one.
- [x] 3.3 `restore-blocked` lifecycle tests (design.md §d test 8): entered on
      foreign-occupied restore; exits via explicit operator Clear + take AND via the foreign
      producer vacating (observed empty → deferred re-ADD); never via allocate-elsewhere or
      auto-clear; and a REMOVED item takes its block with it. Renderer half in
      `apps/runtime/tests/layerRow.restoreBlocked.dom.test.ts`: the row names the retained
      item and the observed occupancy while blocked; **BLOCKED outranks the item's own
      (usually `on-air`) status**, which is the assertion the whole state exists for — a row
      that published the retained status would wear the broadcast colour over a layer we have
      just proven is not carrying it; every verb that would COMMAND the layer is held behind
      ONE shared reason; and CLEAR/REMOVE stay live, because CLEAR is the documented way OUT
      and holding the escape hatch here would be fail-STUCK rather than fail-safe.

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
- [x] 4.3 Fixed-row hard Clear per (b)/b1: confirm-gated always; under OSC silence the
      confirmation dialog states occupancy is unknown AND names the layer number; outside the
      fixed range R-015's silence-refusal is untouched.
      The MECHANISM shipped early, with R-028 part B: `clearBankLayer` is gated by STRUCTURE
      (in the declared bank AND not reserved) rather than by observation, which IS b1, and its
      guard is already attacked from every angle in `clear-bank-scoped.integration.test.ts`.
      What stage 4 adds is the DIALOG's honesty. Allowing a blind clear is only safe if the
      confirmation does not imply the console looked, so the sentence now branches on what the
      wire actually said — unknown → says outright that it CANNOT tell · producer → names the
      KIND (the fact that stops a wrong click, and the `restore-blocked` row's own case) ·
      empty → says so, because warning about destroying a graphic on an observably free layer
      is how an operator is trained to click through the warnings that matter. Every branch
      names the LAYER NUMBER, which under silence is the only fact they can carry to a rack.
      Graceful STOP is offered only for an observed `html` producer: a blocked row's STOP is
      held, so `CG STOP` is never addressed to a foreign producer.
      ⚠ **The RECON is STILL UNRUN** (what real 2.3.2 does with `CG STOP` on a non-html
      layer) — no hardware this week — and it stays owed with 7.3. Nothing shipped here rests
      on its answer; it could only ever let STOP be WIDENED, never narrowed.
- [x] 4.4 Test 6 from design.md §d — the dialog's three branches in
      `apps/runtime/tests/layerRow.clearConfirm.dom.test.ts`, and the BOUNDARY in
      `tools/caspar-bridge/tests/clear-bank-scoped.integration.test.ts`: both doors exercised
      under ONE silence, one layer apart (in-bank 70 clears; 69 — one below the floor and NOT
      reserved, so it isolates the membership half of the guard — is still refused `foreign`),
      and the same pair again with a foreign producer OBSERVED. Deliberately one test rather
      than two files: two passing tests in two places is precisely how these two rules would
      drift apart without anything going red. C-012's Stop/Clear split is what makes the
      permission safe and is asserted on the row (STOP held for a non-html observation, CLEAR
      not).

## 5. Runtime UI

- [x] 5.1 (stage 2b) Fixed-bank panel: permanent rows (alias + layer number), occupancy
      honest incl. explicit UNKNOWN ("no signal — occupancy unknown", never 'empty') and the
      D8 dead-link mask (link `disconnected` ⇒ every row displays unknown over the frozen
      snapshot, the B-087 class); panel above the stack, bounded (`appShell.fixedPanel` —
      the page never scrolls), renders NOTHING with no bank. Honest note: the
      `restore-blocked` row state is STAGE 4 — it rides the `binding` field (4.2b), which
      the wire cannot populate until stage 3, so no row can display it yet.
- [x] 5.1b (stage 2b, doc half) Install doc: the b′ deployment invariant — all stations
      sharing one CasparCG declare the SAME fixed bank — documented in
      `docs/operator-guide/README.md` ("Fixed layers") and cross-referenced from the
      `fixed-layers-store.ts` module header, beside the config it constrains (the C-009
      operator-contract class). **DEFERRED to stage 3 (D6):** the "repeated foreign html ⇒
      soft divergence hint" half — until `binding` can distinguish our own item from
      another station's, every html producer in the bank is indistinguishably "foreign",
      so the hint would fire on every occupied row and carry no information.
- [x] 5.2 (stage 2b) One `fixedRowActions(slot, deps): RowAction[]` declaration point
      (R-013 pattern); buttons + context menu from the same list, confirm gate attached at
      declaration time (`withConfirm`, with the `cancelled` AsyncResult path so a cancel is
      neither a success flash nor an error toast). Stage 2b's ONLY verb is the confirm-gated
      layer CLEAR on an OBSERVED html producer (D1 — see the STAGE MAP note); the
      `binding !== null` branch returns [] naming task 5.3.
- [x] 5.3 (stage 3) Row import+load chain: pick `.vcg` → library import (stays for reuse) →
      item bound to the exact slot → Load; Load-from-library variant. The exact-slot path is
      `LayerManager.bindFixed` behind the new `fixedLayers.load` channel — never `reserve()`
      (which refuses fixed slots) and never `#allocate()`; everything after the slot is
      resolved is the SHARED `#loadOnto` the dynamic `load()` runs, so the adopt-CLEAR, the
      B-100 single reachability read and the B-039 pre-roll can never drift between the two.
      The import step REUSES the Library's own flow (`importVcgFile`, extracted, not forked)
      and the item seed (`newItemFields`), so the same bytes register and seed identically
      whichever button ran; the library re-lists on any import (`libraryChanged`), so "it
      stays there for reuse" is visible. `binding` on the wire is now real, from the
      LayerManager's `fixedBinding` + the item→slot map (both halves or `null`), and Remove
      drops it via `#releaseSlot` while KEEPING the fence. Refusals: `not-fixed`
      (never a door onto an arbitrary layer), `slot-bound` (rebinding is Remove-then-load,
      never one compound step), `unknown-template`. Carries 5.5's D7 E2E
      ("import+load lands on the exact slot"). See the STAGE MAP's D9/D10/D11 notes for what
      this stage deliberately does NOT do.
- [x] 5.4 (stage 2b) DOM tests: verb split across the four observation cases; menu/button
      parity asserted by COMPARING the two surfaces; unknown-occupancy display; the D8
      dead-link mask; confirm-accept sends exactly one `layers.clear`, cancel sends none
      (no toast, no success flash); panel renders nothing with no bank; config modal
      (read-only channel/start, refusal shows mapped reason + bridge message).
- [x] 5.5 (stage 2b, renderer half) E2E (`fixed-layers.spec.ts`, + the two-panel column in
      `panel-scroll.spec.ts`): fixed rows render with aliases and layer numbers; unknown
      reads as unknown and never as empty; only the observed-html row offers a verb (per
      D1 the non-html and unknown cases offer NONE until 4.3); the html row's Clear is
      confirm-gated and mirrored in the context menu. **MOVED to stage 3 (D7):**
      "import+load lands on the exact slot" — beside task 5.3, which builds the chain it
      tests. (Linux `gate:e2e` owed — recorded in 7.2 and the PRD note.)
- [x] 5.6 (stage 2b) Bank config modal, opened from the panel header — its OWN modal, NOT a
      `ServerSettingsPanel` section (connections `set-config` is on-air blocked and
      `fixedLayers.set-config` deliberately is not, design (e); co-locating them invites
      the operator to assume one rule governs both). Scope: `count` + `aliases`;
      `channel`/`start` read-only (validator refuses changing them mid-session). Refusals
      surface the mapped reason (ONE map keyed off `FIXED_LAYERS_SET_CONFIG_REASONS`,
      beside — not inside — `errorCodeMessage.ts`) plus the bridge's `message` naming the
      specifics. Verified before building: `set-config` DOES accept creating a bank from
      null (a pure install), but the modal is only reachable with a bank declared — the
      panel renders nothing without one.

## 6. Docs + PRD

- [x] 6.1 Engine doc-sync where contracts changed; `docs/prd/runtime.md` R-021 → `[~]` with an
      honest status note (hardware verification owed: on-air behavior changes). Stage 4's
      status note is in place, naming what landed, the D12 defect found in passing, and BOTH
      debts (Linux `gate:e2e`, hardware 7.3 incl. 4.3's unrun RECON). Engine doc-sync is a
      NO-OP for this stage, verified rather than assumed: none of the five engine docs
      (`docs/engines/overview.md` + the four deep-dives) covers the bridge at all — grep for
      `caspar-runtime` / `caspar-bridge` / `restore` across `docs/engines/` returns nothing.
      The contracts that DID change are documented where they live: the wire field on
      `FixedSlotStateSchema`, and the branch on `#slotForRestore` / `#restoreBlocked`.
- [ ] 6.2 Cross-refs: R-023 binds shortcuts to the (f) declaration point; R-024/C-002 use the
      (h) binding shape.

## 7. Gate

- [x] 7.1 `pnpm openspec validate runtime-fixed-layers --strict` — valid.
- [x] 7.2 Full green gate (uncached) + the runtime E2E suite. Windows E2E: 78/78 green,
      including the two new `restore-blocked` specs in `fixed-layers.spec.ts`.
      ✅ **THE LINUX `gate:e2e` IS DISCHARGED** — https://github.com/yasermostafaee/cg/actions/runs/31760214543
      (run 31760214543, `dev` HEAD `6ee4c5d4`, which CONTAINS this change's `e326a962`).
      `conclusion: success`, `status: completed`, and the **E2E (Playwright) job RAN** —
      checked as its own `conclusion: success` and not merely as "a run exists", because a
      SKIPPED `e2e` (the P-029 case) is a statement about the diff and no evidence at all
      about the suite. This stage touches `apps/runtime/src/renderer/**` (`rowState.ts`,
      `layerRowActions.ts`, `LayerRow.tsx`) and `tests/e2e/**`, both matching
      `UI_RENDER_PATTERNS`, so the debt was real. The Windows run (78/78) remains a signal
      only and discharged nothing.
- [ ] 7.3 Real-hardware pass on CasparCG 2.3.2 (fixed-slot load, restore-in-place, foreign
      occupancy handling) before archive — on-air behavior throughout.
