# Tasks — fix-pen-curve-and-hit-test (B-053 / B-054 / B-055)

## 1. Recon (red-first, against the live store on post-B-051 main)

- [x] B-053: red tests — a 2-screen-px slip at scale 0.5 places a smooth anchor (scene-px guard);
      drag-out-and-back keeps the excursion's handles (incremental, never reset).
- [x] B-054: `insertOnSegment` is corner-only; the handle-pulling fallback REFUTED (corners render
      no handle dots; `dragHandle` never sets smooth).
- [x] B-055: red tests — bulge outside the anchor polygon misses; concavity inside it false-hits;
      an open two-anchor arc grabs only at its straight chord; degenerate-bbox axis collapse found
      by the arc test.
- [x] Free B numbers verified (B-051/B-052 landed in #270) → B-053, B-054, B-055.

## 2. Implementation

- [x] `pen-draw.ts` (B-053): `PEN_SMOOTH_PX = 3` SCREEN px; live corner/smooth preview during the
      hold; final decision at pointer-UP clears jitter-set handles; anchor captured by reference
      and re-validated (finish/cancel/stale-drop safe); previous anchor's handles never touched.
- [x] `PathEditor.tsx` (B-054): segment pointer-down inserts the corner, drag before release pulls
      mirrored smooth handles live; at-release decision; ONE history boundary at pointer-up.
- [x] `hit-test.ts` (B-055): flatten each segment's exact rendered cubic (16 steps) into the
      ray-cast + grab-margin tests; display mapping mirrors the runtime viewBox's `max(bbox, 1)`
      clamp (degenerate-axis fix).

## 3. Tests

- [x] Unit `pen-smooth-placement.test.ts` (red pre-fix): slip → corner at low zoom;
      drag-out-and-back → corner; genuine drag → smooth with mirrored handles; corner after
      smooth keeps the previous handles.
- [x] Unit `path-hit-curved.test.ts` (red pre-fix): bulge hits; concavity misses; interior hits;
      open curved path grabs at the real curve; straight-path regression guard.
- [x] Unit `path-tools.test.ts` extended: an inserted smooth anchor round-trips
      `normalizePathPoints` (handles/ids/positions preserved); a corner insert carries no handles.
- [x] E2E `pen-curve-edit.spec.ts`: (1) corner–smooth–corner–corner with 2-px click slips → final
      segment is a straight `L`, exactly two `C`s; (2) plain segment click inserts a corner (no
      curve), segment click-DRAG inserts a smooth anchor (path gains a `C`); (3) a two-anchor
      closed curved lens selects from a click 15 px off its chord (the old anchors-only test only
      selected near the chord).

## 4. Docs

- [x] PRD `docs/prd/bugs-designer.md`: B-053 (medium), B-054 (medium), B-055 (high) filed in
      canonical format with recon findings, `[~]` with branch + change dir.
- [x] OpenSpec MODIFIED ×3 on `designer-path-element` (placement at pointer-up; segment
      click-drag smooth insert; curved-outline hit-test); `--strict` valid.
- [x] Engine doc-sync: canvas README pen placement + hit-test sections.

## 5. Gate + ship

- [x] Uncached gate (`pnpm turbo run typecheck lint test build --force`, 15/15 + root
      `pnpm format:check` green); `pnpm test:e2e` (191 passed); `pnpm openspec validate --all
--strict` (34/34).
- [x] Preview served (`vite preview`, fresh dist); PAUSED with no commit/push. Owner CONFIRMED
      2026-07-10: (1) a corner after a smooth drag stays a corner even with mouse slip and the
      prior anchor's curve is intact, (2) drag-on-segment inserts a smooth point that curves live
      (plain click stays a corner), (3) a curved shape selects from anywhere — bulges hit,
      concave cut-aways don't false-select, center still works.
- [ ] Conventional commit(s), push, verify the remote head, give the compare URL. `[x]`/archive
      after owner confirm + merge.
