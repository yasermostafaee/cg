# designer-video-element — delta (polish-video-import-and-timeline-feedback, 2026-11-02)

## ADDED Requirements

### Requirement: Video import separates routine crop from troubleshooting corrections

The ready Video-import modal SHALL keep Crop visible in its default view. Premultiplied alpha and
Alpha bleed SHALL remain opt-in and default off, but SHALL be placed inside a closed Advanced
corrections section. Their technical purpose and conversion-cost guidance SHALL be available through
contextual information actions rather than permanent paragraphs. Errors and result warnings SHALL
remain visible.

#### Scenario: The ready modal starts with only routine options open

- **WHEN** a source has been probed and the Video-import modal becomes ready
- **THEN** Crop is visible
- **AND** Premultiplied alpha and Alpha bleed are not visible until Advanced corrections is opened

#### Scenario: Advanced corrections preserve their existing behaviour

- **WHEN** the operator opens Advanced corrections and enables either repair
- **THEN** that repair still changes conversion/provenance exactly as before
- **AND** its explanation and performance cost are reachable from an Info action

### Requirement: A timeline scrub after Pause returns media to authoring control

Pausing Designer canvas Play SHALL preserve the lifecycle so Play can resume it. When the author then
starts a ruler-owned scrub, the Designer SHALL leave that paused lifecycle before changing the frame
and SHALL position every Video through the static authoring scrub path. Exported/on-air behaviour and
a Pause that is resumed without scrubbing SHALL be unchanged.

#### Scenario: The author scrubs a paused Video

- **WHEN** the author presses Play, presses Pause and then drags the timeline ruler to another frame
- **THEN** the paused lifecycle releases ownership
- **AND** the visible Video is positioned at the requested frame

#### Scenario: Pause still resumes when there was no scrub

- **WHEN** the author presses Play, presses Pause and then presses Play without moving the ruler
- **THEN** the same lifecycle resumes from its paused state
