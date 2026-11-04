# designer-inspector Delta

## ADDED Requirements

### Requirement: Composition authoring controls use playback language and visible hierarchy

The composition Inspector SHALL title the group that authors mode, hold, out point and content
start **Playback**, because it controls the composition's own playback lifecycle rather than an
external Playout connection. Composition width and height SHALL use one paired control whose `W`
and `H` axis marks are inside their respective input segments. The body of an expanded Inspector
section SHALL be inset from its header, and timeline property rows SHALL be inset from their
second-level group title.

#### Scenario: Lifecycle authoring is labelled Playback

- **WHEN** no element is selected and the composition Inspector is visible
- **THEN** the lifecycle group is titled **Playback** and its mode control is labelled
  **Playback mode**

#### Scenario: Composition dimensions match element dimension controls

- **WHEN** the composition size row is visible
- **THEN** width and height share one grouped control with `W` and `H` inside the input segments
- **AND** editing either value updates the corresponding composition resolution dimension

#### Scenario: Expanded groups show parent-child hierarchy

- **WHEN** an Inspector section or timeline property group is expanded
- **THEN** its child controls or property rows begin one visual step inside the group heading
- **AND** nested groups may add one further step without hiding values or actions
