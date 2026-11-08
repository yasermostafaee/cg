# Reveal a lower live input through an upper plate (D-202)

## Why

Some live inputs already carry burned-in captions. An author needs to place a second input above
them while revealing only that caption region, without recreating the incoming pixels as Designer
text or disabling overlap safety for every plate.

## What Changes

- Add an explicit upper-source → lower-source relation and a normalized rectangular reveal window.
- Let the author select the lower plate, edit exact percentages or draw the window on Canvas.
- Keep every unrelated live-plate overlap blocking.
- Render the reveal as an always-muted clipped copy of the lower producer above the upper producer.
- Count that copy as one additional seat and refuse atomically when the live-source band lacks room.

## Capabilities

### Modified Capabilities

- `designer-live-source`
- `runtime-live-source-routing`

## Impact

Shared scene/carrier schemas, Designer Inspector/Canvas/preflight, author preview markup, persisted
live-layer records and Caspar Bridge seating/reconciliation.
