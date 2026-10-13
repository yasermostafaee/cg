# designer-canvas-view

## MODIFIED Requirements

### Requirement: Snap-while-dragging with smart guides

When the Snapping preference is on, dragging an element on the canvas SHALL snap
the element's left/center/right and top/middle/bottom to the canvas edges and
center and to other elements' edges and centers, within a small screen-space
threshold that is constant across zoom levels, and SHALL draw guide lines for
the active snaps. When the preference is off, dragging SHALL move the element
freely with no snapping of any kind (neither smart guides nor the pixel grid)
and no guide lines. The Snapping preference is the MASTER snap switch: it also
governs the pixel-grid snapping at high zoom (see "Pixel-snap moves to the grid
at high zoom"), and holding **Alt** during a drag momentarily bypasses ALL
snapping (free placement) regardless of the preference or the zoom.

**`B-181` — a RESIZE gesture SHALL decide its snap on the rect it is about to commit, never on the
pointer.** The candidate rect SHALL be solved from the raw pointer with any aspect lock already
applied; the coordinates tested against the snap targets SHALL be the MOVING EDGE(S) of that
candidate — the ones the grabbed handle actually drives; and a snap SHALL be realised by re-solving
through the same resize solver so the edge lands exactly on the target with the lock still
satisfied, never by displacing the pointer and accepting whatever rect follows.

This distinction is invisible for an unlocked resize, where the solver places the grabbed edge at
the pointer and the two are identically equal. It is the whole defect under an aspect lock, where
the solver returns a rect satisfying the ratio and a CORNER handle's extents are projected onto the
locked diagonal, separating pointer from edge by construction.

🔴 **The guide a resize draws SHALL be a function of the COMMITTED rect.** It SHALL be emitted only
for an axis whose committed edge is genuinely ON a target — within the floating-point noise floor,
not merely within the snap threshold — so the canvas can never announce a snap the geometry
refused. A snap that the `MIN_SIZE` clamp or the lock prevents SHALL therefore produce no guide.

**Where an aspect lock ties the two extents and a corner handle is in range of targets on both
axes, the NEARER target SHALL win**, with a deterministic tie to the horizontal axis. The axis the
lock then FORCES SHALL NOT be given a guide merely for landing near a target; it SHALL be given one
only if it lands on one. Snapping SHALL remain gated on an unrotated element, the threshold SHALL
remain a constant screen-space distance, and **Shift** SHALL remain this gesture's bypass for both
the snap and the whole-pixel quantise.

#### Scenario: Element snaps to canvas center with a guide

- **WHEN** snapping is on and the operator drags an element so its center nears
  the canvas center
- **THEN** the element's center aligns to the canvas center and a guide line is
  shown there

#### Scenario: Element snaps to another element's edge

- **WHEN** snapping is on and the operator drags an element so an edge nears
  another element's edge
- **THEN** the edges align and a guide line is shown

#### Scenario: Snapping off drags freely

- **WHEN** snapping is off and the operator drags an element (at any zoom,
  including pixel-grid zoom)
- **THEN** the element follows the cursor with no snapping of any kind (neither
  smart guides nor the pixel grid) and no guide lines

#### Scenario: An aspect-locked corner lands its edge exactly on the target

- **WHEN** snapping is on and the operator drags the corner handle of a plate whose
  aspect is locked, so that the resulting box's moving edge comes within the snap
  threshold of a neighbour's edge
- **THEN** the committed rect's moving edge is exactly on that target, the aspect is
  still satisfied, and the corner opposite the handle has not moved

#### Scenario: The guide is drawn where the box is, not where the pointer is

- **WHEN** an aspect-locked corner is dragged with the pointer sitting on a target
  but the locked solution placing the box's edge away from it
- **THEN** the guide is drawn at the committed edge's coordinate, and no guide is
  drawn at the pointer's

#### Scenario: A snap the geometry cannot take draws nothing

- **WHEN** a resize is within the snap threshold of a target but the committed edge
  does not reach it — because the lock forced the other axis, or the minimum-size
  clamp overrode the extent
- **THEN** no guide line is drawn for that axis

#### Scenario: A locked corner in range on both axes takes the nearer target

- **WHEN** an aspect-locked corner's committed edges are within the threshold of a
  target on both axes
- **THEN** the nearer target is the one satisfied, the other axis follows from the
  lock, and only the satisfied axis is given a guide unless the forced axis also
  lands exactly on a target

#### Scenario: An unlocked resize is unchanged

- **WHEN** the operator resizes an element that has no aspect lock
- **THEN** the grabbed edge lands on the target exactly as it did before, because the
  solver places that edge at the pointer and the two are identically equal

#### Scenario: Shift bypasses the resize snap entirely

- **WHEN** the operator holds Shift while dragging a resize handle
- **THEN** nothing snaps, no guide line is drawn, and the placement keeps its
  fractional part
