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
- [x] Part C — owner loop: three readout batches received (2026-07-07) + an 86 s screen recording
      (`bug1.mp4`, 1920×976 device px, build `8ed5a52+probe2` visible in-frame). Probe upgraded to
      `+probe2` (Y edge/sweep blocks, deselected contentEdge from the first rendered element,
      points-vs-bbox gizmo decomposition) — live in the served preview.
- [x] Part D take 2 (2c) — layout-level analysis: H3/H4 ruled out; gizmo mechanism measured
      (raw model vs 1/64-CSS LayoutUnit floor-quantized content; +1.0156 dev px at fractional
      coords, 0 at integer). SUPERSEDED at the grid/content level by the 2d paint-truth reset —
      the layout-phase-following grid direction is discarded (see `design.md` Take 3 retractions);
      the uncommitted 2c grid edits were reverted.
- [x] Part D take 3 (2d) — PAINT truth established with lossless screenshots on the affected
      machine (native 125% Windows scaling): grid strokes paint crisp and layout-exact; content
      edges paint as 1.6–3.5 dev px smears that do NOT track sub-pixel layout moves
      (byte-identical paint across forced stage phases) → the prescribed sub-CSS-px stage pinning
      is EMPIRICALLY DEAD; mechanism isolation in minimal mocks failed to reproduce the smear.
      **STOP-LOSS invoked per the 2d process rules — numbers + candidate directions (sliding-window
      re-anchor spike / zoom-dependent extent / upstream) recorded in `design.md`; awaiting
      reassessment with the owner. NO commit/push until the owner confirms a direction.**
- [x] Part D take 4 (spike A) — windowed stage prototyped and initially declared PASS, then
      RETRACTED: the "content smear" driving it was measurement pollution (the profiles ran with
      the shape silently SELECTED — the gizmo's 1-css-px accent border, luminance ≈ 148, sits on
      the measured edge and is exactly the "smear" values). See `design.md` Take 5.
- [x] Part D take 5 — VERIFIED-deselected dual-build paint profiles (baseline 8ed5a52 worktree vs
      windowed tree; emulated + real native; owner phases forced): the DESELECTED content was
      ALWAYS crisp (1 honest AA px per axis); the windowed stage changes nothing under emulation
      and breaks real-native rendering → DROPPED. Final fix set implemented instead:
      (1) containing-pixel (`floor`) grid snap — fixes the owner-visible +0.81 dev px Y stroke
      offset at phase ≈ .68 (and X at phases > ½); (2) ruler marks snapped to the same pixel
      (`snapMarkToGridPixel`, 1 device px); (3) gizmo `quantizeBoxToLayout` (≤ 0.25 dev px at
      fractional coords, no-op at integer); (4) gizmo frame stroke 1 DEVICE px (was a fuzzy
      1.25-device band at dpr 1.25 — what the owner stares at when working selected).
- [x] Part E — full uncached gate + `pnpm test:e2e` (incl. the new `pixel-paint.spec.ts`
      verified-selection screenshot acceptance); `pnpm openspec validate --all --strict`; serve
      the preview; **PAUSE — owner verifies on their screen (deselected + selected, both axes,
      after a drag) BEFORE any commit/push**; then strip or keep the probe (flag-gated,
      README-documented) per the owner's call. DONE 2026-07-08: uncached turbo gate 79/79 green;
      repo-wide `format:check` green; `openspec validate --all --strict` 31/31; full E2E green
      (designer 175 incl. the B-045 red→green test, runtime 6); **owner CONFIRMED on their
      screen** — arrow-key movement tracks live and lands on the grid lines; drag stays honestly
      fractional (D-122 pending by design). Probe strip-or-keep still the owner's call (kept,
      flag-gated behind `?b042probe=1`).
- [x] Part F — B-045 stale raster (the owner's grid.jpg "not confirmed" round, 2026-07-08):
  - [x] grid.jpg measured pixel-by-pixel: strokes + gizmo EXACT vs layout; the painted content
        edge 22.5 dev px (exactly 18/64 scene px) behind layout — the PREVIOUS position. The
        Take-5 fix set stands; the residual is a DISTINCT defect: paint does not follow small
        position edits.
  - [x] Defect isolated + filed as **B-045** (`docs/prd/bugs-designer.md`; B-042 entry
        cross-linked; D-096 raised as the root fix with a rider): Chromium loses raster
        invalidation for `left`/`top` deltas ≲ 2 CSS px inside the scaled subtree — reproduced
        deterministically on BOTH compositors, survives idle/scroll/full-DOM-rebuild; standalone
        minimal testbed reproduces WITHOUT the app (and without an iframe).
  - [x] Mitigation candidates measured (design.md Take 6): every scoped repaint poke FAILS
        (overlays, outline/opacity/visibility, will-change round-trip — both compositors);
        `transform: translate()` is compositor-exact even over a stale base; decomposition
        (box pinned at 0 + lattice-quantized translate) paints ≤ 0.001 dev px at EVERY gauntlet
        step (2 envs × 2 variants).
  - [x] Red-first E2E (`B-045` in `pixel-paint.spec.ts`): coverage-integral painted-edge
        estimator; sub-pixel inspector edit (relative-motion assert) + 3 arrow-step nudges with
        verified selection states. Shown RED on the pre-pin tree ("moved 80.0 of 22.5 device
        px"), GREEN on the pinned build.
  - [x] Fix implemented — authoring-only position pin in `platform/preview.ts`
        (`REVEAL_ON_LOAD`-gated realm-local style Proxy; left/top → 0 + `translate(trunc(v·64)/64)`
        prefix; RTL hug-text opt-out; childList safety net). Playout/export documents untouched.
        Post-fix: native painted-edge Δ −0.008 dev px through idle + scroll (was −23.008); full
        pixel-paint suite 7/7; drag frame-times mean 8.33 → 8.35 ms, p95 8.5 → 8.7, 0 frames > 25 ms (120 Hz display).
  - [x] Spec delta: ADDED requirement "Position edits repaint the canvas preview (B-045)" with
        sub-pixel / arrow-step / playout-untouched scenarios; canvas README engine-doc synced.
  - [x] Chromium upstream package prepared for the owner to submit (session scratchpad
        `b045-chromium-repro/`: `chromium-bug-repro.html` + `chromium-bug-report.md`; repro
        verified headed-native — raw mode stale, workaround mode exact).
