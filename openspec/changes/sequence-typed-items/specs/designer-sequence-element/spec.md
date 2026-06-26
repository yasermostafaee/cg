# designer-sequence-element — D-083 typed items delta

## MODIFIED Requirements

### Requirement: Sequence element with a decomposed, preset-named transition

The schema SHALL define a `sequence` element: a clipped box that shows ONE
item of an ordered list at a time, styled with the ticker/clock text-styling
subset (`font`, `color`, optional `colorFill`/`textShadow`/`backgroundColor`/
`backgroundFill`/`cornerRadius`/`padding`) plus
`align: 'start' | 'center' | 'end'` (default `'start'`) and an explicit
reading `direction: 'ltr' | 'rtl'`. Each item SHALL be a discriminated union
(`SequenceItemSchema`, keyed by `kind`, stable `id` is the reconcile key): a
TEXT item `{ kind?: 'text', id, text, dwellMs? }` (the bindable kind) OR a
COMPOSITION item `{ kind: 'composition', id, compositionId, dwellMs? }` that
references a scene composition by the SAME `compositionId` the `composition`
element uses. `kind` is OPTIONAL on the text variant so an item authored
before D-083 (`{ id, text, dwellMs? }`, no `kind`) parses UNCHANGED as text —
the non-breaking widening: no schema-version bump, no migration. The move
between items SHALL be a DECOMPOSED transition: an IN edge and an OUT edge
(`'top' | 'bottom' | 'left' | 'right' | 'none'`, defaults `'bottom'`/`'top'`),
a `transitionTiming` (`'simultaneous'` push, both motions together |
`'sequential'` out-then-in; default `'simultaneous'`), each motion lasting
`transitionMs` (default 400), eased with the SHARED `ease-in-out` easing,
transform-only inside the clipped box. An edge of `'none'` is an instant cut
for that side. Named presets are VALUES over those fields — Push ×4
(simultaneous), Slide ×4 (sequential), Hide-show (`none`/`none`) — and the
decomposition is the extensible seam for future styles (new enum members, no
schema break).

#### Scenario: Sequence tool inserts the Persian now/next defaults

- **WHEN** the operator picks the Sequence tool and clicks the canvas
- **THEN** a sequence element is added (3 sample now/next items,
  `advance: 'auto'`, `defaultDwellMs: 5000`,
  `transitionIn: 'bottom'`, `transitionOut: 'top'`,
  `transitionTiming: 'simultaneous'` — the "Push up" preset —
  `transitionMs: 400`, `repeat: 'infinite'`) and the authoring canvas shows
  item 1

#### Scenario: An item is text or a composition reference

- **WHEN** a sequence item is authored
- **THEN** it is either a TEXT item `{ kind?: 'text', id, text, dwellMs? }` or
  a COMPOSITION item `{ kind: 'composition', id, compositionId, dwellMs? }`
  referencing a scene composition; a pre-D-083 item with no `kind` parses
  unchanged as text (no `kind` injected, no schema-version bump)

#### Scenario: A transition runs per the decomposition

- **WHEN** a transition runs
- **THEN** the outgoing item exits through its OUT edge and the incoming
  enters from its IN edge, per the timing — `'simultaneous'` moves both
  together (push), `'sequential'` completes the exit before the entry
  begins — each motion lasting `transitionMs`, clipped to the box; an edge
  of `'none'` makes that side an instant cut (IN `none` + OUT `none` = the
  hide-show hard swap)

#### Scenario: Presets map onto the three fields; anything else is Custom

- **WHEN** the operator picks a transition preset
- **THEN** the three fields are set accordingly (Push ×4 = simultaneous,
  Slide ×4 = sequential, Hide-show = none/none) and editing any field
  afterwards shows **Custom** — every IN × OUT × timing combination is
  authorable

### Requirement: Live items via the list field, reconciled by stable id

A sequence bound to a `list` field SHALL reconcile on `update()` by stable
`id` — the binding target is `sequence-items`, mirroring `ticker-items` as a
structured value that bypasses stringify/transform. The CURRENT item is
never yanked mid-display: a text edit applies in place, a removal takes
effect at the next advance; item order and per-item `dwellMs` come from the
new list value. A sequence element's Data key SHALL seed a
`list` field from the authored items and bind it via `sequence-items` (the
ticker flow). The shared items editor SHALL expose an optional per-item
dwell in sequence contexts (inspector AND preview field form) and keep
preserving unknown item fields. Binding is TEXT-ONLY: a sequence holding ANY
composition item SHALL NOT be data-bindable — the bind-resolver returns no
target and the inspector disables the Data key with a hint, since a bound
`list` value carries only text items.

#### Scenario: Reconcile never yanks the current item

