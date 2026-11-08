# designer-animation-timeline Specification

## ADDED Requirements

### Requirement: A normally added element SHALL enter at the front of its sibling stack

The normal Add path SHALL append the element in Timeline/document order and assign a `zIndex`
strictly above every existing sibling, so the Timeline's front-most row and the renderer's
front-most paint are the same immediately. This SHALL remain true when earlier row reorders have
already assigned explicit distinct `zIndex` values.

#### Scenario: Add after a reorder

- **GIVEN** a sibling set has been reordered and contains increasing explicit `zIndex` values
- **WHEN** the author adds a text element over a live plate
- **THEN** the text is the top Timeline row and the last-painted sibling without requiring another
  row drag
