# Tasks — pixel-snap drag and nudge at grid zoom (D-122)

## 1. Spec

- [x] Author the OpenSpec change from the D-122 PRD (each Acceptance bullet → a Scenario):
      `designer-canvas-view` ADDED "Pixel-snap moves to the grid at high zoom" + MODIFIED
      "Snap-while-dragging" (master switch / Alt bypass); `designer-multi-select` MODIFIED
      "Arrow-key nudge" (grid first-snap + Alt); `designer-canvas-viewport` MODIFIED the B-042
      gizmo honesty scenario (reworded the stale "the drag scenario" example).
- [x] `pnpm openspec validate add-pixel-snap-drag --strict`.

## 2. Implement (pure helpers → wiring)

- [x] `geometry.ts` — pure helpers: `pixelSnapActive(zoom, snappingEnabled, alt)`,
      `snapDragToPixel(pos)` (round), `snapNudgeToPixel(coord, signedStep)` (direction-aware
      first-snap, epsilon-tolerant on-grid check).
- [x] `CanvasOverlay.tsx` — `beginDrag` + `beginGroupDrag` `onMove`: Alt bypass; at grid zoom
      snap the position (single) / anchor (group) to whole pixels, superseding smart-guide snap;
      B-027 clamp unchanged; commit unchanged.
- [x] Store zoom mirror: `store-core.ts` `canvasZoom` field + init; `view.ts` `setCanvasZoom`;
      `CanvasArea.tsx` publishes `zoom` via an effect.
- [x] `elements.ts` — `nudgeSelection(dx, dy, { alt })`: at grid zoom snap the anchor's active
      axis to the next integer (first-snap), move the group by the shared delta; clamp unchanged.
- [x] `App.tsx` — arrow-nudge handler: let Alt through (no longer a bail-out) and forward
      `{ alt: e.altKey }`; `preventDefault` still only on a real nudge (guards Alt+←/→ browser nav).
- [x] `ShortcutsModal.tsx` — document the grid snap + the Alt bypass.

## 3. Tests

- [x] Unit (`canvas-geometry.test.ts`): `pixelSnapActive` (below/at/above threshold, snapping off,
      Alt); `snapDragToPixel` (round-half up/down, negatives); `snapNudgeToPixel` (fractional
      Right→ceil / Left→floor, integer + step, Shift magnitude ignored on first-snap, epsilon).
- [x] E2E (`pixel-snap.spec.ts`): at grid zoom a drag lands on integer X/Y; a fractional first
      nudge → next integer (Right and Left); Alt nudge preserves the fraction; below the threshold
      the nudge stays relative.
- [x] Fixture helper `getInspectorNumber(label)`.

## 4. Docs

- [x] Canvas engine `README.md` — drag/snap/nudge interaction section (D-122 pixel snap, Alt
      bypass, grid-zoom-supersedes-smart-guides, the store `canvasZoom` mirror).
- [x] PRD `docs/prd/designer.md` — D-122 → `[~]` with the change dir.

## 5. Gate + owner verification

- [ ] Full uncached gate (`turbo --force` + root `pnpm format:check`) + `pnpm test:e2e` green;
      `pnpm openspec validate --all --strict`.
- [ ] Serve the preview; **PAUSE — owner verifies on their screen** (drag around at 6400% — every
      drop lands on a line; one Alt-drag stays free; one nudge from a fractional start snaps to the
      next integer) BEFORE any commit/push.
- [ ] On "confirmed": conventional commit(s), push, verify the remote head, give the compare URL.
      Flip D-122 → `[~]` → `[x]` only after the owner merges; move its ROADMAP line. No archive
      without owner confirmation.
