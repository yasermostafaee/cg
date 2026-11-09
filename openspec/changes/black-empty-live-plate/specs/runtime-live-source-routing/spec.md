## ADDED Requirements

### Requirement: A valid Live Source plate SHALL show its authored fallback while its upstream has no picture

When Show fallback on air is enabled, the graphics bed SHALL paint the selected Bars/solid-colour/picture
behind the entire plate in PGM. Designer and PVW SHALL display the selected background in either state. A valid empty producer exposes the background, and a contained input
exposes it in the unfilled part of the plate. Bars SHALL be the default for a new plate and for a
legacy plate without a fallback or poster. A resumed picture SHALL cover the area it fills without
a template re-take. An invalid or unavailable source SHALL still be refused before on-air state changes.

#### Scenario: Playlist ends

- **WHEN** an assigned playlist output remains valid but its current item ends with no next picture
  **THEN** the plate shows its selected fallback across the plate when enabled

#### Scenario: The author turns off the background

- **WHEN** Show fallback on air is unchecked **THEN** the empty and uncovered portions of the plate
  are transparent in PGM
- **AND** Designer and PVW keep showing the chosen Bars, colour or picture
- **WHEN** it is checked again **THEN** the previously selected background paints behind the plate in PGM

#### Scenario: A live picture fills a plate whose edge is between output pixels

- **GIVEN** an unmasked plate with an available source and a fit that fills the whole plate
- **WHEN** its fallback and source are composited at a fractional output edge
- **THEN** the live picture covers the last raster row painted by the fallback
- **AND** genuine contain margins and authored mask windows keep their intended geometry

#### Scenario: A new plate starts with Bars

- **WHEN** the author creates a Live Source plate **THEN** its default fallback is SMPTE Bars
- **AND** the picker shows a Bars thumbnail and still offers solid colour or image choices

#### Scenario: An older plate retains its Bars fallback

- **WHEN** an older scene has neither an explicit fallback nor a poster **THEN** its fallback is SMPTE Bars

#### Scenario: Picture resumes

- **WHEN** that output begins producing picture again **THEN** the picture covers the selected fallback without re-taking the graphic

#### Scenario: Invalid source remains refused

- **WHEN** the assigned source is unavailable or unusable **THEN** the take/update is refused and nothing on air changes
