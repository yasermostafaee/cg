## ADDED Requirements

### Requirement: A station linked to the Playout SHALL seat its plates in 60–79 when it declares no band

The bridge SHALL seat a take's plates in the contract's plate band, 60–79, on a station linked to the Playout
(its auth config names one) that declares no plate band — unless the station's own config claims a layer in
that band: a reserved playout layer, a bank row or bed, or a dynamic policy range. Then no band is in force,
and a take of a template with plates is refused as one line on its row, as before. A declared band SHALL be
used exactly as declared. A station not linked to the Playout SHALL keep the declared band or none.

The default SHALL be computed from the station's config and SHALL never be written into it, so a station
boots whatever its config holds; and it SHALL be read through ONE function by every reader — the seating plan,
the binding-change check, the own-layer test, the published catalogue, the boot line and the offline console.

#### Scenario: A linked station with no band declared

- **WHEN** a station linked to the Playout, with no band declared and nothing of its own in 60–79, takes a
  template with two plates **THEN** both plates are played on layers in 60–79, and no band file is written
- **AND** the station `pnpm dev:station --fake` starts, signed in and reading the fake Playout's inputs, does
  the same for a two-plate bed on channel 1

#### Scenario: A declared band is used as declared

- **WHEN** the same station has 70–79 declared **THEN** the plates are played on layers in 70–79

#### Scenario: A reserved layer in the band turns the default off

- **WHEN** a linked station's config reserves layer 65 and declares no band **THEN** no band is in force, the
  take is refused with `live-source-no-layer-range` on its row, and nothing reaches the server

#### Scenario: A station not linked to the Playout

- **WHEN** a station whose auth config names no Playout declares no band **THEN** no band is in force and the
  take is refused as before

#### Scenario: A config reserving 60–79 boots unchanged

- **WHEN** a linked station's config reserves 60–79 and declares no band **THEN** it boots, no band is in
  force, and its config files are as they were
- **AND** the same reservation beside a DECLARED 60–79 still refuses to boot, naming the reserved range

#### Scenario: The console is told the band in force, and only a declared band is written

- **WHEN** a console reads the catalogue of a linked station with none declared **THEN** it is told 60–79,
  origin `default`
- **WHEN** a station-admin declares 70–79 and then withdraws it **THEN** the console is told 70–79 as
  declared, then 60–79 as the default again, and the band file holds 70–79 and then no band at all

#### Scenario: A bank change can turn the default off

- **WHEN** a bank whose rows sit in 60–79 is declared on a linked station **THEN** no band is in force and the
  catalogue is published again
- **WHEN** a bank on the standard map is declared instead **THEN** the band is unchanged and nothing is
  published (the control)
