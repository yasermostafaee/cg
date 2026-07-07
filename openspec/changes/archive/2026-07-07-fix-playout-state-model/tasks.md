# Tasks — Prescriptive playout verbs (B-039)

## 1. Command seam

- [x] `tools/caspar-bridge/src/command-builder.ts`: `load` emits `CG ADD` with the
      play-on-load flag **OFF** (`0`, was `1`). Update the method/seam comment (load
      = loaded-not-playing; take's `CG PLAY` plays); note the cycle needs on-hardware
      re-validation.

## 2. Prescriptive bridge layer

- [x] `CasparRuntime`: add a `#loaded: Set<itemId>` producer-existence map next to
      `#slots`.
- [x] `load`: allocate + `CG ADD` (play-on-load off) + reserve slot + add interest;
      mark `#loaded` on a successful add.
- [x] `take`: if `#loaded` has the item → `CG PLAY`; else (no producer, e.g. after
      out) re-issue `CG ADD` (template id + current fields from the Reconciler) then
      `CG PLAY`, and mark `#loaded`.
- [x] `out`: `CLEAR` then clear `#loaded` for the item; KEEP the slot reserved +
      interest + allocation (the item is still on the stack, idle).
- [x] `remove`: unchanged behavior + also clear `#loaded` (full removal already drops
      `#slots`, interest, allocation).
- [x] Confirm failover consistency: `#slots` / `#loaded` are server-agnostic;
      mirror-sync fans out `CG ADD`/`CLEAR` to both, so producer existence matches on
      each — no extra handling.

## 3. amcp-mock producer lifecycle

- [x] `LayerState` gains `onAir: boolean`. `CG ADD` sets `onAir` from the play-on-load
      arg; `CG PLAY` sets `onAir` only when a producer is loaded (empty layer →
      observable no-op, still `202`); `CLEAR` / `CG REMOVE` reset producer + `onAir`.
- [x] Expose `onAir` via the existing `layerState(slot)` accessor.

## 4. Tests

- [x] `command-builder` test: `load` produces `CG ADD … 0 …` (play-on-load off).
- [x] `amcp-mock` tests: load-not-playing; `CG PLAY` on a loaded producer → on air;
      `CG PLAY` on an empty layer → no-op; `CLEAR` destroys.
- [x] Bridge integration test: load (no auto-play) → take (plays) → out (destroys) →
      take again (re-ADDs empty→html then plays, renders) — asserting mock producer +
      on-air state and that a second `CG ADD` was issued.

## 5. Gate

- [x] Full green gate UNCACHED (`turbo … --force`) for `@cg/caspar-bridge`,
      `@cg/amcp-mock`, `@cg/runtime`: `format:check` + `typecheck` + `lint` + `test` +
      `build`.
- [x] `pnpm openspec validate fix-playout-state-model --strict`.
- [x] Commit + push + open a PR. **B-039 stays `[~]`.**

## DO NOT close B-039

After merge the operator validates the take→out→take cycle on real CasparCG 2.3.2
(load doesn't auto-play; take renders; out clears; a second take re-renders). Only
after that report does B-039 flip to `[x]`. Do NOT flip it here; do NOT archive.
