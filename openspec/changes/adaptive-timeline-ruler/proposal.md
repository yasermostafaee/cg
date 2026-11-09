# Make long-composition timeline labels readable (B-416)

## Why

The Timeline stopped increasing its tick stride after 25 frames. At 1,500–5,000 frames this paints
dozens or hundreds of multi-digit numbers over one another. Its fixed 20× zoom ceiling also prevents
an author from reaching a distinct column for every frame in a long composition.

## What Changes

- Derive label stride from visible frames, measured viewport width and label digit count.
- Draw exactly one ruler and lane line for each numbered tick.
- Scale maximum zoom with composition duration until each frame has its own number and line.
- Preserve the existing minimum and 20× maximum for short compositions.

## Capabilities

### Modified Capabilities

- `designer-animation-timeline`

## Impact

Designer Timeline ruler/grid geometry, Timeline viewport measurement, status-bar zoom bounds and
timeline zoom state.
