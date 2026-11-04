# designer-multibox-arrangements Specification

## Purpose

Define the Designer authoring ownership and lifecycle of multi-frame Looks.

## Requirements

### Requirement: Looks SHALL be managed below ordinary compositions

The Compositions panel SHALL be the single lifecycle-management surface for Looks. It SHALL render
ordinary compositions first and registered Look compositions in a distinct lower section, regardless
of their persisted creation order. The Looks header SHALL contain an accessible icon-only
**Add Look** plus action and **Delete multi-frame group**. The
Inspector SHALL keep actionable Live Source diagnostics but SHALL NOT repeat Look create, rename or
delete controls or show permanent empty/help copy.

The Looks heading and names SHALL remain neutral. The dedicated violet Look token SHALL be reserved
for the type icon, slim row accent and Timeline lifespan. The Designer SHALL expose neither a
default badge nor a Set-default action; the operator selects the active Look before Take.

#### Scenario: an ordinary composition is created after Looks

- **GIVEN** one or more registered Looks exist
- **WHEN** the author creates an ordinary composition
- **THEN** it is appended to the upper Composition list
- **AND** the Looks section remains below every ordinary composition

#### Scenario: an ordinary full-frame composition is promoted

- **WHEN** the author chooses **Make a Look** for an eligible composition
- **THEN** it is instanced full-frame in the group home and registered as a Look
- **AND** no duplicate composition is created

#### Scenario: Show Look navigates to the group home

- **WHEN** a Look composition or unrelated composition is open
- **AND WHEN** the author chooses **Show Look on composition**
- **THEN** the group home composition opens and that Look becomes active on its canvas
- **AND WHEN** the group home is already open
- **THEN** the action only activates the requested Look

### Requirement: Preview SHALL support session-only Preset switching

Preview SHALL expose a wrapping Preset button group below its fixed transport controls when the
previewed composition has one or more registered Presets (stored by the legacy Look schema), with a
separate heading above the choices. Buttons SHALL share a base width and only a longer label may grow
its button to a bounded maximum. The active Preset SHALL have a distinct fill and inset frame in
addition to its pressed semantics. A single Preset SHALL remain visible and selected. Changing the
Preset SHALL cut the dedicated Preview runtime to the corresponding Look without changing stored
project data or the authoring Canvas selection. The selection SHALL survive normal Preview commands
and timing-runtime rebuilds for the life of the modal. Preview Variables SHALL NOT render a composition
or Preset namespace whose entire descendant aggregate contains no editable field.

#### Scenario: two Presets are rehearsed in one Preview session

- **GIVEN** a composition contains two registered Presets
- **WHEN** Preview is playing and the author selects the other Preset
- **THEN** only the selected Preset is visible immediately
- **AND** the author can continue Play, Pause, Stop and field updates without reopening Preview

#### Scenario: one Preset still states the active choice

- **GIVEN** a composition contains one registered Preset
- **WHEN** Preview opens
- **THEN** the Preset group is visible with that button selected

#### Scenario: a Preset has no variables

- **WHEN** Preview Variables renders an otherwise empty Preset namespace
- **THEN** no blank Preset heading or group is shown

### Requirement: A registered Look SHALL have one synchronized lifecycle

A registered Look's registry entry, home-document instance and backing composition SHALL be treated
as one undoable authored object. Deleting either the Look or its backing composition SHALL delete all
three. Any schema-level fallback pointer is internal and SHALL move to a survivor when needed.

#### Scenario: a Look is deleted

- **WHEN** the author deletes a registered Look from the Compositions panel
- **THEN** its registry entry, home instance and backing composition are removed
- **AND** Undo restores all three

#### Scenario: the backing composition is deleted

- **WHEN** deletion starts from a composition registered as a Look
- **THEN** the corresponding Look registration and home instance are removed in the same operation

### Requirement: Removing a non-empty multi-frame group SHALL require confirmation

An empty multi-frame group MAY be removed directly. A group containing Looks SHALL open a
destructive confirmation that states the Look count and that their compositions will be deleted.
Confirming SHALL remove the group and every owned Look as one undoable operation.

#### Scenario: the author removes a group with two Looks

- **WHEN** **Delete multi-frame group** is pressed
- **THEN** the dialog states that two Looks, their instances and compositions will be deleted
- **AND WHEN** the author confirms
- **THEN** the group and both Looks disappear while unrelated compositions remain
