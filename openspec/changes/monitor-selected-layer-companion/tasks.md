## 1. Implementation

- [x] 1.1 Add maximized-monitor companion controls that appear only with a selected layer.
- [x] 1.2 Render the selected layer beside the monitor and optionally its Inspector.
- [x] 1.3 Preserve selection across every companion transition and a repeated selected-row click.
- [x] 1.4 Make closing the companion Inspector return to layer-only without deselecting.
- [x] 1.5 Add focused whole-App DOM coverage.
- [x] 1.6 Keep every companion in allocated layout space, never over the monitor picture.
- [x] 1.7 Dock the layer and optional Inspector below the maximized monitor at every width.
- [x] 1.8 Render the selected row without list chrome. Put the Inspector on the right and hide
      the app header and status footer for every maximized panel per the owner review.

## 2. Verification

- [x] 2.1 Run focused Runtime tests and typecheck (9 DOM cases; Runtime typecheck).
- [x] 2.2 Run strict OpenSpec validation (`monitor-selected-layer-companion` passed).
- [x] 2.3 Run the repository full gate (`103/103` gate sections passed on 2026-11-08).
- [x] 2.4 Chromium measured both maximized monitors at 1440 px and 840 px with both companions below.
- [x] 2.5 Chromium verified row height, right Inspector and draft retention at 1900, 1440 and
      840 px. All four panels hide and restore the main bars on fullscreen round-trips.
