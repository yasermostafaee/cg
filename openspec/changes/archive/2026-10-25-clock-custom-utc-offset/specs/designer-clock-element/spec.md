# designer-clock-element (delta)

## MODIFIED Requirements

### Requirement: Clock element with format-driven time text

The schema SHALL allow a wall clock to select exactly one of three time sources: machine-local
time (neither optional field present), an IANA `timezone`, or a fixed `utcOffsetMinutes` integer.
`utcOffsetMinutes` SHALL be bounded from `-840` through `+840` and SHALL be mutually exclusive with
`timezone`. Both optional fields SHALL be additive and backward-compatible: an existing clock
without the new field parses and renders unchanged, with no schema-version bump or migration.

The wall clock SHALL derive fixed-offset components by shifting the absolute instant by the authored
minutes and reading UTC components, so the result does not inherit the machine's time zone or DST.
The existing format tokens, 12/24-hour conversion and digit mapping SHALL apply afterwards without
change. Countup and countdown SHALL ignore both wall-time source fields.

#### Scenario: A half-hour custom offset reaches the wall clock

- **WHEN** a wall clock carries `utcOffsetMinutes: 210`
- **THEN** preview and export show the current time at fixed UTC+03:30 with the authored format and
  digit script

#### Scenario: A fixed offset wraps across a UTC day boundary

- **WHEN** the absolute instant is near midnight and the authored fixed offset crosses the day
- **THEN** the displayed hour/minute/second are the correctly wrapped fixed-offset components

#### Scenario: Time zone and fixed offset cannot conflict

- **WHEN** an authored clock carries both `timezone` and `utcOffsetMinutes`
- **THEN** schema validation refuses it instead of choosing an implicit winner

#### Scenario: Count modes ignore custom offset

- **WHEN** mode is `countup` or `countdown` and an offset is present
- **THEN** elapsed/remaining time behaves exactly as before

### Requirement: Designer authoring — time-driven, not scrubbed

For a wall clock, the Inspector SHALL show only Local and Custom offset as explicit `time source`
choices. Custom offset SHALL show one fixed `±HH:MM` mask, accept Latin, Persian and Arabic-Indic
digits, and accept only real offsets inside `-14:00…+14:00`. The sign and separator SHALL be owned
by the mask; letters or impossible digits SHALL not enter the displayed value. Changing source
SHALL clear the mutually exclusive field. Legacy IANA values SHALL remain schema/runtime-readable
but SHALL NOT be authorable in the Inspector.

#### Scenario: The author selects a custom offset

- **WHEN** the author changes a wall clock's time source to Custom offset and enters `+03:30`
- **THEN** the scene stores `utcOffsetMinutes: 210`, clears `timezone`, and the canvas renders that
  fixed-offset time

#### Scenario: The mask refuses non-time input before display

- **WHEN** the author types letters, invalid minutes, or a value beyond `±14:00`
- **THEN** the characters do not enter the mask and the last valid scene value stays unchanged

#### Scenario: Legacy IANA data remains playable but not authorable

- **WHEN** an existing scene carries `timezone`
- **THEN** schema/runtime parsing keeps its old result, while the Inspector offers no Time zone
  option and either visible source replaces the legacy value when committed

#### Scenario: Local clears authored wall-time sources

- **WHEN** the author selects Local
- **THEN** both `timezone` and `utcOffsetMinutes` are absent and the machine's local time renders
