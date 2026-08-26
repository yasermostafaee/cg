# Tasks — `fix-overlap-float-residue` (`B-180`)

## 1. Half 2 — the shared noise guard

- [x] 1.1 `packages/shared-schema/src/float-noise.ts` — `noiseFloor(a, b)` and
      `lessThanBeyondNoise(a, b)`, expressed in ULPs relative to the magnitudes compared, with a
      docstring stating in words that this is a NOISE FILTER and not a product tolerance
- [x] 1.2 Exported from `@cg/shared-schema`'s index
- [x] 1.3 `intersects` (`scene-flatten.ts`) rewired to it — copy 1 of 3
- [x] 1.4 `overlaps` (`live-source-preflight.ts`) rewired to it — copy 2 of 3
- [x] 1.5 `rectsOverlap` (`live-source-preflight.ts`) rewired to it — copy 3 of 3
- [x] 1.6 The strict `<` unchanged in all three — only the inputs are guarded

## 2. Half 1 — the drag/resize commit quantise

- [x] 2.1 `quantiseDragCommit(alt)` in `geometry.ts`, as a SECOND gate rather than a widened
      `pixelSnapActive` (see `design.md` §3)
- [x] 2.2 `pixelSnapActive` left untouched, and a test pins that it is
- [x] 2.3 Single-element drag (`CanvasOverlay.tsx`) — quantises the axes no guide claimed
- [x] 2.4 Group drag (`CanvasOverlay.tsx`) — same, on the grabbed anchor
- [x] 2.5 Resize (`Gizmo.tsx`) — the POINTER is quantised, never the solved rect, so `B-175`'s
      fixed-corner pin still holds under rotation / non-uniform scale / a centred anchor.
      `Shift` is that gesture's bypass. ⚠ The first attempt rounded `next.position` / `next.size`
      and broke `arrangement-gizmo-read.dom.test.ts` by 0.108 px — caught by the gate, recorded
      in the code comment and in `design.md` §6
- [x] 2.6 `Alt` bypass preserved on drag; Inspector-typed values untouched

## 3. Tests

- [x] 3.1 `packages/shared-schema/tests/float-noise.test.ts` — the guard itself (10 tests)
- [x] 3.2 `packages/shared-schema/tests/overlap-residue.test.ts` — the `preScale ≠ 1` fixture, with
      the drifted values pinned BY VALUE (`224.94791666666669` vs `224.94791666666666`, delta
      `2.842170943040401e-14`), and mask-hole membership through `intersects`
- [x] 3.3 `apps/designer/tests/overlap-residue.test.ts` — the arrangement pass (`rectsOverlap`) and
      the per-document pass (`overlaps`), flush / 0.01 px / 1 px, at `preScale ≠ 1` and 1
- [x] 3.4 **Each of the three copies proved DISCRIMINATING** — the guard reverted to a bare `<` in
      each, the corresponding test measured RED, then restored and measured green. A test that
      passes either way proves nothing, and two earlier fixtures in this change did exactly that
      (recorded in `design.md` §5)
- [x] 3.5 `apps/designer/tests/canvas-geometry.test.ts` — `quantiseDragCommit`, and the assertion
      that `pixelSnapActive` is unchanged
- [x] 3.6 `apps/designer/tests/inspector-residue-display.dom.test.ts` — the Inspector decision pinned
      by value, including the focus-then-blur that must commit nothing
- [x] 3.7 E2E `apps/designer/tests/e2e/pixel-snap.spec.ts` — a drag at ORDINARY zoom commits whole
      pixels; the same drag with `Alt` held does not; an Inspector-typed fraction survives

## 4. Docs

- [x] 4.1 `D-122`'s PRD entry amended in place with a supersession block — its threshold scope only,
      the `Alt` bypass and free Inspector values re-asserted
- [x] 4.2 `D-122`'s archived change directory (`2026-07-08-add-pixel-snap-drag`) NOT rewritten
- [x] 4.3 `B-180` flipped to `[x]` with the decision, why (a) alone was insufficient, and the
      measured fixture value
- [x] 4.4 Canvas engine doc (`features/canvas/README.md`) updated — it described the gate and
      carried two sentences this change makes false ("below the threshold nothing snaps" and
      "resize-handle snapping is a deliberate follow-up"), both found by the tree-wide sweep

## 5. Gate

- [x] 5.1 Full green gate as plain `pnpm gate` — **89 successful, 0 cached, 89 total**; `format:check`
      clean; `openspec validate --all --strict` 66 passed, 0 failed
- [x] 5.2 Local `pnpm gate:e2e` run (Windows, non-authoritative): designer **275 passed / 12 skipped**,
      runtime **93 passed**, 23/23 tasks. ⚠ One earlier run of the same suite reported
      `@cg/runtime#test:e2e` failed AFTER all 93 tests passed, with
      `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c:94` — a libuv
      teardown abort on Windows, not a test failure; it did not reproduce
- [x] 5.3 Pushed to `dev` as **`f0568bc6`** (`f0568bc62089e88bdfb19a069d4c9b22999e01ae`);
      `git ls-remote origin dev` matches local `HEAD`
- [x] 5.4 **Linux `gate:e2e` DISCHARGED** for the exact commit that carries the change.
      Run: <https://github.com/yasermostafaee/cg/actions/runs/32971549298> — `head_sha`
      `f0568bc62089e88bdfb19a069d4c9b22999e01ae`, `status=completed`, `conclusion=success`.
      **`E2E (Playwright)` RAN**: `12:59:20Z → 13:08:21Z` = **9 m 01 s** (not skipped, not 0 s);
      `Lint · Typecheck · Test · Build` also ran, 10 m 01 s
