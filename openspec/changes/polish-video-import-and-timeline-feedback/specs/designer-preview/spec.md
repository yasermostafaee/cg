# designer-preview — delta (polish-video-import-and-timeline-feedback, 2026-11-02)

## MODIFIED Requirements

### Requirement: Preview shows the root runtime frame

The Designer timeline and Preview workspace SHALL display the root composition frame currently
owned by runtime. A timed/manual parked hold remains fixed. When a content-driven hold has a
non-empty authored Middle loop, the reported root frame SHALL advance through that range and wrap to
Content start, including when time-driven Video/Lottie is the only moving picture and composition
paint itself remains collapsed. Nested-scope frames SHALL NOT replace the root report.

#### Scenario: An active Middle loop advances and wraps the playhead

- **WHEN** the root composition waits in a content-driven hold with a non-empty Middle loop range
- **THEN** the reported frame advances through `[Content start → Out point]`
- **AND** wraps to Content start while the content driver continues uninterrupted

#### Scenario: A parked hold remains parked

- **WHEN** a timed/manual hold has no active visual loop
- **THEN** the reported frame remains fixed until Outro starts
