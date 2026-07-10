# Pen path edit-mode redesign + curve bounds + context fixes (B-058 / B-059 / B-060 / D-124)

## Why

Owner-decided interaction redesign plus three real defects, all on the pen/path surface:

1. **B-058** — the D-123 anchor "Delete point" renders with one-off chrome (rounder corners,
   larger text, gray hover) instead of looking like the app's other context menus.
2. **D-124 (with Item 2)** — a selected path always shows all anchors/handles, cluttering plain
   selection and making select-drag collide with anchor-edit; segment insertion fires on any
   click near a segment, so adding points isn't intentional.
3. **B-059 (HIGH)** — the selection box and Inspector W/H hug the ANCHORS only: a two-anchor
   curved arc shows a 1-px-tall box while the curve bulges far beyond it (`pathBBox` ignores
   bézier extents). The off-frame export filter shares the defect (a bulge-visible path whose
   anchors are off-frame is wrongly dropped from export).
4. **B-060** — right-click while drawing a pen draft does nothing useful; the owner wants it to
   CANCEL the draft exactly like the drawing-Esc.

## What Changes

- **B-058**: NEW `ui/ContextMenu.css.ts` — the app's context-menu chrome extracted with the
  timeline `LayerContextMenu` values as canonical (backdrop/menu/item/itemDisabled/shortcut/
  divider). `AnchorContextMenu` consumes it (own css deleted; keyboard/aria layer kept);
  `LayerContextMenu.css` re-exports the shared pieces (timeline markup untouched).
- **D-124**: path point-edit MODE — single click selects (box only); DOUBLE-click enters edit
  mode (`editingPathId`, the `editingTextId` pattern): anchors/handles appear, the gizmo hides
  (like inline text editing). Esc or an empty-pasteboard click exits back to plain selection
  (selection kept; the next Esc/empty click deselects as today); selecting anything else or
  switching composition/tool clears the mode. Point INSERTION becomes modifier-gated: the
  segment affordance (copy cursor + hit-surface) exists only while Ctrl (or Cmd) is held, and
  insertion (click = corner, drag = smooth — B-056/B-057 semantics) fires only then.
- **B-059**: NEW `pathVisualBBox` in `@cg/shared-schema` (exact cubic extents via derivative
  roots, same control-point convention the runtime renders) + pure display↔stored mapping
  helpers. The gizmo traces the visual box for paths (the auto-text display-override pattern)
  with resize mapped back through the closed-form inverse; Inspector W/H shows/edits visual
  extents; the off-frame export filter folds the visual box for paths. Storage, runtime render,
  hit-test, `.vcg`/HTML export: byte-identical (design.md records why the global-`pathBBox`
  option is disqualified — `.vcg` integrity/signing forbids migration and animated/rotated
  transforms cannot be exactly re-baked).
- **B-060**: `onContextMenu` on the canvas pointer layer — `tool === 'pen' && isPenDrawing()` →
  cancel the draft (identical to drawing-Esc), suppress the menu; strict disambiguation from the
  edit-mode anchor menu by mount/guard structure (table in design.md); everywhere else unchanged.
- **Rider commit**: stale B-053/B-054 code references (renumbered to B-057/B-056 by #276) renamed
  in the files this branch touches.

## Capabilities

- **`designer-path-element`** (MODIFIED ×3 + ADDED): "A selected path is fully editable" →
  edit-mode entry/exit + modifier-gated insertion + menu chrome; "Gizmo + outline hit-test" →
  the selection box/Inspector W/H enclose the curved outline (visual bounds), export filter
  correctness; "Pen tool draws a bézier path" → right-click-cancels-draft; ADDED "Path point-edit
  mode" requirement capturing the mode lifecycle and Esc precedence.

## Impact

- `packages/shared-schema/src/elements.ts` (+`pathVisualBBox`), designer canvas feature
  (`Gizmo.tsx`, `CanvasOverlay.tsx`, `PathEditor.tsx`, new `path-bounds.ts`, `AnchorContextMenu`),
  `renderer/ui/ContextMenu.css.ts` (new), `features/timeline/LayerContextMenu.css.ts`
  (re-exports), `state/slices/selection.ts` + `store-core.ts` (`editingPathId`),
  `features/inspector/TransformSection.tsx` (path W/H mapping), `state/off-frame.ts` (visual box
  for paths).
- Tests: shared-schema unit (`pathVisualBBox` extrema), designer units (edit-mode transitions,
  display↔stored mapping, Ctrl-gated insert, right-click disambiguation, off-frame), E2E
  (box-only vs dblclick handles, Esc/empty exit, Ctrl-gated insert, curved selection box +
  Inspector H, right-click draw-cancel, restyled menu) + updates to the four pen specs that
  assumed mount-on-select.
- Docs: PRD B-058/B-059/B-060 + D-124 (cross-referenced), ROADMAP, canvas README + state README
  (engine doc-sync).
