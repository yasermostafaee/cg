# Mask live input regions (D-202)

## Why

Some live inputs already carry burned-in captions. The author can display a rectangular portion
of that picture as a graphic, or use Revert to show the rest of the picture with the rectangle
removed. Existing projects can also reveal part of a second, explicitly linked input.

## What Changes

- Add an explicit upper-source → lower-source relation and up to eight normalized reveal windows.
- Let the author add, edit and remove each window independently in the Inspector and Canvas.
- Default to direct editing for a selected mask. Drag its body to move it or a corner to resize it.
- Keep every unrelated live-plate overlap blocking.
- Render each window as a muted clipped copy of the lower producer above the upper producer.
- Count each copy as an additional seat and refuse atomically when the live-source band lacks room.
- Add an own-plate mask with independently editable windows and a Revert option.
- Seat one input per own-plate mask. Route any extra disjoint fragments from that seat and mute them.

## Capabilities

### Modified Capabilities

- `designer-live-source`
- `runtime-live-source-routing`

## Impact

Shared scene/carrier schemas, Designer Inspector/Canvas/preflight, author preview markup, persisted
live-layer records and Caspar Bridge seating/reconciliation.
