# designer-canvas-viewport (D-122 delta)

## MODIFIED Requirements

### Requirement: The selection overlay traces the RENDERED content box

The selection gizmo (frame + handles) SHALL trace the box the preview engine ACTUALLY laid out,
not the raw model values: the visual projection SHALL quantize the element's position and size
through the engine's layout lattice (1/64 CSS px, truncated toward zero — Blink LayoutUnit), so at
FRACTIONAL model coordinates the frame coincides with the rendered edges (raw-model projection sat
up to `zoom·dpr/64` device px — 1.25 at 6400%/dpr 1.25 — OUTSIDE the rendered edge; at integer
coordinates the quantization is a no-op). Each frame edge SHALL lie within ≤ 0.25 device px of the
corresponding rendered content edge, on all four sides, at any device-pixel ratio. The frame
stroke SHALL be ONE DEVICE PIXEL wide (not one CSS px, which is a fuzzy 1.25-device band at dpr
1.25), centered on the rendered edge — and it remains HONEST for fractional placement: a shape
parked between grid lines shows its border between the lines. Fractional placement stays reachable
even after D-122 makes plain dragging snap to whole pixels at grid zoom — an Inspector-typed value
or an Alt (snap-bypass) drag/nudge still places a shape between the lines. Interaction math
(resize/rotate/hit-testing) SHALL keep using the raw model values — the quantization is
visual-projection-only.

#### Scenario: The gizmo coincides with the rendered edges at fractional coords

- **WHEN** an element sits at a fractional scene coordinate (e.g. x = 2.2749, set via the Inspector
  or placed by an Alt snap-bypass drag) and is selected at pixel-grid zoom
- **THEN** every gizmo frame edge lies within ≤ 0.25 device px of the RENDERED content edge (the
  engine lays the box out at 2.265625 — the gizmo traces that, not the raw 2.2749)

#### Scenario: Integer coordinates stay exact

- **WHEN** an element sits at integer scene coordinates and is selected
- **THEN** the gizmo edges coincide with the rendered edges as before (the quantization is a
  no-op at integer coordinates) — within the same ≤ 0.25 device px bound

#### Scenario: The frame stroke is one device pixel and honest

- **WHEN** an element is selected at any device-pixel ratio (integer or fractional)
- **THEN** the frame stroke is one physical device pixel wide, centered on the rendered edge, and
  a fractionally-placed shape (Inspector value or Alt-bypass move) visibly shows its border BETWEEN
  grid lines (no false snapping of the border itself)
