# designer-playout-lifecycle (D-108 delta)

## ADDED Requirements

### Requirement: The Playout checklist surfaces nested-composition hold-driving content (read-only)

When the hold is content-driven, the inspector's Playout section SHALL ALSO
surface — READ-ONLY — the hold-driving content (ticker / sequence / countdown
clock with `drivesHold !== false`) that lives inside the active composition's
NESTED composition instances, which the content-tree wait (D-104) already lets
drive the parent's hold. For each IMMEDIATE nested composition instance that
(recursively) contains hold-driving content, the section SHALL show one row with
the instance's name and a COUNT of its hold-driving items — recursing the
referenced composition's groups and its own deeper nested instances, cycle-guarded
(a visited set), counting only `ticker` / `sequence` / countdown-`clock` kinds.

These rows SHALL NOT offer a toggle. `drivesHold` is a property of the SHARED
child composition element (a nested instance is a `compositionId` reference, its
layers not copied in), so toggling it from the parent would silently mutate every
other instance of that child; the rows SHALL indicate that the flag is edited in
the child composition's own checklist. Activating a row SHALL switch the active
composition to the referenced composition (via `setActiveComposition`) so its own
checklist (D-107) can edit those flags. When no nested composition instance
contributes hold-driving content, the section SHALL NOT render. Only IMMEDIATE
nested instances are listed; deeper nesting surfaces progressively, one level at a
time, as the operator drills in. This is presentation only — it makes no
`drivesHold` writes and changes no runtime behaviour (no schema change).

#### Scenario: Nested hold-driving content is surfaced read-only with a count

- **WHEN** the active composition nests a composition instance whose content
  (a ticker / sequence / countdown clock with `drivesHold !== false`) drives the
  hold, and the hold source is `content-driven`
- **THEN** the Playout section shows a read-only nested section listing that
  instance by name with a count of its hold-driving items

#### Scenario: Excluded nested content is not counted

- **WHEN** an item inside a nested composition instance is excluded
  (`drivesHold === false`)
- **THEN** it is not included in that instance's count; an instance whose every
  item is excluded contributes a count of zero and is not listed

#### Scenario: No nested hold-driving content hides the section

- **WHEN** no nested composition instance of the active composition contains
  hold-driving content
- **THEN** the read-only nested section is not rendered

#### Scenario: Nested rows are read-only and direct the operator to the child

- **WHEN** the nested section is shown
- **THEN** its rows render without a toggle and indicate the flag is edited in the
  nested composition's own checklist — no `drivesHold` write happens from the
  parent

#### Scenario: Activating a nested row drills into that composition

- **WHEN** the operator activates a listed nested composition row
- **THEN** the editor switches the active composition to that referenced
  composition (`setActiveComposition`), so its own checklist can toggle the flags;
  any content nested one level deeper now surfaces in that composition's Playout
  section
