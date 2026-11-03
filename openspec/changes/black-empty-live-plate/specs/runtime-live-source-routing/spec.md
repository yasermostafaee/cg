## ADDED Requirements

### Requirement: A valid Live Source plate SHALL stay black while its upstream has no picture

For every valid assigned Live Source, CG Bridge SHALL preserve the authored rectangle with an opaque black fallback whenever the routed producer is transparent/empty. A resumed picture SHALL cover that fallback without a template re-take. An invalid or unavailable source SHALL still be refused before on-air state changes.

#### Scenario: Playlist ends

- **WHEN** an assigned playlist output remains valid but its current item ends with no next picture **THEN** the plate remains an opaque black rectangle at its authored geometry

#### Scenario: Picture resumes

- **WHEN** that output begins producing picture again **THEN** the picture replaces the black fallback without re-taking the graphic

#### Scenario: Invalid source remains refused

- **WHEN** the assigned source is unavailable or unusable **THEN** the take/update is refused and nothing on air changes