- **WHEN** `update()` delivers a bound `list` value while an item displays
- **THEN** items reconcile by stable id; the CURRENT item is never yanked
  mid-display (a text edit applies in place; a removal takes effect at the
  next advance); per-item `dwellMs` carried in the list value is honored

#### Scenario: The shared items editor gains an optional per-item dwell

- **WHEN** items are edited in the inspector or the preview field form
- **THEN** the shared items editor exposes an optional per-item dwell, and
  unknown item fields are preserved (the existing editor invariant)

#### Scenario: A composition item disables the ITEM-LIST binding only

- **WHEN** a sequence holds at least one composition item
- **THEN** ONLY the item-LIST (rundown) `sequence-items` binding is disabled —
  the sequence's own Data key is disabled with a hint scoped to the item list
  ("the item list can't be data-bound … you can still edit each item's text and
  bind fields inside composition items"), none is created, and a prior text
  binding (with its seeded list field) is DROPPED when a composition item is
  added (the item-list binding is text-only in Phase 1); removing the
  composition items re-enables it. Per-ELEMENT field binding/editing (a text
  element's Data key, "Bind from canvas", and a text item's static text) is
  NEVER blocked by this guard.

## ADDED Requirements

### Requirement: Composition sequence items render their referenced composition with live drivers

A COMPOSITION sequence item SHALL render the referenced composition's HELD
content for the item's dwell, scaled to fill the sequence box, with its LIVE
inner drivers running (a clock ticks — honoring D-084 timezone and D-103
blink via the existing clock engine). The composition's OWN intro/outro
lifecycle SHALL NOT run inside the sequence (held content). The sequence's
`transitionIn`/`transitionOut`, dwell, `advance` (auto|manual), and `next()`
SHALL apply uniformly to text and composition items; `pause()`/`resume()`
SHALL freeze/continue the item's inner drivers in lockstep; advancing away
SHALL tear the composition subtree down. The authoring canvas SHALL show a
composition item-1's held content statically (its clock's initial value).
The inspector SHALL let the operator pick each item's KIND (Text /
Composition) and, for a composition item, choose the referenced composition
from the scene's compositions; add / remove / reorder / per-item dwell still
work. The exporter SHALL package a composition referenced only by a sequence
composition item (its template + assets) and the bundled runtime SHALL render
the item.

#### Scenario: A composition item renders the referenced composition live

- **WHEN** the sequence advances to a composition item
- **THEN** the referenced composition's content renders scaled to the box and
  its live inner drivers run (a clock ticks); the composition's own
  intro/outro does not run inside the sequence

#### Scenario: Transitions, dwell, advance, and teardown apply uniformly

- **WHEN** a composition item enters / dwells / is advanced past (by timer,
  `next()`, or `pause()`/`resume()`)
- **THEN** it uses the sequence's transitions and dwell exactly like a text
  item, its inner drivers freeze/continue with `pause()`/`resume()`, and on
  advance its subtree is torn down

#### Scenario: The inspector picks an item kind and a composition

- **WHEN** the operator edits a sequence item
- **THEN** a KIND picker offers Text or Composition; a Composition item shows
  a composition picker over the scene's compositions; add / remove / reorder
  and the per-item dwell continue to work

#### Scenario: Export packages a sequence-referenced composition

- **WHEN** a scene is exported and a composition is referenced ONLY by a
  sequence composition item
- **THEN** that composition's template and assets are packaged and the
  bundled runtime renders the item (reusing composition asset resolution and
  the clock driver)

### Requirement: Composition sequence items expose their fields to the operator (namespaced per item)

A composition sequence item SHALL contribute its referenced composition's
fields to the operator's data form, NAMESPACED per item, reusing the D-025
instance-namespacing (no new data model). The namespace is DISPLAYED as
`<sequence name>[<index>]` but KEYED by a stable, parent-unique id-based value
(so two same-named sequences never collide and a rename never orphans values),
and the value lives under the item's own scope path (a sequence nested in a
composition instance reads its correctly-scoped sub-object). This is independent
of the item-LIST binding: a text item next to a clock inside a composition item
is editable even though the rundown itself is not data-bindable. Setting such a
field SHALL update that item's content via the existing composition-field
mechanism — applied to the item's content when it renders and re-applied live on
`update()`. A TEXT sequence item contributes NO field namespace (it carries its
own text + the optional item-list binding).

#### Scenario: A composition item's fields appear in the data form, namespaced per item

- **WHEN** a sequence has a composition item whose composition has fields
- **THEN** the operator's field form shows those fields under a per-item
  namespace displayed as `<sequence name>[<index>]` (keyed stably so same-named
  sequences don't collide); a text-only item contributes none

#### Scenario: Setting a composition-item field updates its content

- **WHEN** the operator sets a composition item's field in the data form
- **THEN** that item's content updates accordingly (e.g. the city label next to
  a clock), via the existing composition-field mechanism — at render and live on
  `update()`
