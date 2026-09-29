# runtime-playout-sources

## RENAMED Requirements

- FROM: `### Requirement: Every plate whose source is a D10 input SHALL start silent and SHALL only be raised by a ramp`
- TO: `### Requirement: Every plate whose source comes from the Playout SHALL start silent and SHALL only be raised by a ramp`

## MODIFIED Requirements

### Requirement: Every plate whose source comes from the Playout SHALL start silent and SHALL only be raised by a ramp

Every plate whose source comes from the Playout SHALL be seated at `VOLUME 0`, committed before its `PLAY`
— a D10 input, and (`RELEASE-091-01` §2, the owner's decision of 2026-09-29) a D11 media clip, exactly
alike — on every seating — take, look switch, `R-048` swap and restore, an in-place replace included.
Nothing automatic SHALL raise it: the take's `VOLUME 1` never reaches its layer and the connect sweep never
covers the plate band. Every raise to its declared volume — the operator's per-plate setting, default 0 —
SHALL ramp as `MIXER <ch>-<L> VOLUME <v> 25`, on the plate's own layer; a silence, PANIC included, stays
immediate. One predicate SHALL decide which plates the rule covers, for both the mute and the ramp. The
page layer, beds and a plate with no Playout origin SHALL be unchanged.

#### Scenario: An NDI and a stream plate

- **WHEN** an NDI plate and a stream plate from D10 are taken **THEN** each one's `VOLUME 0` is committed
  before its `PLAY`, and no `VOLUME 1` reaches their layers from the take or from the connect sweep
- **AND** an operator's raise sends `VOLUME <v> 25`
- **AND** the page layer still gets its `VOLUME 1`, and PANIC sends an immediate 0 (the control)

#### Scenario: A media clip

- **WHEN** a two-box row is taken with a clip in box 2 **THEN** the clip's `VOLUME 0` is committed before
  its `PLAY`, and no raise reaches its layer from the take
- **AND WHEN** the operator presses ON for it **THEN** `MIXER <ch>-<L> VOLUME 1 25` reaches the clip's own
  layer
- **AND WHEN** a `pause` look switch hides it **THEN** it is sent 0, and the switch back sends its declared
  volume by the ramp
- **AND** the page layer's `VOLUME 1` is untouched throughout (the control)

#### Scenario: A clip swapped in place

- **WHEN** an on-air clip plate is swapped to another clip on its own layer **THEN** it is muted before
  the new `PLAY` in the seat step's commit, and its declared volume comes back by the ramp

#### Scenario: A plate with no Playout origin

- **WHEN** a plate's source carries no Playout origin **THEN** its raise is the bare
  `VOLUME <v>` line, as before
