# designer-sequence-element Specification

## Purpose

TBD - created by archiving change add-sequence-element. Update Purpose after archive.

## Requirements

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

### Requirement: One item at a time — dwell, advance, passes

The runtime SHALL drive the sequence with a per-element driver on the
established self-wire surface (`start`/`pause`/`resume`/`stop`/`reset`/
`destroy`/`whenComplete` + `next()`/`setItems()`, injectable
`RuntimeClock`). A run starts at item 1. In `advance: 'auto'` each item
SHALL hold for its own `dwellMs` (falling back to the element's
`defaultDwellMs`) measured in accumulated ACTIVE time, then transition to
the next item; `next()` ALSO advances and restarts the new item's dwell. In
`advance: 'manual'` no dwell timers run and only `next()` advances.
`repeat: N` counts full passes: advancing past the last item of pass N — by
timer OR by `next()` — SHALL complete the run exactly once, with the LAST
item staying on screen; `reset()` mints a fresh completion per run;
`'infinite'` cycles until `stop()`. `pause()` SHALL freeze the dwell timer
AND any in-flight transition; `resume()` continues both with no jump. A
`next()` before the run has started SHALL be ignored. Playback timeline:
item 1 displays statically through the intro and advancing begins at hold
entry; each hold entry (every `loop-cycle` cycle) starts a fresh run from
item 1.

#### Scenario: Auto advance honors per-item dwell with the element fallback

- **WHEN** `advance` is `'auto'`
- **THEN** each item holds for its own `dwellMs` (falling back to
  `defaultDwellMs`) and then transitions to the next item

#### Scenario: Item 1 holds through the intro; each hold entry starts fresh

- **WHEN** playback runs
- **THEN** item 1 displays statically through the intro and advancing
  begins at hold entry; each hold entry (every `loop-cycle` cycle) starts a
  fresh run from item 1

#### Scenario: Manual advance runs no timers

- **WHEN** `advance` is `'manual'`
- **THEN** no dwell timers run and only `next()` advances

#### Scenario: next() advances with the transition and restarts the dwell

- **WHEN** `next()` / `CG NEXT` arrives during a run
- **THEN** the sequence advances one item with its transition; in `'auto'`
  the new item's dwell restarts; a `next()` before the run has started
  (during the intro) is ignored

#### Scenario: A finite repeat completes past the last item — timer or next()

- **WHEN** `repeat` is N and the sequence advances past the last item of
  pass N — by timer OR by `next()`
- **THEN** the run completes exactly once: the last item stays on screen and
  completion is signalled; `'infinite'` cycles until `stop()`

#### Scenario: Pause freezes the dwell and an in-flight transition

- **WHEN** `pause()` is called mid-dwell or mid-transition and `resume()`
  follows
- **THEN** the dwell timer AND any in-flight transition freeze, and both
  continue with no jump

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

### Requirement: RTL items, physical transition edges

`direction` SHALL drive per-item bidi isolation (each item node gets the
element's direction + `unicode-bidi: isolate`, so mixed Persian/Latin item
text shapes correctly). Transition edges SHALL stay PHYSICAL and explicit —
no hidden mirroring under RTL; the Persian-natural horizontal motion is the
Push/Slide **right** presets, matching the crawl direction convention.

#### Scenario: Persian items render isolated; edges stay physical

- **WHEN** `direction` is `'rtl'` and a horizontal transition runs
- **THEN** items render with per-item bidi isolation, and the motion follows
  the authored physical edges exactly (no RTL mirroring)

### Requirement: Designer authoring — time-driven, not scrubbed

The Designer SHALL provide a Sequence tool and an inspector section editing the transition preset (Push up/down/left/right, Slide up/down/left/right, Hide-show; a field combination matching no preset displays Custom), the decomposed In/Out/Timing fields, `transitionMs`, `advance`, the default dwell (edited in seconds), `repeat` (infinite | N passes), `direction`, and the items (via the shared editor with the dwell column), alongside text styling (font, colour incl. gradient `colorFill`, and a **Text Shadow** section with offset X/Y on one line) — and NO background, box padding, border-radius, or stroke/path-style controls (D-056 — the sequence carries only its text; box styling belongs on a separate shape layer). The inspector SHALL state the sequence is time-driven: timeline scrubbing does not move it (same affordance as ticker/clock). The playout inspector SHALL offer the content-driven hold source when the composition contains a sequence, with copy naming all three content kinds.

