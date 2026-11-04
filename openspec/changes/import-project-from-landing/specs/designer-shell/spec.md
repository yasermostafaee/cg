## ADDED Requirements

### Requirement: Landing imports an existing project directly

The Designer SHALL implement the following accepted authoring behavior without modifying stored scene timing or broadcast commands.

#### Scenario: Open an existing project

- **WHEN** the author chooses Import project and a valid .cgproj
- **THEN** the project opens directly in Studio without creating a temporary project

#### Scenario: Cancel import

- **WHEN** the file picker is cancelled
- **THEN** Landing remains unchanged
