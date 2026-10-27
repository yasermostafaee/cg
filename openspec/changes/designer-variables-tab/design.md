## Context

`InspectorPanel` currently appends `FieldsPanel` only in its scene-inspector branch. That makes a
composition-owned model look selection-owned and forces authors to scroll past unrelated visual
properties. `FieldsPanel` already owns all field/binding mutations, so the change can move the
surface without introducing another state model.

## Goals / Non-Goals

**Goals:** a persistent composition-level Variables tab; a compact, readable field table; recursive
namespaces only when they contain a field; unchanged field and binding mutations.

**Non-goals:** changing field schema, binding cardinality, runtime data entry, field ordering, or
inventing variables for static Sequence items.

## Decisions

### 1. The right pane owns the tab state

A small `DesignerRightPanel` composes two tabs: **Inspector** renders the existing
`InspectorPanel`, and **Variables** renders `FieldsPanel` for the open composition. Tab state is
local UI state and is not stored in the project. Selection changes do not change it; switching
compositions keeps the selected surface and feeds it the newly open composition.

The tab buttons use the shared button/control primitives and accessible `tablist` / `tab` /
`tabpanel` roles so keyboard focus and tests observe the same states as sighted users.

### 2. One recursive visibility rule owns namespace omission

A namespace is visible if its own field list is non-empty OR any descendant namespace is visible.
The same predicate filters the rendered tree and decides the whole-panel empty state. No nested
component prints a local “no fields” message, preventing empty Sequence items from creating noise.

### 3. Compact rows retain the existing commands

Each row shows key, editable title, type/binding and actions in four stable columns. Rows share one
bordered table surface with separators instead of looking like unrelated cards; compact icon actions
stay in the row rather than dropping onto a second line. Existing store commands remain the only
mutation path; moving the controls does not copy field state or add a second model. Root fields and
nested fields share the same column contract, with namespace headings supplying the path. The active
Variables tab already names the surface, so the panel does not repeat a second VARIABLES heading.

## Risks / Trade-offs

- A narrow pane can make a literal HTML table overflow. The implementation uses a compact CSS grid
  with table semantics/labels and responsive wrapping rather than fixed pixel columns.
- Hiding empty namespaces must not hide a non-empty descendant; recursive visibility is tested at
  more than one nesting level.

## Migration Plan

No data migration. The former Inspector section is removed in the same commit that adds the tab.
All saved scenes and bindings remain unchanged.
