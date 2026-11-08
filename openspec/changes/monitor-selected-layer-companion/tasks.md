## 1. Implementation

- [x] 1.1 Add maximized-monitor companion controls that appear only with a selected layer.
- [x] 1.2 Render the selected layer beside the monitor and optionally its Inspector.
- [x] 1.3 Preserve selection across every companion transition and a repeated selected-row click.
- [x] 1.4 Make closing the companion Inspector return to layer-only without deselecting.
- [x] 1.5 Add focused whole-App DOM coverage.
- [x] 1.6 Keep every companion in allocated layout space, never over the monitor picture.

## 2. Verification

- [x] 2.1 Run focused Runtime tests and typecheck (9 DOM cases; Runtime typecheck).
- [x] 2.2 Run strict OpenSpec validation (`monitor-selected-layer-companion` passed).
- [x] 2.3 Run the repository full gate (`103/103` gate sections passed on 2026-11-08).
