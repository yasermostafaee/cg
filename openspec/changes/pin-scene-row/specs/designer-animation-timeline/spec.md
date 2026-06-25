# designer-animation-timeline (delta)

## ADDED Requirements

### Requirement: Pinned scene row in the timeline layers panel

The timeline layers panel SHALL keep the scene/root row pinned at the top of BOTH columns — the
left label and the right lane — while the element rows scroll vertically under it, and each
element row's left label SHALL stay vertically aligned with its right lane at every scroll offset.
The pin SHALL preserve the existing synced-scroll model (the left column is driven by a transform
that mirrors the right lane body's scrollTop, not its own native scrollTop) and SHALL keep the
scene row's height equal on both columns so the two never drift.

#### Scenario: The scene row stays pinned on both columns while the layers scroll

- **WHEN** the layers list has enough rows to overflow and is scrolled vertically
- **THEN** the scene/root row stays fixed at the top of both the left label column and the right
  lane column, while the element rows/lanes scroll under it

#### Scenario: Each layer's label stays aligned with its lane after scrolling

- **WHEN** the layers are scrolled vertically
- **THEN** every element row's left label remains vertically aligned with its right lane (no
  drift), exactly as at scroll offset zero
