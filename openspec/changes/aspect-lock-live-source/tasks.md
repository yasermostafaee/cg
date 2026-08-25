# Tasks — the Live Source aspect lock (`D-155`)

## 0. Preconditions (already landed)

- [x] 0.1 `B-175` — the ONE read side (`renderedTransformAt`), so the lock constrains the rect the
      author can see rather than the authored one. Landed on `dev`; the precondition is pinned by
      _"the aspect the lock will constrain is the DRAWN one"_ in
      `apps/designer/tests/arrangement-gizmo-read.dom.test.ts`.

## 1. The constrained quantity — ONE definition

- [x] 1.1 Export whatever shape the gesture needs from
      `apps/designer/src/renderer/features/inspector/aspect-presets.ts`. ⚠ Do NOT add a second
      spelling of "the aspect of this box" to `geometry.ts`: a local `w / h` ignores non-uniform
      `scale` and would call a plate 16:9 that renders at another shape entirely.
- [x] 1.2 The solve is for `size` alone — `scale` is never written by a resize.

## 2. The gesture

- [x] 2.1 Constrain `wNew` / `hNew` in `computeRectResize` BEFORE the ratios are taken. ⚠ If you
      find yourself editing the position solve, stop — the fixed corner will drift.
- [x] 2.2 EDGE handles: the free axis follows the pointer, the other is derived.
- [x] 2.3 CORNER handles: project the pointer onto the constrained diagonal through the FIXED
      corner. Add the comment recording why the dominant-axis rule was rejected — ⚠ with the
      CORRECTED reason (the "it jumps" argument is false; see 5.2 and the spec delta).
- [x] 2.4 Propagate the `MIN_SIZE` clamp: if the driving axis clamps, recompute the derived axis
      from the CLAMPED value.
- [x] 2.5 Add the comment at the drag path stating that `fitToAspect`'s bottom-edge FLIP is
      deliberately NOT ported — it is right for a one-shot button and wrong for a live gesture.

## 3. The toggle and the FIT button

- [x] 3.1 Lock toggle beside the aspect select in `StyleSection`'s `AspectRow`, ON by default when
      `expectedAspect` is set.
- [x] 3.2 Session preference, per author, alongside `snappingEnabled`. No schema field, no
      migration, no export path.
- [x] 3.3 NO keyboard override. Record which bindings took both candidates: `Shift` is the
      snap override in resize/rotate (`Gizmo.tsx`), `Alt` is the snap override in the move
      gestures (`CanvasOverlay.tsx`, `D-122`).
- [x] 3.4 Re-word FIT as a REPAIR, and make the already-matches state read as SATISFIED.

## 4. The CELLS fields

- [x] 4.1 Lock the `CELLS` number fields in `ArrangementsSection` to the **composition's resolution
      aspect**. ⚠ NOT to any plate's `expectedAspect` — read the
      `designer-multibox-arrangements` delta before writing a line of this.
- [x] 4.2 A box composition with no usable resolution leaves the fields exactly as they are today.

## 5. Tests — RED first, chain rebuilt before each reading

- [x] 5.1 Edge drag on a 16:9 plate: the effective aspect stays within `ASPECT_TOLERANCE` at
      EVERY emitted rect, not only the last.
- [x] 5.2 ⚠ **CORRECTED AT IMPLEMENTATION.** This read: _"Corner drag whose pointer path CROSSES
      the diagonal emits no discontinuity. This is the test that proves the projection rule."_
      **It does not prove it** — measured, the dominant-axis rule is CONTINUOUS at the crossover
      (`w / ratio === h` makes both its branches agree), so a continuity assertion passes for
      BOTH rules. The choice is pinned by VALUE instead, off the diagonal where they disagree
      (`1301 × 732` vs `1600 × 900` at extents `(1600, 200)` for a 16:9 lock). The continuity
      test is KEPT as the weaker property it actually is — a third solve could still be
      discontinuous, and a box that snaps mid-drag is what an author would report.
- [x] 5.3 The fixed corner stays put under rotation AND non-uniform scale.
- [x] 5.4 `MIN_SIZE` clamping keeps the aspect.
- [x] 5.5 A plate with no `expectedAspect`, and a non-Live-Source element, resize
      byte-identically to today.
- [x] 5.6 The lock OFF resizes byte-identically to today.
- [x] 5.7 A cell edit keeps the composition's resolution aspect, including for a box holding a
      plate that does not fill its composition.
- [x] 5.8 ⚠ 5.5 and 5.6 are the ones that will be written as "it probably still works".
      `computeRectResize` is shared by every element kind and by `D-110`'s keyframed-path morph
      rect — assert the byte-identity, do not intend it.

## 6. Gate

- [x] 6.1 Full green gate for `@cg/designer`.
- [x] 6.2 Linux `gate:e2e` DISCHARGED:
      **https://github.com/yasermostafaee/cg/actions/runs/32834755257** — for `2b91f13f`, which
      CONTAINS this change's commit `4c4880c0`. `E2E (Playwright)` job conclusion `success`, and
      its `E2E` STEP ran (`success`) rather than being skipped, which is what the discharge rule
      requires — a green run whose `e2e` was SKIPPED proves nothing about rendering. The `e2e`
      job is whole-tree rather than diff-scoped, so a later `dev` HEAD containing the change is
      a legitimate discharge for it.
- [ ] 6.3 ⚠ STILL OWED — an E2E mapping each `#### Scenario` to Playwright steps. The run above
      discharges the LINUX-RUN debt for the code that shipped; it does not mean scenario-level
      E2E coverage exists. The 26 new unit tests cover the arithmetic and the cell rule; what has
      no browser-level test is the author actually dragging a locked handle and the toggle
      surviving a selection change. Do not read 6.2's tick as covering this.
