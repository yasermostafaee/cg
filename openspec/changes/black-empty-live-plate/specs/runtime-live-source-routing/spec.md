## ADDED Requirements

### Requirement: A valid Live Source plate SHALL show its authored fallback while its upstream has no picture

For every valid assigned Live Source, the graphics bed SHALL preserve the selected Bars/solid-colour/picture fallback whenever the routed producer is transparent/empty. Bars SHALL be the default for an older scene. The fallback SHALL occupy the Bridge-resolved visible fitted rectangle. A resumed picture SHALL cover it without a template re-take. An invalid or unavailable source SHALL still be refused before on-air state changes.

#### Scenario: Playlist ends

- **WHEN** an assigned playlist output remains valid but its current item ends with no next picture **THEN** the plate shows its selected fallback at the producer's visible fitted geometry

#### Scenario: Bars is the default

- **WHEN** the author has not selected a solid colour or picture **THEN** the Designer picker shows a Bars thumbnail and the on-air fallback is SMPTE Bars

#### Scenario: Picture resumes

- **WHEN** that output begins producing picture again **THEN** the picture covers the selected fallback without re-taking the graphic

#### Scenario: Invalid source remains refused

- **WHEN** the assigned source is unavailable or unusable **THEN** the take/update is refused and nothing on air changes
