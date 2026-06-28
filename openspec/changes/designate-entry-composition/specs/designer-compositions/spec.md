# designer-compositions (D-115 delta)

## ADDED Requirements

### Requirement: Designated main / entry composition

The scene SHALL carry an optional, non-breaking `entryCompositionId` (a `compositions[].id`)
designating the MAIN / entry composition — what the editor opens on by default, independent of list
order. The Compositions panel SHALL offer a "Set as main" / "Unset main" action and SHALL mark the
designated composition. On opening a template the editor's active composition SHALL be the designated
main when it is set + still valid, ELSE the first composition (the prior default) — so a scene with
NO designation opens exactly as before (no regression). Deleting the designated composition SHALL
clear the designation (fall back to the default). The designation SHALL round-trip on
save / reload / export (it lives on the scene serialized into the `.vcg` `template.json`).

#### Scenario: Set as main persists and is marked

- **WHEN** the operator sets a composition as main
- **THEN** `entryCompositionId` persists on the scene and the Compositions panel marks that
  composition (and the action toggles to "Unset main")

#### Scenario: Open lands on the designated main

- **WHEN** a template with a designated main composition is opened
- **THEN** the editor's active composition is that designated main, regardless of list order

#### Scenario: No designation is unchanged

- **WHEN** a template has no designated main
- **THEN** the editor opens the first composition (the prior default) — no regression

#### Scenario: Deleting the main clears the designation

- **WHEN** the designated main composition is deleted
- **THEN** the designation is cleared and load falls back to the default

#### Scenario: The designation round-trips

- **WHEN** a scene with a designated main is saved, reloaded, or exported
- **THEN** `entryCompositionId` round-trips and the editor opens on that main on reload
