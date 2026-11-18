## ADDED Requirements

### Requirement: Broadcast safe guides SHALL be optional view-only overlays

Designer canvas and CG Control PVW SHALL each provide a default-off Safe areas
toggle. Guides SHALL show concentric 93% Action and 90% Graphics bounds relative
to the active picture. They SHALL stay aligned during zoom, pan, monitor resize
and letterboxing, without intercepting pointer input. Visibility SHALL not alter
authored safe-area fields, dirty/history state, exported pages, PGM or programme commands.

#### Scenario: The designer checks placement at a different zoom

- **GIVEN** a project is open and guides are off
- **WHEN** the author enables Safe areas, zooms and pans
- **THEN** the guides track the composition's actual frame boundaries
- **AND** the project and its undo history remain unchanged
- **AND** toggling again removes the guides

#### Scenario: The operator checks a letterboxed PVW

- **GIVEN** PVW is empty, loading a graphic, or rehearsing in a differently shaped monitor
- **WHEN** Safe areas is enabled and the monitor resizes
- **THEN** the bounds are relative to the fitted active raster, excluding black bars
- **AND** no guide appears inside template pages or on PGM
- **AND** no programme command is sent
