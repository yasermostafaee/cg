## ADDED Requirements

### Requirement: Designer authors can configure New project defaults

Designer SHALL allow authors to save their preferred project name, resolution preset and custom dimensions, frame rate, and frame duration from New project or Edit → Project defaults.

#### Scenario: A saved preference fills the New project form

- **WHEN** the author saves Project defaults and opens New project, including after reload
- **THEN** the form shows the saved values, with duration shown in frames and equivalent seconds
- **AND** opening the settings does not create or modify a project

#### Scenario: A project needs a one-off format

- **WHEN** the author overrides the form for one project or cancels a Project defaults edit
- **THEN** later forms keep using the saved defaults
