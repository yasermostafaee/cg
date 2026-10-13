## ADDED Requirements

### Requirement: An Update on a row that owns no live layer reaches no live layer

The bridge SHALL treat `stack.update` as a configuration verb and never as a playout verb. For a
row that does not own the live layer — one that is not on air and for which the live-layer ledger
holds no seats — an update, with or without new plate bindings, SHALL put no `PLAY`, no
`MIXER … VOLUME` and no `MIXER … FILL` or `MIXER … CLIP` on the AMCP wire, and SHALL leave the
ledger empty. The edit SHALL still be accepted and recorded, so that the next take seats it. A row
that DOES own its live layer SHALL be re-pointed immediately, keeping its union pre-seat.

Ownership is decided by ONE predicate, read at every door — on air, or the ledger holds seats —
and never by the rehearse flag. The operator verbs that take a row off air (`out`, `stop`) release
its seats, so a row reconfigured after them owns nothing and SHALL be treated as such.

#### Scenario: A loaded, never-taken row is updated

- **WHEN** a row is loaded and never taken, and the operator applies an update — field values
  alone, or a binding of a plate to a new input **THEN** the update is accepted, nothing reaches
  the wire on any live layer, the ledger stays empty, and the edit is in force for the next take

#### Scenario: A row taken off air by the operator is then reconfigured

- **WHEN** a row was on air, the operator presses OUT or STOP, the row settles off air, and the
  operator then swaps a plate's input and presses UPDATE alone **THEN** nothing reaches the wire on
  any live layer and the ledger stays empty, and the NEXT take seats the swapped input

#### Scenario: An on-air row is re-pointed at once

- **WHEN** the same update is applied to a row that is on air with seats in the ledger **THEN** a
  `PLAY` reaches the wire and every seat the row held before is still held after — the instrument
  that reads the wire is proven live by this case

### Requirement: A look switch preserves the source-to-frame relationship

The bridge SHALL preserve, across any sequence of look switches on one row, the relationship
between each frame the row's looks place and the source seated for it: the frame's producer (the
wire argument its seat was created with) and the rect it renders at when its look is active. In
particular, switching a row away from a look and back to it SHALL leave every frame that look
places on the same producer at the same rect, and SHALL rebuild no producer (no `PLAY`) on the way
back. The relationship SHALL be the ROW's — the row's per-look composition (level 3) and its
emergency patch (level 4) included — and never re-derived from the template's assignment alone.

#### Scenario: Switch away and back, with a per-look binding in force

- **WHEN** an on-air row on look A has one of A's frames bound, for look A only, to a source other
  than the template's default, and the operator switches to a look B that places none of A's
  frames and then back to A **THEN** every frame A places is on the same producer at the same rect
  as before the round trip, including the bound frame on its bound source, and no `PLAY` was sent
  on the way back

#### Scenario: The instrument is proven live

- **WHEN** the row is on look B in the sequence above **THEN** A's frames render nothing and B's
  frames render — the switch away really moved the picture before it was moved back

### Requirement: Changing a plate's audio never puts a ready row on air

The bridge SHALL treat every plate-audio verb — one plate's volume, a map of volumes (ON, OFF,
a fader release, SOLO) — as a configuration statement and never as a playout verb. For a row that
does not own its live seats (never taken, or taken off air by the operator's own OUT or STOP) a
raise SHALL put no `PLAY`, no `MIXER … VOLUME` and no `MIXER … FILL` or `MIXER … CLIP` on the AMCP
wire and SHALL leave the ledger empty, and SHALL still record the intent so that the row's next
take seats each plate at the volume recorded. A row that DOES own its seats SHALL have a raise
asserted on the wire at once, as one `MIXER … VOLUME` and nothing else. A silence (`0`) is never
gated: it can put nothing on air.

#### Scenario: A loaded, never-taken row is raised

- **WHEN** a row is loaded and never taken, and the operator presses ON, releases a fader, or
  presses SOLO on one of its plates **THEN** the change is accepted and recorded, nothing reaches
  the wire on any layer, and the ledger stays empty

#### Scenario: A row taken off air by the operator is then raised, and later re-taken

- **WHEN** a row was on air, the operator presses OUT, the row settles off air, and the operator
  then presses ON on a plate **THEN** nothing reaches the wire; and **WHEN** the row is next taken
  **THEN** that plate is seated at the volume the off-air ON recorded

#### Scenario: An on-air row is raised at once

- **WHEN** the same ON is pressed on a row that is on air with seats in the ledger **THEN** exactly
  one `MIXER … VOLUME 1` for that plate's layer reaches the wire, with no `PLAY` and no fill — the
  instrument that reads the wire is proven live by this case

### Requirement: SOLO is scoped to the owning row, hidden frames included

A SOLO on one plate SHALL set that plate to full volume and every other plate of the SAME row to
zero — the row's whole group: every plate the template declares plus every seat the ledger holds
for the row, which is the union pre-seat and therefore includes the frames the active look hides —
and SHALL touch nothing outside that row: no other row's layers on the wire, no other row's
recorded intents, and no seat created anywhere.

#### Scenario: SOLO names its owning row

- **WHEN** two rows carry plates and every plate on both is raised, and the operator presses SOLO
  on one plate of the first row **THEN** every `MIXER … VOLUME` that reaches the wire addresses a
  layer the first row owns, the first row's hidden frame is silenced in the record, the second
  row's intents are exactly as they were, and no `PLAY` was sent
