# Design — selection overlay follows element clocks

## Root cause

D-187 introduced a root Middle-loop cursor and independent once-only clocks for unchecked animated
elements. Runtime paints those clocks correctly, but the Canvas receives only `onRootFrame`. Gizmo,
hit-test and gesture code therefore call `renderedTransformAt(element, currentFrame)` with a frame
that is truthful for the composition but not necessarily for that element.

## Decision

The authoring runtime may report a batched map of root element ids to the frame most recently used
to paint each element. The callback is optional, observation-only and installed only by Designer
preview pages. It is emitted after the same apply path that painted the element, including Intro,
Freeze, checked Middle loop, unchecked Hold tail and Outro.

CanvasArea keeps the map only for the active lifecycle session. CanvasOverlay uses one resolver,
`element frame if reported, otherwise root frame`, for drawing, hit-testing, snapping, drag, resize,
rotate, drill and multi-selection. Scrubbing and a fresh/rebuilt/completed session discard the map,
so static authoring continues to use the normal playhead.

## Non-goals

- No change to the composition cursor or D-187 independent-clock policy.
- No polling or DOM-geometry reverse engineering.
- No persisted per-element playhead and no on-air observer.
