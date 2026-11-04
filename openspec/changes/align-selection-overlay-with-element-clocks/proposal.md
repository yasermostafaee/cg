# Change: align selection overlay with element clocks

## Why

Composition-owned mixed Hold playback deliberately gives unchecked elements an independent local
clock while checked elements follow the looping root cursor. The Canvas overlay still evaluates
every element at that one root cursor, so a selected box can separate from the picture it describes.

## What Changes

- Add observation-only root element-frame telemetry to the Designer preview runtime.
- Resolve hit-testing, single/multiple selection, snapping and transform gestures at each element's
  visual frame during lifecycle playback.
- Clear the session-only frame map for ordinary scrub, rebuild and completed playback.
- Keep runtime painting, exported output and on-air timing unchanged.

## Impact

Template Runtime observation hooks, Designer preview messaging, Canvas selection geometry and
focused runtime/DOM/browser tests. Stored scenes and broadcast protocols do not change.
