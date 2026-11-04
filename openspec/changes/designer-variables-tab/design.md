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

At rest, long values stay ellipsized so every row remains scannable. Native hover text exposes the
complete Title, binding summary, type and namespace heading. While Title has focus, its cell spans
the adjacent Type / binding column and that read-only cell is hidden; Actions keep their original
column. This gives author-entered text useful editing space without introducing horizontal scrolling
or a persistent resizable-table state.

The direct composition-instance `name` remains the stable data namespace used by payloads. Its
visible `label` is derived from the referenced composition's current name, so a rename updates the
author-facing heading without silently breaking external data keys.

### 4. Bind mode is a distinct targeting tool

Each field row has one fixed binding toggle. When unbound it has the accessible name **Bind from
canvas** and a link glyph; when bound the same control becomes **Unbind** with an unlink glyph.
Unbind clears the field's relationship without moving the operator to a second action in the binding
summary. The toggle's hover and active Bind states use the binding violet, not the ordinary blue
selection/accent colour; the Unbind hover uses danger red so removal is unambiguous. Activating Bind
replaces the normal pointer with the same pointer plus a clear violet chain-link badge across both
canvas and pasteboard. The dark editing surround receives a violet inset frame with a soft shadow for
the entire Bind mode, so the pending action is visible even before the pointer reaches an element
without changing the truthful boundary of the output itself. Pointer movement runs the same
`resolveBinding` compatibility check as the final click; a compatible topmost element receives a
dashed violet frame derived from the same effective transform, animated path bounds and layout
quantisation as the selection gizmo. It has no handles and never reuses the blue selection colour.
Leaving the target clears only the target frame; cancelling with Escape or committing also clears
the editing-surround Bind frame.

A compact status card at the top of the work area says **Select an element** and names the compatible
element families derived from the same field-type matrix as `resolveBinding` (for example, Text,
Live Source and Lottie text for a text field). It is guidance, not a second compatibility rule, and
disappears with Bind mode.

## Risks / Trade-offs

- A narrow pane can make a literal HTML table overflow. The implementation uses a compact CSS grid
  with table semantics/labels and responsive wrapping rather than fixed pixel columns.
- Native hover text is intentionally a lightweight disclosure rather than a second persistent row;
  focused Title expansion supplies the corresponding authoring affordance.
- Compatibility resolution now runs during Bind hover as well as click. It is a local, synchronous
  element/type check; no document mutation or asset conversion occurs during pointer movement.
- Hiding empty namespaces must not hide a non-empty descendant; recursive visibility is tested at
  more than one nesting level.

## Migration Plan

No data migration. The former Inspector section is removed in the same commit that adds the tab.
All saved scenes and bindings remain unchanged.
