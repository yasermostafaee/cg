# Tasks — pixel grid ↔ content alignment (B-042)

## 1. Recon (B-042 "RECON FIRST")

- [x] Build + run the Designer; recreate the exact repro (Rectangle X=0 Y=0 W=320 H=120, 6400%,
      right edge at scene x=320 in view).
- [x] Measure, don't eyeball: arithmetic probe (rects + backing + recomputed `rulerOrigin`,
      per-column grid-stroke vs content device positions) + ground-truth screenshot probe
      (sub-pixel edge/stroke detection, injected reference stroke → real canvas-layer offset).
- [x] Matrix: dpr ∈ {1, 1.25, 1.5, 2} × zoom ∈ {6400%, ~4977% fractional, ~800% threshold},
      plus a fractional-scroll variant.
- [x] Classify the drift signature(s) and state the confirmed root cause (see `design.md`):
      backing stretch (grows across viewport), fractional layer origin (compositor snap/resample,
      dpr-dependent), snap-vs-unsnapped-content residual (constant or repeating beat).

## 2. Pure geometry (`geometry.ts`)

- [x] `gridCanvasAlignment(screenCssPos, dpr)` → `{ deviceOrigin, nudgeCss, phase }`: integer
      device origin `floor(screenCssPos·dpr)` (FLOOR, not round, so the nudge is always ≤ 0 and
      never uncovers the viewport's leading edge), sub-CSS-px element nudge `(deviceOrigin −
screenCssPos·dpr)/dpr`, and the line-snap phase `screenCssPos·dpr − deviceOrigin ∈ [0, 1)`.
- [x] `pixelGridLines(originCss, zoom, lengthCss, dpr, rasterPhase = 0)`: stroke center
      `round(cssPos·dpr + rasterPhase) + 0.5` (canvas-internal ≡ screen physical raster when the
      canvas is aligned); default 0 preserves the existing call shape.
- [x] `gridBackingSize(lengthCss, dpr)` → `{ devicePx, cssPx }` with `cssPx = devicePx/dpr`
      (raster scale exactly 1) and a +2 device px overspan so the floor-nudged canvas still covers
      the whole viewport (the overlay clips the sub-pixel overhang).

## 3. Wiring (`CanvasArea.tsx` `drawPixelGrid`)

- [x] `drawPixelGrid` takes the overlay's screen position (the outer viewport's live rect),
      computes the per-axis alignment, applies `canvas.style.left/top = nudgeCss`, sizes the
      backing store via `gridBackingSize` with `style.width/height = backing/dpr` (raster scale
      exactly 1), and draws lines with the phase.
- [x] The redraw effect passes `outerRef.current.getBoundingClientRect()` — never the canvas's own
      rect (no feedback loop); redraw triggers (rulerOrigin / zoom / viewport) unchanged.

## 4. Tests

- [x] Unit (`pasteboard.test.ts`): `gridCanvasAlignment` — nudged position lands on an integer
      device pixel, nudge ≤ 0, phase ∈ [0, 1), identity at already-aligned positions and on
      degenerate inputs, incl. fractional dpr.
- [x] Unit: grid-line ↔ content agreement — for representative (zoom, dpr, origin/phase) tuples
      (64 / 49.77 / 8.14 × dpr 1 / 1.25 / 1.5 / 2 × fractional layouts incl. the measured
      298.390625 studio position and fractional scroll), the stroke center stays within ½ device
      px of `contentDevice + 0.5` (the content edge's ideal stroke) at EVERY visible column; at
      integer `zoom·dpr` the residual is CONSTANT across the viewport.
- [x] Unit: existing `pixelGridLines` 4-arg tests still pass (default phase 0); crispness
      round-trip (stroke centers at integer+0.5) preserved with a phase; `gridBackingSize` scale
      exactly 1.
- [x] E2E (`pixel-grid.spec.ts`): at 6400% AND a fractional zoom (≥4800%), for `deviceScaleFactor`
      1, 1.25, and 2 — (a) the grid canvas layer is device-aligned (backing == cssSize·dpr within
      0.06 device px; layer origin on an integer device px within the 1/64-CSS-px layout quantum);
      (b) every painted stroke — read back from the canvas BITMAP, mapped through the element's
      actual rect — lies within ≤ ½ device px (+ tolerance) of the content mapping for its integer
      scene coordinate, at every visible column (the repro rectangle's x=320 edge in view); the
      residual spread at 6400% is ≤ 0.12 (constant, no beat/ramp); (c) strokes are single bitmap
      columns (crisp, incl. fractional zoom) — the same mapping doubles as the ruler contract;
      (d) a 1-px nudge still moves exactly one cell at dpr 1.25. All 7 tests green.
- [x] Ground-truth re-verification: screenshot micro-probe post-fix — canvas layer shift 0.000
      device px at dpr 1 (was −0.39), strokes at exactly their ideal integer device positions;
      layer origin fraction 0.012 at dpr 1.25 (was 0.988), stretch 0.99999 (was 1.00031);
      probe shift +0.05 at dpr 1.5. Evidence in the PR.

## 5. Docs

- [x] Canvas feature `README.md` — grid contract updated: screen-raster snapping, device-aligned
      canvas layer (nudge + backing-exact size), content-alignment guarantee (engine doc-sync).
- [x] PRD `docs/prd/bugs-designer.md` B-042 → `[~]` with branch + change dir; ROADMAP placeholder
      line completed.

## 6. Gate

- [x] `@cg/designer` format:check + typecheck + lint + test + build, uncached at least once
      (`turbo --force`), then `pnpm test:e2e` (168 passed).
- [x] `pnpm openspec validate fix-pixel-grid-content-alignment --strict` (and `--all --strict`).

## 7. Follow-up — owner still sees the misalignment on the real laptop (2026-07-07)

The emulated evidence (bitmap E2E at dpr 1 / 1.25 / 2) is green, but the owner reports NO visible
change at 6400% on the affected Windows laptop. New owner evidence: dragging writes FRACTIONAL
X/Y (the border honestly sits between lines — separate product gap, filed as D-122); at INTEGER
coords the selection border lands ON the grid lines (grid↔gizmo agree → H1 unlikely); the rendered
SHAPE is quantized to whole scene pixels but every landing position is OFFSET from the lines →
prime suspect H2: the stage/iframe layer rasterizes with a fractional device-pixel phase on the
real compositor (the emulated ≈0 stage-displacement measurement may not hold there). Measure ON
the machine, then fix from the readings.

- [x] Part A — stale build made impossible: worktree branch/head confirmed
      (`fix/B-042-pixel-grid-content-alignment`), full fresh build served via `vite preview`,
      boot log `console.log('B-042 build', <tag>)` + the same tag shown in the probe panel.
- [x] Part B — temporary OPT-IN probe (`?b042probe=1` / `localStorage.b042probe='1'`,
      `B042Probe.tsx`): live dpr / visualViewport.scale / browser-zoom warning; grid layer rect +
      fractional device origin + applied nudge + rasterPhase + backing↔CSS scale; stage / iframe /
      gizmo layer rects + fractional device origins; judged-edge row (ideal / bitmap-read stroke /
      content / gizmo, with deltas in device px) + all-stroke min→max sweep; copy-as-text button
      (+ `console.table`).
- [ ] Part C — owner loop: readings #1 (deselected, left + right of viewport) and #2 (selected)
      pasted back, plus the Windows display-scale %. **PAUSED HERE awaiting the owner.**
- [ ] Part D — act on the readings (H0 stale build / H1 gizmo overlay / H2 content raster phase /
      H3 browser zoom / H4 nudge not applying); record the confirmed finding in `design.md`
      (including the honest note if the emulated stage measurement is falsified on real hardware);
      spec/E2E per the finding.
- [ ] Part E — strip the probe + boot log (or keep behind the flag, documented in the canvas
      README — decide); full uncached gate + `pnpm test:e2e`; `pnpm openspec validate --all
  --strict`; push; owner re-verifies visually before any archive.
