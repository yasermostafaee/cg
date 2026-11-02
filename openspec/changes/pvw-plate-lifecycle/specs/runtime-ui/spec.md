## ADDED Requirements

### Requirement: The local PVW transport SHALL control the whole preview composite
PVW SHALL start with each template and its Live Source markers hidden. Play SHALL reveal and drive all preview layers and their markers together; Stop SHALL hide both. Next SHALL preserve current visibility. PVW SHALL offer no Safe Area toggle or guides.

#### Scenario: Before Play
- **WHEN** a row with Live Sources enters PVW **THEN** neither its template nor its Live Source markers are visible

#### Scenario: Play and Stop
- **WHEN** Play is pressed **THEN** the template and markers appear together, and **WHEN** Stop is pressed **THEN** both disappear together

#### Scenario: No Safe Area control
- **WHEN** PVW is visible **THEN** no Safe Area toggle or guides are rendered
