# designer-live-source

## ADDED Requirements

### Requirement: A multi-frame group's source list is DERIVED from its plates

A multi-frame group SHALL NOT store a list of sources. The group's source list SHALL be derived from
the distinct `routeKey`s its template's Live Source plates carry, and a source SHALL come into
existence by a plate being pointed at a key.

The derived list SHALL have a defined order: **document order of first use** — the scene's own
layers, then each composition in order, each walked in authored sibling order. The order SHALL be
stable under APPEND: a new plate, a new look or a new key SHALL be appended after every key that
already exists. It SHALL NOT be stable under deletion — removing the plate that first used a key
moves that key to wherever it is next used — and no operator assignment SHALL depend on position,
because assignments are keyed on the source id.

An UNASSIGNED plate SHALL contribute nothing to the list.

There SHALL be exactly ONE definition of this derivation, shared by the exported carrier and by
every Designer surface that shows the list, so the author's list and the operator's list cannot
disagree about either membership or order.

A stored scene or exported package written while the group still declared its sources SHALL keep
loading, and the stored list SHALL be ignored rather than merged, migrated or preferred.

#### Scenario: The list is what the plates say

- **GIVEN** a template whose plates carry `l1`, `l2` and `l1` again
- **WHEN** the group's source list is derived
- **THEN** it is `l1`, `l2` — deduped, in document order of first use
- **AND** an unassigned plate contributes nothing to it

#### Scenario: A stored declaration is ignored

- **GIVEN** a scene that still carries a group's stored `sources` array
- **AND** a plate whose `routeKey` that array does not contain
- **WHEN** the scene is loaded and exported
- **THEN** the scene parses and the stored array is dropped
- **AND** that plate's key is an ordinary source: it appears in the derived list and in the exported
  carrier
- **AND** the exported order follows the plates, not the stored array

#### Scenario: Growth does not reorder the operator's list

- **GIVEN** a derived list of `l1`, `l2`
- **WHEN** a plate carrying a new key is added
- **THEN** the new key is appended and the existing keys keep their order

### Requirement: A plate is never refused for using a source the group does not declare

The export preflight SHALL NOT refuse a Live Source plate on the ground that its `routeKey` is not
declared by the multi-frame group. There is no declaration for it to contradict.

Two neighbouring refusals SHALL survive unchanged, because neither is about a list: a plate pointed
at NOTHING SHALL keep blocking the export in DOCUMENT scope, whether or not the template has a
group; and two PLATES carrying the same key in one look SHALL keep being refused, because one source
is one seat.

Two plates pointed at nothing SHALL NOT be reported as two plates sharing one source.

#### Scenario: An undeclared key raises nothing

- **GIVEN** a template with a multi-frame group
- **AND** a plate whose `routeKey` no other plate uses
- **WHEN** the preflight runs
- **THEN** no issue is raised for that plate

#### Scenario: The unset refusal survives

- **GIVEN** a plate with no source, in a template with a multi-frame group
- **WHEN** the preflight runs
- **THEN** the export is blocked with an `error` naming that plate
- **AND** two such plates in one look are reported as two unset plates, not as a duplicated source

### Requirement: The Inspector's source control accepts a new key typed freely

The Inspector SHALL offer ONE source control for a Live Source plate, whether or not the template
has a multi-frame group, and that control SHALL accept a freely typed key — because typing a new key
is how a source comes into existence.

The keys the template already uses SHALL be OFFERED by that control as suggestions, never as a
constraint, and the plate's own key SHALL NOT be offered to itself. The control SHALL NOT mark any
key as undeclared.

The control SHALL keep showing what the element holds and SHALL NEVER substitute a different value.
Clearing it SHALL store an absent `routeKey` rather than an empty string. Rendering it SHALL NOT
modify the scene.

#### Scenario: A new key is created by typing it

- **GIVEN** a template with a multi-frame group and an unassigned plate
- **WHEN** the author types a key no other plate uses and commits it
- **THEN** the key is stored on the element, the refusal clears, and the key joins the derived list
- **AND** it is offered as a suggestion to the next plate

#### Scenario: The control offers without constraining

- **GIVEN** a plate on a template whose other plates use `l1` and `l2`
- **WHEN** the Inspector renders it
- **THEN** `l1` and `l2` are offered, the plate's own key is not offered to itself, and no key is
  marked undeclared
- **WHEN** the author clears the control **THEN** `routeKey` is absent once more, not an empty string

### Requirement: The Looks panel MIRRORS the derived source list

The Looks panel SHALL show the group's derived source list read-only, in its derived order. It SHALL
offer no control to add, rename or remove a source, because none of those is an act on the panel any
more.

Where the panel summarises preflight issues, refusals and non-blocking warnings SHALL be counted and
headed separately, so a warning is never presented under a heading that claims the export will
refuse.

#### Scenario: The panel has no source editor

- **WHEN** the Looks panel renders a multi-frame group
- **THEN** the sources it lists are those the plates use, in derived order
- **AND** there is no control to add or remove one

### Requirement: A near-miss source id is a non-blocking nudge

The preflight SHALL raise a WARNING naming both ids where a template uses two source ids that
differ only by a separator, by case, or by a single character.

The warning SHALL NEVER be an error, SHALL NEVER block the export, and SHALL NOT be promoted to one:
the check is a heuristic over what the plates say, not a second copy of the truth to check against,
and a heuristic that blocks is worse than none.

It SHALL NOT fire on ids that differ only in a NUMBER within the same family, because numbering is
how templates name their inputs and a warning that shouts at correct work is one authors learn to
ignore.

#### Scenario: A separator slip is nudged, not refused

- **GIVEN** a template using `l1` on one plate and `l-1` on another
- **WHEN** the preflight runs
- **THEN** a `warning` is raised naming both ids
- **AND** the export is not blocked by it

#### Scenario: A numbered family is silent

- **GIVEN** a template using `l1`, `l2` and `l3`
- **WHEN** the preflight runs
- **THEN** no near-miss warning is raised

### Requirement: A look-group template carries the author's aspect and its FILL flag from the plate

For a template with a multi-frame group, the exported carrier's `expectedAspect` and `dynamic` SHALL
be taken from the plate ELEMENT that first serves each source in document order — the same element
the carrier's `elementId` names — and not from any per-source declaration.

Both fields were previously read off a declaration nothing ever wrote, so a look-group template
exported no aspect at all and the take's aspect-mismatch refusal, which needs both the source's
aspect and the author's, could not fire (`B-179`).

Where two plates serving one key assert DIFFERENT aspects, the first in document order SHALL win and
this SHALL NOT be refused: an aspect is the author's intention for a BOX, and the real feed's format
still outranks it when known.

#### Scenario: The author's aspect reaches the bridge

- **GIVEN** a look-group template whose plate asserts an expected aspect
- **WHEN** the scene is exported
- **THEN** that aspect rides the carrier for that source
- **AND** a plate asserting nothing carries no aspect, which stays distinguishable from asserting a
  default

#### Scenario: The FILL flag is computed the same way for both paths

- **GIVEN** a plate retargeted by a `live-source-id` field binding with the `fill` role
- **WHEN** the scene is exported, with or without a multi-frame group
- **THEN** its carrier entry is marked dynamic by the same rule in both cases
