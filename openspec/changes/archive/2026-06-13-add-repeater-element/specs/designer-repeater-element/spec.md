# designer-repeater-element

## ADDED Requirements

### Requirement: Repeater element with guard-gated insertion

The schema SHALL define a `repeater` element: a clipped box that renders one
instance of a referenced child composition (`compositionId`, required) per
row of a data list, configured by `direction: 'column' | 'row'` (default
`'column'`), `flow: 'rtl' | 'ltr'` (default `'rtl'`; row-axis order,
ignored for column), `gap` (default 8), optional `maxItems`, and authored
`items` reusing the open D-028 list-item shape — row keys are the child
composition's field ids. The Designer SHALL provide a Repeater tool that
inserts ONLY when at least one valid (non-cyclic, not the active
composition) child exists, preselecting the first valid; with no valid
composition the tool SHALL not insert and a hint SHALL explain why.

#### Scenario: Repeater tool inserts with the first valid composition

- **WHEN** the operator picks the Repeater tool and clicks the canvas with
  at least one valid (non-cyclic) other composition in the scene
- **THEN** a repeater is added referencing the first valid composition
  (changeable in the inspector) with 3 seeded rows (item keys = the child's
  field ids, default values) and the authoring canvas shows the 3 rows;
  with NO valid composition the tool does not insert and a hint explains
  why

### Requirement: Flow layout with cross-axis cell fit

Cells SHALL lay out along the `direction` axis spaced by `gap`, each scaled
to fit the box's CROSS axis with the child's aspect preserved (`'column'` ⇒
cells fill the box width and stack top-to-bottom; `'row'` ⇒ cells fill the
box height and lay along the row axis ordered by `flow`); overflow is
clipped; a zero-resolution child renders an empty cell (the
`buildComposition` guard).

#### Scenario: Column fills width; row fills height ordered by flow

- **WHEN** `direction` is `'column'`
- **THEN** cells fill the box width (child aspect preserved) and stack
  top-to-bottom with `gap`; WHEN `'row'` THEN cells fill the box height and
  lay along the row axis ordered by `flow` (`'rtl'` default); overflow is
  clipped

### Requirement: Columned items editing

The shared items editor SHALL render one column per child field
(`columns: {key, label}[]` derived from the child composition's fields) in
BOTH the inspector and the preview field form; editing a cell updates that
row's rendered values, and unknown item fields are preserved (the existing
editor invariant).

#### Scenario: A cell edit updates the row

- **WHEN** a row cell is edited in the items editor (inspector or preview
  field form — columns derived from the child's fields)
- **THEN** that row's rendered values update; unknown item fields are
  preserved (existing editor invariant)

### Requirement: Data key with a child-derived GDD item schema

A repeater element's Data key SHALL seed a `list` field from the authored
items and bind it via `repeater-items` (a structured value bypassing
stringify/transform, routed to the driver — the ticker/sequence pattern).
The GDD SHALL represent that field with an ITEM SCHEMA derived from the
child composition's fields (types, constraints, required) per the modified
GDD list-representation requirement.

#### Scenario: Data key seeds the list and the GDD derives the item schema

- **WHEN** the operator sets a Data key
- **THEN** a `list` field is seeded from the authored items and bound
  `repeater-items`, and the GDD represents that field with an ITEM SCHEMA
  derived from the child composition's fields (types, constraints,
  required)

### Requirement: Row COUNT is stamped at each fresh play

At each fresh `play()` the runtime SHALL tear down the previous rows and
stamp from the CURRENT effective items — the bound list field's effective
value when bound (a retained `update()` delivered before play included) else
the authored items — clamped by `maxItems` when set. Each stamped row is
wired through the same subtree factory the static tree uses and attached to
the hosting scope's cascade, so rows enter the run like authored children.

#### Scenario: Pre-play update() count is honored

- **WHEN** `play()` runs
- **THEN** rows are stamped from the CURRENT effective items (a retained
  `update()` delivered before play is honored — 8 items ⇒ 8 rows), clamped
  by `maxItems` when set

### Requirement: Row VALUES update live mid-hold

A mid-hold `update()` of the bound list SHALL apply VALUES positionally
into the stamped rows (row i ← item i; reordering values is live by
construction). A SHORTER list SHALL hide the surplus row cells (display
only — their scopes persist), and a later regrowth within the stamped count
SHALL re-show them; a LONGER list SHALL take effect at the next fresh
play/cycle.

#### Scenario: Live values, shrink-hides, grow-defers

- **WHEN** `update()` delivers a list mid-hold
- **THEN** existing rows' values update live in place (positional —
  reordering values is live); a SHORTER list hides the surplus rows
  (re-shown if a later update regrows within the stamped count); a LONGER
  list takes effect at the next fresh play / cycle

### Requirement: Rows are real nested scopes — lifecycle by reuse

Every stamped row SHALL be a real nested scope running the child's own
lifecycle in lockstep (offset 0) under the hosting cascade — its own
out-point hold, its own outro on `stop()`, `pause()`/`resume()` cascading
in — and a row's content sources SHALL join that ROW scope's
content-driven hold, all per the EXISTING `designer-playout-lifecycle`
per-scope requirements (which this change does not modify). Teardown is
symmetric: destroying a row unwires its drivers and controllers with no
orphan timers/rAF.

#### Scenario: Rows hold at the child's out-point and exit on stop

- **WHEN** the child composition has its own out-point
- **THEN** every row holds at it and plays its own outro on `stop()` —
  lockstep (offset 0), exactly the D-026 nested semantics;
  `pause()`/`resume()` cascade into rows

#### Scenario: A row's content source drives that row's hold

- **WHEN** a row's child contains a content source (e.g. a countdown)
- **THEN** it participates in that ROW scope's content-driven hold —
  unchanged per-scope semantics; the lifecycle living spec is NOT modified
  by this item

### Requirement: Cycle guarding

The inspector SHALL block selecting a composition that would create a cycle
(self/ancestor — the existing author-time guard), and the runtime's
depth/visited guard SHALL render an empty box if a cyclic reference is
forced.

#### Scenario: A cyclic choice is blocked; a forced cycle renders empty

- **WHEN** the chosen composition would create a cycle (self/ancestor)
- **THEN** the inspector blocks the selection, and the runtime's
  depth/visited guard renders an empty box if forced

### Requirement: Scrub parity with authored instances

Timeline scrubbing SHALL affect stamped rows exactly as it affects authored
nested instances — no new scrub rule.

#### Scenario: Scrubbing rows behaves like authored instances

- **WHEN** the operator scrubs the timeline
- **THEN** rows behave exactly as authored nested instances do (no new
  scrub rule)

### Requirement: Export parity

The single-file export SHALL behave identically to the preview: it boots
clean, and an `update()` with a different row count followed by re-play
stamps the new count.

#### Scenario: The exported file re-stamps on re-play

- **WHEN** the composition is previewed and exported
- **THEN** behavior is identical; the exported file boots clean and
  `update()` with a different row count followed by re-play stamps the new
  count

### Requirement: The wiring refactor is behavior-preserving

Extracting the per-scope wiring into the reusable subtree factory SHALL be
behavior-preserving for static scope trees: the pre-existing runtime test
suite passes unmodified.

#### Scenario: The existing suite stays green

- **WHEN** the existing test suite runs after the wiring refactor
- **THEN** it stays green — extracting the per-scope wiring into a reusable
  subtree factory is behavior-preserving for static trees
