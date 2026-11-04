## ADDED Requirements

### Requirement: The starter gallery teaches current Persian broadcast workflows

The Designer SHALL offer production-quality Persian starter projects for the existing gallery and
for data-rich sports, weather, image-sequence, countdown-step and multibox workflows.

#### Scenario: Author opens the Azadegan League table

- **WHEN** the author chooses the Azadegan League starter
- **THEN** a one-page standings graphic opens with Persian labels, Persian team names and complete
  editable default rows

#### Scenario: Author opens multi-page province weather

- **WHEN** the author chooses the province-capital weather starter
- **THEN** the project opens with a Sequence containing multiple pages whose weather-card Repeaters
  are already populated
- **AND** the same project shape is compatible with generated file-backed page data

#### Scenario: Author opens a one-page forecast

- **WHEN** the author chooses the forecast starter
- **THEN** today and upcoming days fit in one composition
- **AND** the repeated forecast rows do not require an outer Sequence

#### Scenario: Author explores current capability examples

- **WHEN** the author opens the image-sequence, countdown or multibox starter
- **THEN** that project visibly demonstrates folder-backed Sequence authoring, target Countdown Steps
  or a designed multi-source layout respectively

### Requirement: Starter cards honestly preview their projects

Every starter SHALL have a poster rendered from the starter scene and SHALL open as a schema-valid,
editable project with a real playout lifecycle and complete default data.

#### Scenario: Gallery is listed

- **WHEN** the landing page lists starter cards
- **THEN** every card has a project-derived poster and concise capability description
- **AND** no English Premier League starter is present
