## ADDED Requirements

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
