# Tasks — re-band the layer map

## 1. The definition and its guard

- [x] 1.1 `packages/shared-ipc/src/layer-bands.ts` — `LAYER_BANDS` (bed / plate / template),
      `FIRST_ALLOCATABLE_LAYER`, `LAYER_BAND_ORDER`, `bandSize`, `inBand`, `bandText`, with the
      floor's REASON recorded beside it.
- [x] 1.2 `assertLayerBands` — floor, overlap, composition order; thrown at module load.
      Overlap is asked BEFORE order so both arms are reachable and each gives the diagnosis only
      it can give.
- [x] 1.3 `packages/shared-ipc/tests/layer-bands.test.ts` — the owner's cut pinned, the band
      sizes, the free span, and the guard exercised against deliberately broken maps.
- [x] 1.4 **PLANTED RED, measured.** `bed: 50-59 → 50-65` in the real definition:
      `LayerBandError: the bed band 50-65 overlaps the plate band 60-79`, and vitest reported
      **"no tests"** — the module could not be imported, nor could any consumer. Reverted; 16/16.

## 2. Every allocator reads the map

- [x] 2.1 `DEFAULT_FIXED_BANK_START` / `_COUNT` ← the template band.
- [x] 2.2 `DEFAULT_LOW_BANK_START` / `_COUNT` / `MAX_LOW_FIXED_LAYER` ← the bed band; the bed
      schema bounded at BOTH ends (the lower bound is the new half — `.positive()` was the
      band's floor only while the band began at 1).
- [x] 2.3 `FixedLayerBankSchema.count` ceiling ← the template band's SIZE.
- [x] 2.4 `MAX_FIXED_LAYER` ← the template band's end (value unchanged at 99; it is now the
      SAME 99, so a re-cut moves it).
- [x] 2.5 `SUGGESTED_LIVE_SOURCE_LAYER_RANGE` ← the plate band.
- [x] 2.6 The offline mock's seed — bank, aliases, per-layer observations, bindings and live
      plates — addressed by OFFSET off the canonical default rather than absolute numbers.
- [x] 2.7 Station setup's band hint derived from the suggested band (it read "e.g. 10 and 59",
      which is now the playout server's span).

## 3. Dynamic allocation retired

- [x] 3.1 `DEFAULT_LAYER_POLICY = {}`, with the reasoning and what it costs recorded.
- [x] 3.2 `assertPolicyAboveFloor`, run over the shipped policy at module load.
- [x] 3.3 `BridgeOptions.layerPolicy` — a deployment may declare its own ranges.
- [x] 3.4 `#slotForRestore` no longer falls through to `#allocate()`.

## 4. The restore answer, by `isRestorable`

- [x] 4.1 **RED FIRST** — `cleared-row-not-resurrected.integration.test.ts`: an errored row
      returns errored, with NO layer and its reason intact. Watched fail (`restored: 0`,
      `not-declared`) before the change.
- [x] 4.2 `RestorePlacement` carries `slot: CommandSlot | null`. **INTERNAL** — module-local,
      and `StackItemState.slot` / `RetainedStackItem.slot` were already optional, so no wire,
      IPC-schema or persisted-key change.
- [x] 4.3 `#placementWithoutLayer` splits on `isRestorable` — the ONE predicate this file
      already gates `#pendingRestore` on.
- [x] 4.4 The restore loop takes no layer-touching step for a null slot; the blocks that cannot
      see one are narrowed explicitly so the compiler holds the invariant.
- [x] 4.5 `not-declared` skip reason + its operator sentence, reaching the existing persistent,
      dismissible restore banner.
- [x] 4.6 `fixed-restore-branch`'s `#368` test REWRITTEN, not deleted: the exact-slot half
      stands; the "then elsewhere" half now asserts the refusal and its reason.

## 5. Suites moved onto the new map

- [x] 5.1 Bed fixtures translated (+49), counts preserved.
- [x] 5.2 The mock-seeded runtime tests moved with the seed (+10).
- [x] 5.3 Bridge tests that reach the dynamic verb DECLARE their own policy (140 sites); no
      default was added back.
- [x] 5.4 Boot-path fixtures made mutually coherent: beds < band < reservation < bank.
- [x] 5.5 The soak harness declares its own range — it was allocating NOTHING and reporting a
      duration over an empty stack (7 suites, `expected 0 to be greater than 0`).

## 6. Persisted state (regenerate, never migrate)

- [x] 6.1 Old-map fixed-layers file REFUSED at boot by name (`describeOldMapBank`), remedy in
      the message.
- [x] 6.2 The plant's `bridge-fixed-layers.json` preserved as
      `bridge-fixed-layers.old-map-2026-09-14.json`; **nothing under `~/.cg-runtime` deleted.**

## 7. Evidence

- [x] 7.1 `pnpm gate` green — 93/93 tasks, prettier clean, openspec 78/78.
- [ ] 7.2 Linux `gate:e2e` discharge — a COMPLETED, GREEN `e2e` job whose run actually RAN, for
      the commit carrying this change. **Run URL to be written here beside this tick.**
- [ ] 7.3 Plant walkthrough: the bands are only finally real on a server. Rides the walkthrough,
      does not block this change.
