## ADDED Requirements

### Requirement: Designer safe guides SHALL use the project's output frame

Designer SHALL use a project output raster independent of active composition dimensions. New projects SHALL use the selected project resolution as the initial output raster. An explicit saved raster SHALL take priority. Older projects with a 1280×720 root resolution SHALL use 1280×720 when no output raster was saved. Other legacy projects SHALL retain the 1920×1080 fallback. The Safe guides settings SHALL show the project output dimensions as read-only. Users SHALL be able to change the active composition's output anchor and position. The position fields SHALL show the composition's top-left coordinates in project output pixels. The project raster SHALL be the authoring pixel reference for placement. A composition with the same dimensions as the project SHALL fill the project at its default position. Choosing an anchor again SHALL clear both manual offsets. Entering or dragging X or Y SHALL show the resulting project coordinates and clear the selected anchor indicator while the composition is offset. The output outline, composition footprint, and guides SHALL respond to pan and zoom together. Users SHALL be able to fit the output frame from the canvas toolbar. The status bar SHALL display the project output dimensions and active composition dimensions as distinct readouts.

#### Scenario: A subtitle composition is smaller than its project output

- **GIVEN** a project output is 1920×1080 and an active composition is 1920×190
- **WHEN** the user positions the composition at bottom center and shows Safe areas
- **THEN** the output starts at project coordinates `(0, 0)` and the composition starts at `(0, 890)`
- **AND** the standard and custom guides keep their geometry on the 1920×1080 output when the composition is resized
- **AND** the editor can fit the full output while the composition content keeps its own coordinate system

#### Scenario: An HD project has its own output raster

- **GIVEN** the user creates a 1280×720 HD project
- **WHEN** Safe areas are enabled and the active composition is resized
- **THEN** the project outline and safe areas stay relative to 1280×720
- **AND** the graphics-safe rectangle in Auto is 1152×648, inset by 64 pixels horizontally and 36 pixels vertically
- **AND** the dedicated Preview uses the same project raster

#### Scenario: An output placement is saved and exported

- **GIVEN** a 100×100 composition with an authored output position
- **WHEN** the project is saved, reopened, and that composition is exported
- **THEN** the project remembers its output raster and the composition's position
- **AND** the exported template has a 100×100 raster and carries the position through the existing output default
- **AND** a non-default project reference is carried as outputReference while editor preferences and guide drawings stay outside the export
- **AND** existing nested composition instances use their own transforms

#### Scenario: A project has an older authored position

- **GIVEN** a project has a default position and a composition has no individual output position
- **WHEN** the composition is placed in Designer or exported
- **THEN** it inherits that default position until its own position is authored

#### Scenario: The composition is rehearsed on the project output

- **GIVEN** a cropped composition has an output placement
- **WHEN** its dedicated Preview opens
- **THEN** the checkerboard fills the fitted project output raster
- **AND** the composition draws at its authored output position, in native project coordinates
- **AND** the picture remains clipped to the project frame while the composition retains its own raster, playback, and field updates

#### Scenario: A channel raster differs from the authored project raster

- **GIVEN** a package carries a native 1280×720 output reference
- **WHEN** it plays on a 1920×1080 channel
- **THEN** the HTML graphics, native plates and PVW use the same uniform 1.5× scale
- **AND** packages that omit an output reference continue to use the legacy 1920×1080 reference
