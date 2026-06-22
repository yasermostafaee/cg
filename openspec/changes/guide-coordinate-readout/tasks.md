# Tasks — Guide coordinate readout (D-072)

## 1. Active-guide view state

- [ ] 1.1 `CanvasArea.tsx` — transient component state `activeGuide: { axis: 'x' | 'y'; index:
    number } | null`. Set on `onPointerEnter` of a guide strip, cleared on `onPointerLeave`
      (hover); set on `dragGuide` start and kept until pointer-up (drag wins over hover, and the
      window-level pointer-move keeps it set even when the pointer leaves the strip). NOT in the
      store.

## 2. Badge render

- [ ] 2.1 `CanvasArea.tsx` — render a styled, non-interactive (`pointerEvents: none`) pill in the
      non-scrolling overlay, above the guide layer, ONLY when `activeGuide !== null`. Read the live
      coordinate from `guides.x[i]` / `guides.y[i]`. Position at the guide's screen coordinate
      (`rulerOrigin.x + gx·zoom` for an x-guide, `rulerOrigin.y + gy·zoom` for a y-guide) near the
      ruler edge, clamped to the visible viewport. Label `x: ${Math.round(gx)}` /
      `y: ${Math.round(gy)}`. `data-testid="guide-badge"`. Positioned so it doesn't clip under RTL.

## 3. Tests

- [ ] 3.1 E2E (`tests/e2e/`): hovering a guide shows `guide-badge` with its coordinate; dragging
      the guide updates the badge value; moving the pointer off (no drag) removes it.

## 4. Gate (batched with D-073 at the end)

- [ ] 4.1 Part of the batch green gate + E2E (see the batch PR).
