# runtime-multibox-layout

> Only the requirements SETTLED by `design.md` §0 appear here. Everything about HOW — the transition
> curve, the release policy for a dropped box, where the control lives, whether the layout set is
> authored or fixed — is an open owner question in `design.md` §12 and is deliberately absent. A
> requirement written before its gate is answered would be a guess with the authority of a spec.

## ADDED Requirements

### Requirement: Exactly ONE multi-box layout is active at a time

A template that declares more than one multi-box layout SHALL have **exactly one** of them active at
any moment. The operator SHALL be able to switch which one is active, and SHALL NOT be able to reach
a state in which two are active together.

Exclusivity SHALL be **structural** — a property of the single layout state a row carries, not a
rule enforced only by the operator surface. A surface-only rule can be violated by any path that
does not pass through that surface, and `design.md` §8 records two such paths that exist today
(`take()` and `restore()`).

The layout state SHALL have exactly ONE authority, read by the switch, by the mask and by the
live-plate reconcile. A second copy of "which layout is active" is precisely the drift this repo
forbids.

#### Scenario: The operator switches from the 3-box layout to the 2-box layout

- **WHEN** the operator switches a running row from its 3-box layout to its 2-box layout
- **THEN** the 2-box layout is the only one on air, and no part of the 3-box layout remains visible
  — neither its painted frames nor the holes its plates punched

#### Scenario: Switching back restores the previous layout exactly

- **WHEN** the operator switches back from 2-box to 3-box
- **THEN** the 3-box layout is the only one on air, and each box shows the same source it showed
  before the switch away

#### Scenario: No path reaches two active layouts on one row

- **WHEN** any path changes a row's layout — the operator control, a take, or a restore after
  reconnect
- **THEN** the row still has exactly one active layout, because the change replaces the single
  layout state rather than adding to a set

### Requirement: Source assignment SURVIVES a layout switch

A source the operator has assigned to a box SHALL remain on the corresponding box after a layout
switch. Switching 3-box → 2-box SHALL NOT scramble which source appears in which box.

Assignment SHALL continue to be keyed by `(templateId, plateId)`, where `plateId` is the element's
symbolic `routeKey` — never an element id, a plate index, or any other layout-local identity.

A layout SHALL be a set of **geometries and visibilities over the SAME plate set**, not a separate
set of plate elements per layout. A box therefore keeps ONE identity across every layout, so the
assignment tuple cannot change when the layout does. Separate plate sets are refused: two layouts of
the same screen area necessarily overlap, and overlapping holes are an export-blocking fault
(`live-source-overlap`) whose runtime consequence is that which source shows is a z-order accident.

#### Scenario: Camera 1 stays on the first box across a switch

- **GIVEN** the operator has assigned camera 1 to the first box of the 3-box layout
- **WHEN** the operator switches to the 2-box layout, in which that same plate takes a new rect
- **THEN** the box shows camera 1 at its new position and size, with no operator action

#### Scenario: A box with no counterpart in the target layout does not displace another source

- **GIVEN** a 3-box layout whose third box has a source assigned
- **WHEN** the operator switches to the 2-box layout, which has no third box
- **THEN** the two surviving boxes still show the sources they showed before, and the dropped box's
  source is not reassigned onto either of them

### Requirement: The layout switch and the live-source change are ONE mechanism

A layout switch and a source change SHALL be served by a **single** reconcile. Changing which plates
exist and where, and changing what one plate shows, are the same operation: resolve the desired
live-plate set for the row, then apply the delta against what is currently seated.

That reconcile SHALL resolve plates through the SAME resolver a take uses. A layout switch that
resolved plates its own way would be a second spelling of "which producer is behind this hole", and
the two would eventually disagree about a plate that is on air — the argument the existing
`swapLiveSource` already makes for itself, applied one level up.

For every mutation the reconcile performs — the plate set, the punch mask, the fit, and the layer
allocation — the corresponding INVERSE SHALL exist and be exercised by a test.

#### Scenario: A layout switch and a source swap take the same path

- **WHEN** a layout switch and a per-plate source swap each change what is on air
- **THEN** both are applied by the one reconcile, and neither has a seating path of its own

#### Scenario: The mask follows the plates it belongs to

- **WHEN** a layout switch removes a plate from the active layout
- **THEN** the hole that plate punched is removed in the same change, so nothing below shows
  through where the plate used to be

#### Scenario: Every mutation has an enumerated inverse

- **WHEN** the reconcile seats a plate, punches a hole, sets a fit, or allocates a layer
- **THEN** a corresponding release, un-punch, fit-clear and de-allocation exists and is covered by a
  test, so no half of a pair can ship without the other
