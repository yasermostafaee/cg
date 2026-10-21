## ADDED Requirements

### Requirement: A duplicated or pasted plate takes the next free live-N, marked auto

Duplicating or pasting a Live Source plate SHALL give the copy the next `live-N` free where it lands (the active
composition's look, as for a drawn plate), marked `routeKeyAuto` until the author confirms or replaces it; the
original SHALL keep its id. Every plate in one copy, and in one multi-element duplicate or paste, SHALL get a different
id. A plate with no id SHALL be copied without one.

#### Scenario: Duplicate

- **WHEN** a plate `live-1` is duplicated
- **THEN** the copy is `live-2`, marked auto, and the original is still `live-1`

#### Scenario: Paste twice

- **WHEN** a plate `live-1` is copied and pasted twice
- **THEN** the pasted plates are `live-2` and `live-3`, and the export finds no repeated source

#### Scenario: An unassigned plate

- **WHEN** a plate with no id is duplicated
- **THEN** the copy has no id either
