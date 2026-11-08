# Design: Prevent the Sequence/Repeater default-data flash

## Decision

`cg-pending` remains the paint boundary for a Take. Field application, driver reset and any dynamic
Sequence/Repeater subtree replacement happen before that class is removed. The existing controller
cascade still starts immediately after reveal, so entrance timing and the lifecycle state machine do
not change.

Moving only the reveal boundary is safer than reordering Sequence and Repeater resets: repeaters can
contain nested sequences and sequence pages can contain repeaters, so either fixed type order can
leave newly stamped descendants out of the earlier pass. The current reset behavior already produces
the correct final subtree synchronously; it merely must not be painted halfway through.

## Regression boundary

The test intercepts the exact removal of `cg-pending`. A final-DOM assertion alone would miss the
reported defect because the incorrect shell is replaced synchronously later in the same `play()`.
