## ADDED Requirements

### Requirement: Authors SHALL mark visual elements that paint above live inputs

When a document contains a Live Source plate, Designer SHALL let the author mark a supported visual
element for the live-input foreground pass. The marker SHALL persist with the element and SHALL not
change its ordinary scene transform, field bindings, Timeline order or authoring visibility. Keeping
the marked element and plate in the same composition/look unit SHALL make their geometry travel
together without rewriting CG Control field values.

#### Scenario: Title travels with its framed input

- **GIVEN** a composition contains a Live Source plate and its marked title
- **WHEN** a multi-box look moves or swaps that composition
- **THEN** the plate and title evaluate the same authored composition transform
- **AND** no text field is deleted or re-entered to perform the swap

#### Scenario: Ordinary scene has no foreground control

- **GIVEN** a document contains no Live Source plate and no existing foreground marker
- **WHEN** an ordinary visual element is selected
- **THEN** Designer does not present a live-input foreground control
