# Design: Prevent the Sequence/Repeater default-data flash

## Decision

`cg-pending` remains the paint boundary for a Take. Field application, driver reset and any dynamic
Sequence/Repeater subtree replacement happen before that class is removed. The existing controller
cascade still starts immediately after reveal, so entrance timing and the lifecycle state machine do
not change.

Repeater row motion explicitly sets visibility. A descendant can override an ancestor's
`visibility: hidden`, so both the pending stage and the parked or prewarmed page also use opacity
zero. This keeps their layout and prewarming intact. The Designer canvas removes the pending gate
after applying fields, the current frame and the selected Sequence item.

## Regression boundary

The focused runtime test still pins the data present at `cg-pending` removal. The browser test samples
computed visibility and effective ancestor opacity during pending and the first page of a real
starter. It reproduced the leaked city rows on the previous build.
