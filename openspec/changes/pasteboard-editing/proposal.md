# Editor pasteboard (D-071 Phase B)

## Why

Phase A landed the export-side off-frame filter: fully-off-frame static shapes are dropped from
`.vcg` / HTML / the broadcast preview. But the editor still CLIPPED the frame, so an author could
not actually SEE or place shapes off-frame — there was no pasteboard. Phase B is the visible half:
a dark area beyond the frame where the author parks/sees/moves staging shapes, with the frame
outlined so "exports vs won't-export" is obvious.

## What Changes

- **Pasteboard surface.** The canvas stage + iframe size to `pasteboardLayout(resolution)` — the
  frame plus a margin on ALL FOUR sides — a FIXED, SYMMETRIC pasteboard that is a pure function of
  the resolution. Dragging a shape NEVER resizes the dark area (only zoom does), and off-frame shapes
  are visible on every side (left/top too). `layout.frame` insets the frame; scene (0,0) sits there.
  The frame keeps its checkerboard + a drawn outline.
- **No layout regression.** The fit action and project-open fit the zoom from the FRAME bounds and
  CENTER the frame; the pasteboard overflows but the scrollbars are HIDDEN (no default scrollbars —
  pan via hand tool / wheel, zoom via Ctrl+wheel). Beyond the pasteboard, the scroll container paints
  a DARKER void so the workspace edge is visible (not an invisible same-colour clip). Ctrl+wheel
  zooms toward the CURSOR and the +/−/1× buttons toward the viewport centre (`zoomAt`). The iframe
  uses a `device-width` viewport so it never stretches. The rulers + guides live in a NON-scrolling
  overlay (a sibling of the scroll container, not a child — an abs child of `overflow:auto` scrolls
  with the content), pinned to the visible viewport; `rulerOrigin` places scene (0,0) at the frame
  top-left and tracks scroll/zoom, and the alignment guides span the full visible canvas.
- **Lift the authoring clip.** A NEW `authoring` flag on `preview.load` / `Preview.#buildHtml`
  (INDEPENDENT of D-087's `broadcast`) lifts `.cg-stage { overflow: hidden }` for the CANVAS iframe
  only, so off-frame shapes paint into the pasteboard. The two flags compose:
  - canvas iframe → `authoring: true`, `broadcast: false` (painted + off-frame visible);
  - broadcast modal → `authoring: false`, `broadcast: true` (blank-until-play + clipped, UNCHANGED);
  - export → neither (native clip + the Phase-A filter, UNCHANGED).
- **Off-frame selection.** The overlay's pointer/hit-test layer covers the whole pasteboard, so
  off-frame shapes are selectable + draggable on every side. Inside it, a FRAME-sized box (inset by
  `frameOffset`) anchors the gizmos + the `canvas-surface` hook and is the scene (0,0) origin for
  click→scene; off-frame gizmos paint as SVG overflow. `canvas-surface` still reports the FRAME's
  bounding box, so existing fraction-based tests are unaffected.
- Save + the Phase-A export filter are untouched: staging shapes persist in `.cg.json` and stay
  dropped from export.

## Impact

- Affected specs: **designer-canvas-viewport** (ADDED requirement — the off-frame pasteboard).
- Affected code: `@cg/shared-ipc` (`channels/preview.ts` — `authoring` + `frameOffset` on the load
  request); `@cg/designer` (`renderer/features/canvas/geometry.ts` `pasteboardLayout`;
  `platform/preview.ts` `#buildHtml` authoring CSS + `device-width` + the `frameOffset`-inset
  `.cg-stage`; `platform/createDesignerBridge.ts`; `renderer/features/canvas/` `CanvasArea.tsx` +
  `.css.ts` extent sizing + `centerFrameInView` + `zoomAt` + hidden scrollbars + darker void +
  viewport-spanning guides; `CanvasOverlay.tsx` frame-offset box anchoring the gizmos/`canvas-surface`
  hook). No runtime/exporter/schema change.
- Scope note: the pasteboard is SYMMETRIC (margin on all sides) and FIXED (resolution-driven, never
  content/drag-driven). The frame is inset by `frameOffset` and every consumer (iframe, overlay,
  rulers) measures scene (0,0) from that offset, so the surface→scene click mapping stays consistent
  and `canvas-surface` keeps the frame's bounding box. D-071 stays `[~]` until Phase B archives.
- Risk: the shared `preview.ts` `#buildHtml` feeds the canvas + the broadcast modal + (via the same
  source) the export, so the full gate + `pnpm test:e2e` are required; the E2E asserts the modal
  still blanks-until-play and the export still drops off-frame through the new flag.
