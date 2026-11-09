## ADDED Requirements

### Requirement: A valid Live Source plate SHALL show its authored fallback while its upstream has no picture

When Show fallback is enabled, the graphics bed SHALL paint the selected Bars/solid-colour/picture
behind the entire plate. A valid empty producer exposes the background, and a contained input
exposes it in the unfilled part of the plate. Bars SHALL be the default for a new plate and for a
legacy plate without a fallback or poster. A resumed picture SHALL cover the area it fills without
a template re-take. An invalid or unavailable source SHALL still be refused before on-air state changes.

#### Scenario: Playlist ends

- **WHEN** an assigned playlist output remains valid but its current item ends with no next picture
  **THEN** the plate shows its selected fallback across the plate when enabled

#### Scenario: The author turns off the background

- **WHEN** Show fallback is unchecked in Designer **THEN** the empty and uncovered portions of the
  plate are transparent in the exported page, with the chosen fallback settings preserved
- **WHEN** it is checked again **THEN** the previous Bars, colour or picture paints behind the plate

#### Scenario: A new plate starts with Bars

- **WHEN** the author creates a Live Source plate **THEN** its default fallback is SMPTE Bars
- **AND** the picker shows a Bars thumbnail and still offers solid colour or image choices

#### Scenario: An older plate retains its Bars fallback

- **WHEN** an older scene has neither an explicit fallback nor a poster **THEN** its fallback is SMPTE Bars

#### Scenario: Picture resumes

- **WHEN** that output begins producing picture again **THEN** the picture covers the selected fallback without re-taking the graphic

#### Scenario: Invalid source remains refused

- **WHEN** the assigned source is unavailable or unusable **THEN** the take/update is refused and nothing on air changes
