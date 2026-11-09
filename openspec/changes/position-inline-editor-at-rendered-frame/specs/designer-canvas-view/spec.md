## ADDED Requirements

### Requirement: The inline text editor follows the displayed frame

Designer SHALL open inline text editing at the text layer's rendered position
in the currently displayed Canvas frame. The edit SHALL apply to that text
element across its animation.

#### Scenario: Edit text while its position is animated

- **GIVEN** a text layer has position keyframes and the playhead shows a frame where the layer has moved
- **WHEN** the author double-clicks the visible text
- **THEN** the inline editor opens at its rendered position
- **AND** committing the edit updates the text on the same animated layer
