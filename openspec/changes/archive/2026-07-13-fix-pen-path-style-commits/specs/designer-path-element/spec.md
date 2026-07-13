# designer-path-element (B-051 delta)

## ADDED Requirements

### Requirement: Path Style edits apply

A `path` element's static Path Style edits SHALL apply: editing the solid fill colour, stroke
colour, stroke width, or dash array SHALL mutate the element model, re-render in the canvas
preview, and carry through the `.vcg` and single-file HTML exports, exactly as the same edits do
on a shape. This SHALL hold
whether or not the property has a keyframe track (a track routes the edit to a keyframe at the
playhead, as before; without one the static base value SHALL be written — never silently
dropped). The content-driven kinds (ticker / clock / sequence) SHALL continue to REFUSE static
stroke writes (no dead `stroke` data on kinds that carry no box).

#### Scenario: Static style edits mutate and render

- **WHEN** the operator edits a pen path's stroke width, stroke colour, dash array, or solid fill
  colour in the Inspector with no keyframe track on the property
- **THEN** the element model changes accordingly and the canvas preview re-renders the path with
  the new style

#### Scenario: Edited style survives export

- **WHEN** a pen path styled this way is exported
- **THEN** the exported output renders the same fill, stroke colour, stroke width, and dash

#### Scenario: Content-driven kinds still refuse stroke writes

- **WHEN** a static stroke write is attempted on a ticker, clock, or sequence
- **THEN** the write is refused and no `stroke` data appears on the element
