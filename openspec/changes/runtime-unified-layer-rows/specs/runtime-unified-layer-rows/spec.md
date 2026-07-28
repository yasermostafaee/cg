# runtime-unified-layer-rows — delta (R-028 design phase)

Encodes what is settled by the owner's decisions and by the verification recorded in this
change's `design.md`. Two calls remain OPEN there (o1 template file location, o2 the `CG NEXT`
wire gap) and are not encoded as requirements.

## ADDED Requirements

### Requirement: Every on-air item sits on a declared row; automatic allocation is not the operator path

The Runtime SHALL present ONE list of layer rows as the operator's surface. Every item the
operator puts on air SHALL be bound to a DECLARED row via the exact-slot path, never by automatic
layer allocation. The separate dynamic stack and the separate template library panel cease to be
the operator's primary surfaces. Rows SHALL be ordered DESCENDING by layer number so the list
mirrors on-air z-order, and each row SHALL show its alias, the REAL CasparCG layer number, the
template name, a description line, and a state indicator (playing / stopped / empty). A display
index MAY appear beside the real layer number but SHALL NEVER replace it — an operator may need
the real number to clear that layer by hand over AMCP.

#### Scenario: Loading from a row binds that row's own layer

- **WHEN** the operator uses a row's Load affordance with a valid `.vcg` **THEN** the template is
  registered and the created item loads onto exactly that row's layer, via the exact-slot binding
  path and never via automatic allocation

#### Scenario: The real layer number is always readable

- **WHEN** any row is displayed **THEN** its real CasparCG layer number is visible on the row,
  whether or not a display index is also shown

#### Scenario: Rows mirror on-air z-order

- **WHEN** the row list is rendered **THEN** rows appear in DESCENDING layer order

### Requirement: A fixed ceiling of candidate layers, with visibility separate from fencing

Install config SHALL declare a FIXED ceiling of candidate layers that never grows or shrinks at
runtime. Each candidate layer SHALL carry a per-layer visibility tick that controls ONLY whether
its row is displayed. **Every candidate layer SHALL be fenced from automatic allocation regardless
of its tick** — unticking SHALL NEVER return a layer to an allocatable pool. A ticked row that is
OCCUPIED SHALL NOT be untickable: config must show it is not empty, and the operator must remove
its template first.

#### Scenario: Unticking never frees a layer for allocation

- **WHEN** a candidate layer is unticked **THEN** its row is hidden AND the layer remains fenced —
  no automatic allocation can ever return a graphic to it

#### Scenario: An occupied row cannot be unticked

- **WHEN** the operator attempts to untick a row whose layer is occupied **THEN** the attempt is
  refused and the config surface states that the row is not empty
- **WHEN** the layer's occupancy is UNKNOWN **THEN** the untick is refused as well — unknown is
  never treated as empty (fail closed)

#### Scenario: Removing a template from config is gated like an on-air action

- **WHEN** the operator removes a row's template from inside the config surface **THEN** the same
  confirmation gate the row itself applies is shown, and when the item is ON AIR the dialog says
  so explicitly — removal implies clear

### Requirement: The bridge is the source of truth for what is on a row, across every browser

While the bridge is running, the BRIDGE SHALL know which template is on each row and SHALL report
the same thing to every connected browser. An item loaded by one browser SHALL NOT be presented as
foreign to another browser on the same bridge. "The template is not remembered" SHALL apply only
across a BRIDGE restart, never across a browser reload or between concurrent browsers.

#### Scenario: A second browser sees the first browser's row identically

- **WHEN** a second browser connects to the same bridge **THEN** it shows the same rows with the
  same template identity and the same state as the first — and offers the same verbs, because the
  item is the bridge's, not that browser's

#### Scenario: A bridge restart is the only thing that forgets

- **WHEN** the bridge process restarts **THEN** template identity for a row may be unknown until
  reloaded, and the row states that honestly rather than guessing

### Requirement: Playout-owned rows are declared, visible and read-only

Layers owned by the PLAYOUT system SHALL be declared in config through the existing
`reservedLayers` seam. Their rows SHALL be VISIBLE with honest occupancy, labelled as
playout-owned, and SHALL offer NO operator verbs. Ownership SHALL NEVER be inferred from the wire:
OSC reports producer KIND, not identity, so a playout graphic and one of ours are indistinguishable
there.

#### Scenario: A playout row offers nothing to the operator

- **WHEN** a row is in the declared playout range **THEN** it shows occupancy honestly, is labelled
  playout-owned, and exposes no verb that could take it off air

#### Scenario: Declared playout layers never surface as orphans

- **WHEN** the playout system has a healthy graphic on a declared playout layer **THEN** the R-009
  orphan sweep does NOT surface it as a reclaimable orphan

#### Scenario: Overlap between row and playout ranges is refused at config time

- **WHEN** config declares a candidate-layer ceiling that intersects the reserved playout range
  **THEN** it is refused with an error naming both ranges, at load and at any change

### Requirement: Verbs keep this project's names and derive from one declaration point

The row verb set SHALL be LOAD · PLAY · NEXT · UPDATE · STOP · CLEAR · REMOVE, with this project's
existing C-012 semantics: **STOP** is the graceful exit (outro runs, producer stays resident) and
**CLEAR** destroys the producer. The reference product's inverted vocabulary SHALL NOT be adopted.
Buttons and the context menu SHALL both derive from ONE `RowAction` list; where a verb appears only
in the menu, that placement SHALL be expressed on the single declaration, never as a second list.

#### Scenario: STOP keeps its meaning

- **WHEN** the operator invokes STOP on a playing row **THEN** the template's outro runs and the
  producer stays resident — STOP never hard-cuts

#### Scenario: Menu and buttons cannot diverge

- **WHEN** a verb is offered in the context menu **THEN** it carries the same gate, handler and
  wording as its button, because both are projected from the same declaration — and a verb placed
  in the menu only is still declared exactly once

#### Scenario: NEXT is offered only when the template has one

- **WHEN** the loaded template has no next step **THEN** NEXT is not offered as an enabled control
- **WHEN** the loaded template does have a next step **THEN** NEXT is offered, and invoking it
  advances the template

### Requirement: Restore places a declared row's item back on its own layer

A retained item bound to a declared row SHALL restore ON THAT ROW'S LAYER. The allocate-elsewhere
fall-through SHALL NOT apply to declared rows. Because every on-air item now lives on a declared
row, this SHALL be the restore path's main rule rather than a corner case.

#### Scenario: A bridge restart keeps every item on its own row

- **WHEN** the bridge restarts while items are on declared rows **THEN** each item returns to its
  own row's layer, and none is placed on a different layer

#### Scenario: A row whose layer is taken does not silently move

- **WHEN** a declared row's layer cannot be reclaimed at restore **THEN** the item is NOT loaded
  elsewhere; the row reports the blocked state and nothing is sent to the wire

### Requirement: Existing dynamic-layer items are not moved at upgrade

Upgrading to the row model SHALL NOT automatically relocate items that are already on dynamic
layers. Automatic relocation of a live graphic is an unattended on-air action and is forbidden.

#### Scenario: An upgrade touches nothing on air

- **WHEN** an install with items on dynamic layers is upgraded **THEN** those graphics keep
  running untouched, and the operator is told to clear and reload onto rows at a safe moment
