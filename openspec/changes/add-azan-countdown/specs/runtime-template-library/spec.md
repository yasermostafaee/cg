# runtime-template-library — delta (the operator sets a countdown's target — DELTA-RUN-NEXT-VERSION-01-B, -C, -E)

## ADDED Requirements

### Requirement: The operator SHALL set a countdown's target per row with the date and time control

CG Control's import SHALL mark a `text` field that drives a countdown's target — its own composition
binds it as `clock-target` to a countdown aimed at a time of day or a date and time — as that
countdown's target (`countdown`: the target kind and the author's After zero). The marker SHALL be
DERIVED from the template's bindings at import, never authored, and a marker the bindings do not
justify SHALL be removed. The Inspector SHALL offer the shared date and time control for a marked
field, per row, in place of a text box, staging its value through the Inspector's ordinary path: the
stored value is ISO with the console's offset, or `HH:mm[:ss]`, in every calendar.

On air, a target change SHALL be the row's existing `CG <channel>-<layer> UPDATE 0 "<json>"` and
nothing else — never a `PLAY`, a re-take, a `MIXER`, a `CLEAR` or any command the operator did not
cause. A row with no page on its layer SHALL send nothing: the change is state, and the next take
carries it in its `CG ADD` payload. A row that is loaded and not yet taken holds its page on the
layer already, so the same one `CG UPDATE` reaches that page and no playout command is sent.

A target already in the past SHALL be stated, never refused: `Target passed 12 min ago` followed by
the author's After zero in the operator's words (`holds at 00:00`, `counts past zero`, `digits
hidden`, `will close at once`), re-read every 15 s; the Take SHALL stay available. When the machine
CG Bridge runs on keeps another time zone than this console (`bridge.capabilities` reports its
clock; an older bridge reports none), both clocks SHALL be stated as facts.

#### Scenario: A marked field gets the control

- **WHEN** a template whose countdown target is bound to `targetTime` is imported and its row selected
- **THEN** `targetTime` is the date and time control, and its neighbouring text field stays a text box

#### Scenario: On air, a target change is the row's update and nothing else

- **WHEN** the operator changes the target of an on-air row and updates it
- **THEN** the only line on the layer is `CG 1-<layer> UPDATE 0 "{\"targetTime\":\"…\"}"`, and the row
  stays on air

#### Scenario: Off air, nothing is sent until the take

- **WHEN** the operator changes the target of a row whose page left the layer
- **THEN** nothing is sent, and the next take's `CG ADD` payload carries the new target

#### Scenario: A passed target is stated, not refused

- **WHEN** a row's target is twelve minutes past and the author chose Close the graphic
- **THEN** the Inspector reads `Target passed 12 min ago · will close at once` and Update stays enabled
