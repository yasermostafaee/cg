# Editor pasteboard (D-071 Phase B)

## Why

Phase A landed the export-side off-frame filter: fully-off-frame static shapes are dropped from
`.vcg` / HTML / the broadcast preview. But the editor still CLIPPED the frame, so an author could
not actually SEE or place shapes off-frame — there was no pasteboard. Phase B is the visible half:
a dark area beyond the frame where the author parks/sees/moves staging shapes, with the frame
outlined so "exports vs won't-export" is obvious.

## What Changes

- **Pasteboard surface.** The canvas stage + iframe extend beyond the frame (to the right/bottom),
  giving room to park shapes; the dark margin is the pasteboard. The frame keeps its checkerboard +
  a drawn outline.
- **Lift the authoring clip.** A NEW `authoring` flag on `preview.load` / `Preview.#buildHtml`
  (INDEPENDENT of D-087's `broadcast`) lifts `.cg-stage { overflow: hidden }` for the CANVAS iframe
  only, so off-frame shapes paint into the pasteboard. The two flags compose:
  - canvas iframe → `authoring: true`, `broadcast: false` (painted + off-frame visible);
  - broadcast modal → `authoring: false`, `broadcast: true` (blank-until-play + clipped, UNCHANGED);
  - export → neither (native clip + the Phase-A filter, UNCHANGED).
- **Off-frame selection.** The overlay's pointer/hit-test surface covers the pasteboard, so
  off-frame shapes are selectable + draggable. The frame stays at the surface origin (the pasteboard
  extends right/bottom), so click→scene placement and on-frame hit-testing are UNCHANGED — and the
  `canvas-surface` test hook keeps the FRAME's bounding box, so existing fraction-based tests are
  unaffected.
- Save + the Phase-A export filter are untouched: staging shapes persist in `.cg.json` and stay
  dropped from export.

## Impact

- Affected specs: **designer-canvas-viewport** (ADDED requirement — the off-frame pasteboard).
- Affected code: `@cg/shared-ipc` (`channels/preview.ts` — `authoring` + `pad` on the load request);
  `@cg/designer` (`renderer/features/canvas/geometry.ts` `pasteboardPad`; `platform/preview.ts`
  `#buildHtml` authoring CSS; `platform/createDesignerBridge.ts`; `renderer/features/canvas/`
  `CanvasArea.tsx` + `.css.ts` stage/iframe sizing; `CanvasOverlay.tsx` frame-sized test hook). No
  runtime/exporter/schema change.
- Scope note: the pasteboard extends to the RIGHT/BOTTOM (the frame stays at the origin). This is
  the low-risk choice — a symmetric (all-direction) pasteboard would shift the surface→scene click
  mapping and relocate every existing fixture click; an all-direction pasteboard can extend this
  later. D-071 stays `[~]` until Phase B archives.
- Risk: the shared `preview.ts` `#buildHtml` feeds the canvas + the broadcast modal + (via the same
  source) the export, so the full gate + `pnpm test:e2e` are required; the E2E asserts the modal
  still blanks-until-play and the export still drops off-frame through the new flag.
