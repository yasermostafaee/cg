# designer-shell Delta

## MODIFIED Requirements

### Requirement: New Project modal collects size + frame rate

The "New project" affordance SHALL open a modal that collects a name, a resolution and a frame
rate. The frame-rate choices SHALL be 25, 29.97, 30, 50, 59.94 and 60 fps. Resolution SHALL offer
the reference-safe square-pixel footprints 1920×1080 Full HD reference, 1280×720 Small canvas and
1080×1080 Square canvas, plus Custom W×H. Full HD reference SHALL remain the default. Smaller
footprints SHALL say “canvas” rather than imply they fill an equally sized output channel. The list
SHALL NOT label UHD, QHD or
portrait-FHD as a safe full-frame output while placement still uses a fixed 1920×1080 reference,
and SHALL NOT label a non-square-pixel SD raster as safe while the project contract has no
pixel-aspect field.
Confirming SHALL create the scene and its initial composition with those settings and switch to
Studio; cancelling SHALL leave Landing unchanged.

#### Scenario: Operator creates a 30 fps small canvas

- **WHEN** the operator selects Small canvas, 30 fps and 10 seconds and confirms
- **THEN** the active scene and first composition use 1280×720, the scene uses `frameRate: 30`,
  and its frame range contains 300 frames

#### Scenario: Operator sees only honest named presets

- **WHEN** the operator opens the Resolution selector
- **THEN** Full HD reference, Small canvas and Square canvas are identified by exact dimensions and
  honest names, while UHD, QHD, portrait and non-square SD are not presented as safe output formats

#### Scenario: Operator creates a custom-size project

- **WHEN** the operator selects Custom, enters a positive W×H, chooses a supported frame rate and
  confirms
- **THEN** the new scene and initial composition use the exact rounded integer pixel dimensions

#### Scenario: Project format survives persistence and export

- **WHEN** a 30 fps standard-preset project is saved, reopened or exported to VCG
- **THEN** its scene/template and manifest preserve the selected frame rate and pixel raster, and
  the package declares rendering contract 1.1.0

#### Scenario: Operator cancels the New Project modal

- **WHEN** the modal is open and the operator activates Cancel or Escape
- **THEN** the modal closes and the Designer remains on Landing

## ADDED Requirements

### Requirement: Linked duration fields share one field geometry

The New Project Total frames and Duration controls SHALL occupy the same value-column width.
Duration SHALL render its `s` unit inside the same bordered field as its numeric value by using the
shared numeric-field primitive.

#### Scenario: Duration unit remains inside the aligned field

- **WHEN** New Project displays the linked Total frames and Duration controls
- **THEN** their field borders have equal width and `s` appears inside Duration's border
