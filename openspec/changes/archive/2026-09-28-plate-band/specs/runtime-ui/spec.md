## ADDED Requirements

### Requirement: Station setup SHALL show the plate band in force, and SHALL say default when it is computed

Station setup → Live sources SHALL show the plate band in force — the declared band, or a Playout-linked
station's default — and SHALL say `default` when it is the computed one. A declared band SHALL read as it did,
with no `default`; with no band in force the tab SHALL read as it did. A station-admin's band fields SHALL show
the band in force, and only a press of Apply band SHALL declare it.

#### Scenario: The default, on a real linked bridge

- **WHEN** a station-admin opens Live sources on a Playout-linked station with nothing declared **THEN** the
  band reads `Currently 60–79 · default · 20 layers.` and the band fields read 60 and 79

#### Scenario: A reserved layer, or a declared band

- **WHEN** the station reserves layer 65 **THEN** the band reads as it did with none in force:
  `Nothing is declared yet; 60–79 is the usual choice.`
- **WHEN** the station declares 70–79 **THEN** the band reads `Currently 70–79 · 10 layers.` with no `default`

#### Scenario: Only a press declares it

- **WHEN** a station-admin opens the tab on a station with the default in force **THEN** nothing is sent
- **WHEN** they press Apply band with the fields untouched **THEN** 60–79 is declared, and the tab stops
  calling it the default
