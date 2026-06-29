# Guide coordinate readout on hover / drag (D-072)

## Why

The operator can pull, drag, and remove persistent ruler guides, but a guide's exact position is
invisible — the author has to eyeball it against the rulers. A small coordinate badge (the
Figma/AE behaviour) makes guides precise without opening any panel. This is a pure editing
affordance: no effect on render, export, or playout.

## What Changes

- A small, non-interactive coordinate **badge** appears for the ACTIVE persistent ruler guide
  (`state.guides`) — the one the pointer is hovering OR the one being dragged (dragging wins).
  It shows the guide's scene coordinate in px: a vertical guide → `x: <n>`, a horizontal guide →
  `y: <n>`. The value updates LIVE while dragging and the badge persists for the whole drag even
  when the window-level pointer-move takes the pointer off the thin strip.
- The badge is rendered in the existing NON-scrolling overlay in `CanvasArea.tsx`, positioned at
  the guide's screen coordinate (`rulerOrigin.x + gx·zoom` / `rulerOrigin.y + gy·zoom`) near the
  ruler edge, and clamped to stay within the visible viewport so it tracks scroll/zoom.
- It applies ONLY to the operator's draggable ruler guides, NOT the transient snap/alignment
  guides (`snapGuides`).

## Impact

- Affected specs: **designer-canvas-view** (MODIFIED — the "Ruler guides" requirement gains the
  coordinate-readout behaviour).
- Affected code: `@cg/designer` only — `renderer/features/canvas/CanvasArea.tsx`. Transient
  "active guide" view state lives in the component (NOT the store). The badge is display-only
  (`pointerEvents: none`), so a styled `div` is appropriate (the design-system "use `renderer/ui`
  primitives" rule targets interactive controls).
- **No** schema / store / `@cg/template-runtime` / exporter / `.vcg` / runtime change.
