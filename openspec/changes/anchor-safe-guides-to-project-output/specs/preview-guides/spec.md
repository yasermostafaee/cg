## ADDED Requirements

### Requirement: Designer safe guides SHALL use the project's output frame

Designer SHALL use a project output raster independent of active composition dimensions. Designer SHALL default the project output to 1920×1080 when there is no saved output raster. Users SHALL be able to change the project's output width and height and the active composition's output anchor and position. The position fields SHALL show the composition's top-left coordinates in project output pixels. Placement SHALL use the existing reference-frame scale, letterbox, anchor, and offsets. The output outline, composition footprint, and guides SHALL respond to pan and zoom together. Users SHALL be able to fit the output frame from the canvas toolbar.

#### Scenario: A subtitle composition is smaller than its project output

- **GIVEN** a project output is 1920×1080 and an active composition is 1920×190
- **WHEN** the user positions the composition at bottom center and shows Safe areas
- **THEN** the output starts at project coordinates `(0, 0)` and the composition starts at `(0, 890)`
- **AND** the standard and custom guides keep their geometry on the 1920×1080 output when the composition is resized
- **AND** the editor can fit the full output while the composition content keeps its own coordinate system

#### Scenario: An output placement is saved and exported

- **GIVEN** a 100×100 composition with an authored output position
- **WHEN** the project is saved, reopened, and that composition is exported
- **THEN** the project remembers its output raster and the composition's position
- **AND** the exported template has a 100×100 raster and carries the position through the existing output default
- **AND** the editor output raster and guide drawings do not enter the exported template
- **AND** existing nested composition instances use their own transforms

#### Scenario: A project has an older authored position

- **GIVEN** a project has a default position and a composition has no individual output position
- **WHEN** the composition is placed in Designer or exported
- **THEN** it inherits that default position until its own position is authored