#### Scenario: Scrubbing does not move the sequence

- **WHEN** the operator scrubs the timeline over a composition containing a sequence
- **THEN** the displayed item does not change, and the inspector states the sequence is time-driven

#### Scenario: A sequence enables the content-driven hold source

- **WHEN** a composition contains a sequence
- **THEN** the playout inspector offers the content-driven hold source (copy generalized: ticker passes / countdown / sequence passes)

#### Scenario: The sequence inspector exposes no box styling

- **WHEN** a sequence is inspected
- **THEN** it shows text controls (font, colour incl. gradient, Text Shadow) but NO background, box padding, border-radius, or stroke/path-style controls (D-056)

### Requirement: next() dispatch, export parity and GDD

`runtime.next()` SHALL be implemented for real: it cascades scopes
parent-first to their sequence drivers' `next()`, resolves immediately, and
is a safe no-op for a template with no sequences (the optional
`TemplateRuntime.next?` contract and the already-wired CasparCG `CG NEXT`
global are unchanged). This per-scope dispatch is the seam the D-031 steps
model will join. The preview modal transport's **Next** control SHALL be
enabled for scenes containing a sequence and invoke the preview runtime's
`next()` on the same path as play/stop/pause. The single-file export SHALL
behave identically to the preview, `next()` paging it; the GDD SHALL
represent the bound list field exactly as D-028 (lists remain JSON-only —
the existing preflight warning covers it).

#### Scenario: next() routes to the scope's sequences; no-op without any

- **WHEN** `runtime.next()` / `CG NEXT` arrives
- **THEN** every scope's sequence drivers advance one item; a template with
  no sequences treats it as a safe no-op

#### Scenario: Preview equals export; the transport gains Next; GDD as D-028

- **WHEN** the same scene is previewed and exported as single-file HTML
- **THEN** behavior is identical and `next()` pages the export too; the
  preview modal transport's Next control is enabled and advances the
  sequence; the GDD represents the bound list field exactly as D-028

### Requirement: Vertical alignment of the items

The sequence SHALL expose a `verticalAlign` (top / middle / bottom) that positions the item text vertically within the single grid cell via grid `align-items` (top → `start`, middle → `center`, bottom → `end` — the grid keywords, NOT the flex `flex-start`/`flex-end` forms), independently of its existing horizontal `align` (which stays on `justify-items`). It SHALL default to `'middle'` so a sequence authored before this change renders vertically centred exactly as today (non-breaking, no migration). `verticalAlign` SHALL NOT be keyframe-able.

#### Scenario: Vertical align positions the items via grid

- **WHEN** a sequence's `verticalAlign` is set to top or bottom
- **THEN** the item text is placed at that vertical edge of the cell using the grid keywords (`align-items` `start` / `end`) while its horizontal `align` (`justify-items`) is unaffected

#### Scenario: A pre-D-045 sequence stays vertically centred

- **WHEN** a sequence authored before this change (no `verticalAlign`) is loaded or rendered
- **THEN** `verticalAlign` defaults to `'middle'` and the items render vertically centred exactly as today

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

### Requirement: A non-list-bound sequence exposes per-item operator fields (text AND composition)

When a sequence's ITEM-LIST is NOT data-bound, EVERY item SHALL contribute
operator-editable field(s) to the data form, NAMESPACED per item, reusing the
D-025 instance-namespacing (no new data model) — so a non-bound sequence
(including a mixed clock+text/logo rotator) is FULLY operator-editable in the
preview with NO need to wrap plain text in a composition. A TEXT item
contributes a single flat TEXT field (its text); a COMPOSITION item contributes
its referenced composition's fields (a group). Each is DISPLAYED as
`<sequence name>[<index>]` but KEYED by a stable, parent-unique id-based value
(so two same-named sequences never collide and a rename never orphans values),
and lives under the item's own scope path (a sequence nested in a composition
instance reads its correctly-scoped sub-object). Setting a field SHALL update
that item in the preview — a text item's text directly, a composition item's
content via the existing composition-field mechanism — applied when the item
renders and re-applied live on `update()`. To avoid double-exposure, a
LIST-BOUND sequence SHALL expose NO per-item fields (the bound list owns the
items; the list editor with the dwell column is unchanged).

#### Scenario: A non-bound mixed sequence exposes every item's field

- **WHEN** a sequence is NOT list-bound and has a plain text item and a
  composition item
