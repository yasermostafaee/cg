# designer-canvas-viewport — delta (the canvas backdrop is an EDITOR fact, B-129)

## ADDED Requirements

### Requirement: The canvas backdrop is an editor affordance and never reaches the output

The scene-level and composition-level backdrop colour SHALL be an EDITOR affordance only: a
viewing aid that makes authored content legible while working. It SHALL NOT be a property of
what the scene renders to air, and it SHALL NOT be carried into an exported package.

The field SHALL be named for that meaning (`editorBackdrop`), and a scene parsed by the current
schema SHALL NOT carry a general-purpose `background` field on its scene or composition objects.
A legacy `background` key SHALL be normalized to `editorBackdrop` at parse time, so scenes
authored before this decision load unchanged and the discarded spelling cannot be reintroduced
by a caller that still writes it. There SHALL NOT be two fields kept in sync.

The renderer SHALL paint the backdrop only when rendering for authoring. When rendering for
output it SHALL paint nothing, so the output background is transparent unless a real element
paints it. This SHALL hold for the scene root and for every nested composition instance.

An exporter SHALL emit the backdrop as transparent, so an exported artifact cannot carry the
value even if a renderer failed to honour the mode.

An author SHALL still be able to express a background deliberately, by placing a full-frame
element; that element is a real entry in the scene and SHALL render unchanged.

The control that sets the backdrop SHALL state that it is editor-only and does not reach air,
so an author is never told one thing by the editor and another by the output.

#### Scenario: A scene with no background element renders transparent

- **WHEN** a scene whose author never placed a background element is rendered for output
- **THEN** the output background is transparent, regardless of any backdrop colour the author
  set while editing

#### Scenario: A deliberately placed full-frame rectangle still renders

- **WHEN** a scene contains a full-frame rectangle element
- **THEN** it renders unchanged in output, so "the author wanted a background" stays expressible

#### Scenario: The editor's own backdrop is never a property of the exported scene

- **WHEN** a scene carrying a non-transparent backdrop is exported
- **THEN** the exported scene carries a transparent backdrop, and the artifact paints no
  background of its own

#### Scenario: A scene authored before this decision still loads and still looks the same to edit

- **WHEN** a stored scene carrying the legacy `background` key is parsed
- **THEN** the value is normalized onto `editorBackdrop`, the parsed scene exposes no
  `background` field, and rendering for authoring paints the same colour it did before

#### Scenario: The author is told what the backdrop does

- **WHEN** the author opens the backdrop control
- **THEN** it states that the backdrop is an editor affordance that does not reach air
