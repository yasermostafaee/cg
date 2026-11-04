# designer-shell Delta

## MODIFIED Requirements

### Requirement: Landing view as the entry screen

The Designer SHALL render a Landing view whenever no scene is open. The Landing view MUST display a
list of starter projects, a list of recent projects, and adjacent **New project** and **Import
project** affordances. **Import project** MUST use the same disk-project open operation as File →
Open; it MUST NOT require a temporary project.

#### Scenario: Designer opens with no active scene

- **WHEN** the Designer is opened and no scene is active
- **THEN** the entire viewport is filled by Landing, with adjacent **New project** and **Import
  project** actions, and no Studio shell is rendered

#### Scenario: Operator imports a saved project from Landing

- **WHEN** the operator chooses **Import project** on Landing and selects a valid `.cgproj`
- **THEN** the same disk-open operation used by File → Open loads the selected project as the active
  scene and switches directly to Studio
- **AND** no starter or temporary project is created first

#### Scenario: Operator cancels Landing import

- **WHEN** the operator chooses **Import project** and cancels the file picker
- **THEN** Landing remains visible with no active scene and no New Project dialog

#### Scenario: Operator picks a starter

- **WHEN** the operator clicks a starter card on the Landing view
- **THEN** the matching starter scene is loaded as the active scene and the Designer switches to the
  Studio view

#### Scenario: Operator picks a recent project

- **WHEN** the operator clicks a recent-project entry on the Landing view
- **THEN** the project at that path is opened and the Designer switches to the Studio view
