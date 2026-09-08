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
