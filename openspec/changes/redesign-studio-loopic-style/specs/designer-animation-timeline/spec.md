## ADDED Requirements

### Requirement: Right-click on a keyframe removes it

The Designer SHALL treat a right-click (context-menu gesture) on a
keyframe diamond as a remove command — the keyframe MUST be removed
from the track immediately and the browser's default context menu
MUST NOT open over the diamond.

#### Scenario: Right-click on an existing keyframe removes it
- **WHEN** the operator right-clicks a keyframe diamond at frame N
  on the Position X row
- **THEN** the keyframe at frame N is removed from
  `element.animation.tracks['position.x']`, the diamond disappears
  from the lane, and the browser context menu does not open

#### Scenario: Right-click on an empty lane is a no-op
- **WHEN** the operator right-clicks an empty lane area on a track
  row
- **THEN** no keyframe is removed and the browser context menu does
  not open (the lane swallows the gesture)
