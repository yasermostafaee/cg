# Tasks — retention models the row's STATE (B-107 / B-109 / B-108)

## 1. The model (schema first)

- [x] 1.1 `@cg/shared-schema` `runtime/item-state.ts`: add `RetainedAirStateSchema` —
      `'on-air' | 'loaded' | 'cleared' | 'error'` — documented with what each one licenses the
      restore to do.
- [x] 1.2 `RetainedStackItemSchema`: `played: boolean` → `state: RetainedAirStateSchema`, plus
      `errorCode: z.string().optional()`. `slot` / `position` unchanged (the OPEN axis 6.9d lands
      on).
- [x] 1.3 ONE canonical `retainedStateFor(status): RetainedAirState` exported from the schema
      package. Every consumer calls it; nobody re-derives the list (golden rule 6).
- [x] 1.4 `isRetainedOnAir(state)` for the derived play evidence, so `played` exists as a
      computation and never as stored state that can disagree.
- [x] 1.5 Unit tests: every `StackItemStatus` maps to exactly one state; the ambiguous on-air set
      still resolves to `on-air`; the map is total (a new status forces a decision).

## 2. The bridge (`@cg/caspar-bridge` + `@cg/caspar-client`)

- [x] 2.1 `Reconciler.restoreItem` takes the retained `state` (+ `errorCode`) instead of `played`,
      and seeds: `on-air` → `playing` + acked (unchanged), `loaded` → `loaded` (unchanged),
      `cleared` → `idle`, `error` → `error` with its code and an ack so the row does not spin.
- [x] 2.2 `caspar-runtime.ts` `restore()`: park a pending restore ONLY for a restorable state.
      🔴 A `cleared` / `error` item is never entered into `#pendingRestore`, so
      `#decidePendingRestores`' silent-layer re-ADD branch is UNREACHABLE for it — the fix is the
      absence of a path, not a guard.
- [x] 2.3 `restore()` still reserves the retained slot and binds OSC interest for a `cleared` row
      (an `out` retains its slot — B-109's own note), so the row keeps its layer identity and
      B-114's fixed binding survives.
- [x] 2.4 `restore()` returns `skipped: Array<{ itemId, reason }>` with
      `'already-held' | 'unknown-template' | 'no-layer'`. The bare count is REPLACED, not
      supplemented — two shapes of the same fact is the second-derivation trap.
- [x] 2.5 `@cg/shared-ipc` `StackRestoreChannel` response schema follows 2.4.
- [x] 2.6 ⚠ Keep out of phase 5's regions where reasonable (`#liveLayers`, the sweep,
      `#reconcileForeignQuarantine`) — report it if not.

## 3. The browser (`@cg/runtime`)

- [x] 3.1 `StackRetentionStore.toRetained` uses `retainedStateFor` and carries `errorCode`;
      `hydrate()` validates `state` (a record without a usable state is dropped, per the
      reads-never-throw doctrine).
- [x] 3.2 `WebSocketRuntime.#retainedProjection`: `on-air` → `unverified`, `loaded` → `loaded`,
      `cleared` → `idle`, `error` → `error` + `errorCode`. **B-107's display fix.**
- [x] 3.3 Assert the projection ROUND-TRIPS: every projected status maps back to the same retained
      state, so displaying offline can never corrupt the retention.
- [x] 3.4 `#resync` consumes the restore result instead of discarding it, filters the benign
      `already-held`, and publishes the rest.

## 4. The skipped surface (B-108) — minimal, 6.9e absorbs it

- [x] 4.1 A subscribable "rows not restored" report on the runtime bridge contract, and its mock
      parity entry.
- [x] 4.2 One notice in the Layers panel: how many rows did not come back and why. Dismissible.
      Nothing when the only skips are benign.
- [x] 4.3 DOM test for the notice, including the no-false-alarm case.

## 5. Tests

- [x] 5.1 `stack-retention.test.ts`: retention carries the state; a CLEARed row and a pre-rolled
      row are DISTINGUISHABLE; the offline projection is honest for `error` and `cleared`.
- [x] 5.2 🔴 **The B-109 wire proof** — a bridge integration test against the mock CasparCG's
      NDJSON trace: CLEAR a live graphic, kill the bridge, restore into a fresh one, assert NO
      `CG ADD` for that layer. Asserted on the AMCP BYTES, not on bookkeeping.
- [x] 5.3 The B-107 counterpart in the same integration file: an errored row restores as errored.
- [x] 5.4 FROZEN, and must still pass unchanged in substance: the bridge-only restart keeps ON AIR
      with no CLEAR; the bridge+CasparCG restart re-ADDs and rests at `loaded`.
- [x] 5.5 `MockRuntime` parity guard still green with no mock change (state the reason in the
      proposal, and verify rather than assume).

## 6. E2E (mandatory — real bridge, real death and restart)

- [x] 6.1 Errored row + bridge death → does NOT read READY.
- [x] 6.2 Deliberate CLEAR + bridge restart → does NOT return to air.
- [x] 6.3 A genuine on-air / loaded item + bridge restart → DOES come back.
- [x] 6.4 Anything skipped is visible, with its reason.
- [x] 6.5 `pnpm test:e2e` run locally — see 8.2 for exactly what it reported and what was done
      about it. Not claimed as a clean green: it is not one, and CI is the authority anyway.
- [ ] 6.6 🔴 **Linux `e2e` debt — OWED, NOT DISCHARGED.** Discharged ONLY by a COMPLETED, GREEN
      `e2e` job on GitHub Actions for the commit carrying this change. A green Windows run does not
      discharge it and a cancelled or SKIPPED run is not a result. **Write the run URL here, beside
      this box.**
      Run URL: _(pending — the push that carries this change has not had its CI run read yet)_

## 7. Docs

- [x] 7.1 `docs/prd/bugs-runtime.md`: B-107 / B-109 / B-108 → `[~]` with the change dir; record
      the deliberate `idle`-renders-as-READY limit in B-107's notes.
- [x] 7.2 Cross-reference from `live-source-multibox` task 6.9d to the model it now attaches to.
- [x] 7.3 `pnpm openspec validate runtime-retention-state --strict`.

## 8. Gate

- [x] 8.1 Plain `pnpm gate`, green, uncached.
- [x] 8.2 ⚠ **`pnpm test:e2e` — each suite GREEN ALONE (Runtime 72/72, Designer 255/255); the
      co-scheduled turbo run shows ONE flake per suite, in specs this change does not touch
      (`clock`, `pixel-grid`, `trimmed-content-start`, `rehearse-layout` — a different one each
      run).** That is the local Windows load class CLAUDE.md documents (`B-098`/`B-073`), and the
      answer taken was the BOUND, not a longer timeout: the new spec is `mode: 'serial'` and its mock
      CasparCG emits at 10 Hz rather than 40. CI runs each suite at `workers: 1` on Linux and is the
      authority.
