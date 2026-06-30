# Tasks — high zoom + pixel grid (D-120)

## 1. Max zoom 400% → 6400%

- [x] `CanvasArea.tsx`: `ZOOM_MAX` `4` → `64`; confirm every zoom path (+/−/1× buttons,
      `Ctrl+wheel`, Fit) routes through `clampZoom` so they all honour the new ceiling.
- [x] Confirm B-027's dynamic cover-fit MIN still governs the bottom of the range (unchanged).
- [x] Correct the stale "clamped 10..400%" comment.

## 2. Pixel-grid geometry helpers (pure, testable)

- [x] `geometry.ts`: `PIXEL_GRID_MIN_ZOOM` (8), `PIXEL_GRID_MAJOR_EVERY` (10),
      `pixelGridVisible(zoom)` (shown iff `zoom ≥ PIXEL_GRID_MIN_ZOOM`), and
      `pixelGridLines(origin, zoom, lengthCss, dpr)` → `{ scene, devicePx }[]` — the VISIBLE
      (viewport-culled) line positions, each SNAPPED to the device-pixel raster
      (`Math.round(pos·dpr) + 0.5`) so a 1px stroke is crisp at any zoom; the `scene` field drives
      major (`scene % 10 === 0`) styling.

## 3. Render the grid layer (device-pixel-snapped canvas)

- [x] `CanvasArea.css.ts`: `s.pixelGrid` — absolute, `pointer-events: none` canvas (the bottom
      layer of the ruler overlay; size set imperatively).
- [x] `CanvasArea.tsx`: render `<canvas class={s.pixelGrid}>` as the FIRST child of `s.overlay`
      (the non-scrolling ruler overlay), gated on `pixelGridVisible(zoom) && rulerOrigin !== null`;
      `drawPixelGrid` repaints it (in DEVICE px, snapped, viewport-culled) on a `useEffect` keyed on
      `rulerOrigin` / `zoom` / `viewport`. `aria-hidden`; hit-testing stays on the canvas below.
- [x] Reject the CSS-gradient approach: its fixed FRACTIONAL period (`zoom` px) drifts lines off the
      device-pixel raster → anti-aliased/doubled at fractional zoom (crisp only at integer scales).

## 4. Tests

- [x] Unit `pasteboard.test.ts`: `pixelGridVisible` threshold (false below 8, true at/above);
      `pixelGridLines` SNAPS every line to a whole device pixel at FRACTIONAL zoom + HiDPI
      (`devicePixelRatio = 2`); the snap stays ≤ half a device pixel from the true scene position
      (ruler-aligned, no drift); viewport culling (only visible, contiguous scene coords); major
      detection (`scene % 10`, scene 0 included); degenerate inputs → no lines.
- [x] E2E `pixel-grid.spec.ts`: max zoom reaches 6400% (canvas still renders); the grid (a
      `<canvas>`) is PRESENT at a high zoom (≥ 1600%) and ABSENT at 100%; at high zoom a 1px arrow
      nudge moves the shape exactly 1 scene px.
- [x] Confirm no regression: B-027 cover-fit min / clamp / fit-on-open (B-035) still pass.
- [x] Fractional-zoom crispness is a VISUAL property (blur can't be asserted in Playwright) — covered
      by the snapping unit tests + a manual-verification note in the PR.

## 5. Docs

- [x] Canvas feature `README.md` — pixel-grid + high-zoom section (canvas, device-pixel snap).
- [x] PRD `docs/prd/designer.md` D-120 → `[~]` with evidence (incl. the sub-pixel snap).

## 6. Gate

- [ ] `@cg/designer` typecheck + lint + test + build (uncached `turbo --force`), then E2E.
- [ ] `pnpm openspec validate high-zoom-pixel-grid --strict`.
