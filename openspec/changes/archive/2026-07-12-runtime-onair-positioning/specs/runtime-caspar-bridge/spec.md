# runtime-caspar-bridge (R-011 — operator position overrides)

## ADDED Requirements

### Requirement: Operator position overrides ride the served URL query

The bridge SHALL store at most one operator position override per stack
item (`stack.set-position`), and SHALL append it — as
`?pos=<anchor>&dx=<x>&dy=<y>` — onto the ALREADY-RESOLVED served template
URL when building a `CG ADD`, and nowhere else: never onto a bare (unserved)
template id, never into the data payload (the AMCP escape rule is
untouched), and the template-serve-down loud-failure contract stays exactly
as it is. Both a load's `CG ADD` and a take's re-ADD SHALL carry the stored
override (they share the single ADD-construction path). With no stored
override the URL carries NO position query — the bridge stays opaque about
the manifest default, which the runtime reads from the scene itself.

`stack.set-position` SHALL be REFUSED (`reason: 'on-air'`) while the item
is on air or unsettled (pending, playing, on-air, updating, exiting, or
unconfirmed — the R-010 on-air predicate), and refused
(`reason: 'unknown-item'`) for an item not on the stack. For a
LOADED-not-taken item, accepting a new position SHALL re-ADD the template
(an invisible re-serve with the new query, on a non-intent sequence so the
item's status is not perturbed); for an idle item the override is stored
for the next load. Stored overrides SHALL survive a runtime
reconfiguration (`setConfig`) — an operator's placement is not server
knowledge — and SHALL be dropped when the item is removed.

#### Scenario: No override, no query

- **WHEN** an item with no stored override is loaded **THEN** its `CG ADD`
  references the served URL with NO position query

#### Scenario: A loaded item's new position re-serves with the query

- **WHEN** the operator sets a position on a loaded-not-taken item
  **THEN** the bridge re-ADDs the served URL carrying
  `?pos=<anchor>&dx=<x>&dy=<y>`, the URL still resolves (served, not a
  bare id), and the item's status is unchanged

#### Scenario: The take re-ADD inherits the override

- **WHEN** an item with a stored override is taken after an out (the
  B-039 re-ADD path) **THEN** the fresh `CG ADD` carries the SAME position
  query

#### Scenario: Refused on air; unknown item refused

- **WHEN** `stack.set-position` targets an item that is on air or
  unsettled **THEN** it is refused with `reason: 'on-air'` and nothing is
  sent or stored
- **WHEN** it targets an item not on the stack **THEN** it is refused with
  `reason: 'unknown-item'`

#### Scenario: Overrides survive reconfiguration, die with the item

- **WHEN** `setConfig` rebuilds the connection layer **THEN** stored
  positions persist and the next ADD for the item still carries the query
- **WHEN** the item is removed **THEN** its stored override is dropped