- **THEN** the data form shows the text item as a flat per-item field AND the
  composition item's fields under its group, each displayed `<sequence
name>[<index>]` (keyed stably so same-named sequences don't collide)

#### Scenario: Setting a per-item field updates the right item

- **WHEN** the operator sets a text item's field or a composition item's field
- **THEN** that item updates in the preview — the text item's text directly, the
  composition item's content via the composition-field mechanism — at render and
  live on `update()`

#### Scenario: A list-bound sequence exposes no per-item fields

- **WHEN** a sequence's item-list IS data-bound
- **THEN** no per-item fields are exposed (the bound list drives the items via
  the existing list editor); per-item exposure resumes if the binding is removed

### Requirement: Multi-line sequence item text

The runtime SHALL render a sequence item's text as MULTI-LINE on air: it SHALL honor explicit `\n`
line breaks AND auto-wrap a line longer than the element width onto additional lines
(`white-space: pre-wrap` + a cap to the item's grid cell + `overflow-wrap: break-word`), composing
authored breaks with wrapping. The item SHALL wrap inside the FIXED element box (grid cell), and its
per-item transition (push-up etc.) SHALL animate the WHOLE multi-line block as one unit by the fixed
box height — content exits/enters cleanly, never cut mid-line. `align` / `verticalAlign` / RTL
reading direction SHALL still position the taller item correctly. A single-line item SHALL render
exactly as before.

#### Scenario: Explicit line breaks

- **WHEN** a sequence item's text contains `\n`
- **THEN** it breaks at exactly those points on air

#### Scenario: Long line auto-wraps at the element width

- **WHEN** a sequence item's line is longer than the element width
- **THEN** it wraps onto additional lines (no overflow past the box) rather than one over-long line

#### Scenario: Multi-line height adapts and alignment/RTL still position it

- **WHEN** a sequence item becomes multi-line
- **THEN** its block height adapts and `align` / `verticalAlign` / RTL reading direction still
  position it correctly within the box

#### Scenario: The multi-line block transitions as one unit

- **WHEN** a multi-line sequence item enters or exits via its transition (e.g. push-up)
- **THEN** the transition animates the full multi-line block cleanly by the fixed box height (no
  mid-line cut)

#### Scenario: Preview equals export

- **WHEN** a multi-line sequence item is previewed and exported
- **THEN** the on-air rendering is identical (both go through the same runtime sequence driver)

#### Scenario: Single-line unchanged

- **WHEN** a sequence item is single-line (no `\n`, fits the element width)
- **THEN** its rendering is unchanged (no regression)

### Requirement: Multi-line textarea for sequence item text

A sequence's per-item TEXT field SHALL be a multi-line, vertically resizable textarea (the shared
`renderer/ui/Textarea` design-system primitive), not a single-line input — comfortably sized for long
Persian copy — in BOTH the inspector (properties panel) AND the operator preview field form, so the
two match. Pressing Enter in it SHALL insert a `\n` into the item text and SHALL NOT commit/close the
field. Edits SHALL commit through the existing item-update store path (`setSequenceItems`, one undo
entry per edit), so an embedded `\n` round-trips through the store; in the inspector the textarea
SHALL apply the element's `direction` (`dir`) for RTL/mixed text. A composition item's picker is
unaffected (only the TEXT item gets the textarea).

#### Scenario: The item-text control is a textarea

- **WHEN** editing a sequence TEXT item's text in the inspector
- **THEN** the control is a multi-line textarea (the shared primitive), not a single-line input

#### Scenario: The preview field form matches the inspector

- **WHEN** editing a sequence-bound list field's item text in the operator PREVIEW field form
- **THEN** the control is the same multi-line textarea (not a single-line input) — the preview matches
  the properties panel

#### Scenario: Enter inserts a newline, not a commit

- **WHEN** the operator presses Enter in the item-text textarea
- **THEN** a `\n` is inserted into the item text and the field is NOT committed/closed

#### Scenario: Edits commit via the existing path and round-trip the newline

- **WHEN** the operator types multi-line text (including `\n`) into a sequence item
- **THEN** it commits through the existing `setSequenceItems` item-update path (one undo entry per
  edit), the value round-trips with the embedded `\n`, and undo reverts the edit

#### Scenario: RTL item text edits in reading order

- **WHEN** the sequence element's `direction` is `rtl`
- **THEN** the item-text textarea is `dir="rtl"` so Persian text edits in reading order
