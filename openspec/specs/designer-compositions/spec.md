# designer-compositions Specification

## Purpose

TBD - created by archiving change add-drill-into-composition. Update Purpose after archive.

## Requirements

### Requirement: Double-click drills into a nested composition and selects the shape

Double-clicking a shape visually inside a nested composition instance SHALL switch the editing context to that child composition and select the double-clicked shape, hit-testing through the child's rendered contents (mapping the cursor from the parent's scene space into the child's own coordinate space) to find the shape under the cursor.

This SHALL work at arbitrary nesting depth — each double-click drills exactly **one**
level; if the shape under the cursor is itself a nested composition instance it is
selected as a unit and the next double-click drills into it. Drilling SHALL be
exactly equivalent to opening that child from the compositions list **plus**
selecting the shape: it adds no new edit semantics and no per-instance overrides,
and editing the drilled-into shape edits the shared child definition.

#### Scenario: Double-click enters the child and selects the shape

- **WHEN** the operator double-clicks a shape visually inside a nested composition
  instance
- **THEN** the editing context switches to that child composition and the
  double-clicked shape is selected

#### Scenario: Double-click on empty child space enters the child with no shape selected

- **WHEN** the operator double-clicks a nested composition instance over an area
  with no child shape under the cursor
- **THEN** the editing context switches to the child composition and nothing is
  selected

### Requirement: Single-click selects the whole composition instance

A single click on a nested composition instance SHALL select the **whole instance
as a unit** (unchanged behavior), not its insides. Drilling into the child requires
a double-click.

#### Scenario: Single-click selects the instance as a unit

- **WHEN** the operator single-clicks a nested composition instance
- **THEN** the instance is selected as a single unit and the editing context does
  not change

### Requirement: No parent breadcrumb (compositions are shared definitions)

The editor SHALL NOT show a breadcrumb or a "back to parent" affordance after drilling in, because a composition is a shared, reusable definition with no single canonical parent; navigation between compositions SHALL remain via the existing compositions list.

#### Scenario: No breadcrumb after drilling in

- **WHEN** the operator has drilled into a child composition by double-clicking
- **THEN** no breadcrumb or "back to parent" control is shown; the operator
  navigates compositions via the compositions list

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
