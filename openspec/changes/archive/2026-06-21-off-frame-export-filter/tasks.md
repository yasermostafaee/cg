# Tasks — Off-frame export filter (D-071 Phase A)

## 1. Filter

- [x] 1.1 New `renderer/state/off-frame.ts`: `isFullyOffFrame(el, ancestors, W, H)` (rotated AABB
      via the 4 corners + static ancestor transforms; strict-outside; degenerate/non-finite ⇒
      keep) + `dropFullyOffFrameForExport(scene, scoped)` with the static / static-ancestor /
      repeater-template guards, recursing only static containers, per-doc vs its own resolution.
- [x] 1.2 Call it in `scopeSceneToComposition` (`scene-doc.ts`) AFTER the D-086 closure scope.
      `editSceneOf` + Save untouched (export-only).

## 2. Tests

- [x] 2.1 Unit (`tests/off-frame-export-filter.test.ts`): static off-frame DROPPED + asset not in
      `collectImageElements`; `editSceneOf` keeps it; KEEPS — (a) animated slide-in, (b)
      partially-on, (c) inside animated container, (d) inside repeater template, (e) edge-touching;
      rotated fully-off DROPPED + rotated-corner-on KEPT; `isFullyOffFrame` boundary + degenerate.
- [x] 2.2 E2E (`tests/e2e/off-frame-export.spec.ts`): a static off-frame element absent from the
      broadcast preview + the exported HTML but present on the canvas; an animated (keyframed)
      off-frame element KEPT in preview + export.

## 3. Docs

- [x] 3.1 README note (`apps/designer/src/renderer/state/README.md`) on the export-only off-frame
      filter and the edit-vs-export split.
- [x] 3.2 PRD: file `## [~] D-071 — Off-frame pasteboard, export-excluded (Phase A: export filter)`
      in `docs/prd/designer.md`; note Phase B = editor pasteboard.

## 4. Gate

- [x] 4.1 Full green gate (turbo + unit) for `@cg/designer`, uncached once — 14/14 tasks
      (`--force`); 508 unit tests pass (incl. the 11 new off-frame tests).
- [x] 4.2 `pnpm test:e2e` green — 62 passed (incl. the 2 new off-frame specs).
- [x] 4.3 `pnpm openspec validate --all --strict` valid (24/24); `pnpm format:check` clean.
- [x] 4.4 Conventional commit on `feat/D-071a-export-filter`; push + PR + watch CI green + merge.
