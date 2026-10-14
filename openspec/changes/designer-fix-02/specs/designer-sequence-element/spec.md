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
(`'top' | 'bottom' | 'left' | 'right' | 'none'`, defaults `'bottom'`/`'top'`,
plus the fade edges of `D-163`), a `transitionTiming` (`'simultaneous'` push,
both motions together | `'sequential'` out-then-in; default `'simultaneous'`),
each motion lasting `transitionMs` (default 400), eased with the SHARED
`ease-in-out` easing, inside the clipped box. An edge of `'none'` is an instant
cut for that side. Named presets are VALUES over those fields — Push ×4
(simultaneous), Slide ×4 (sequential), **Cut** (`none`/`none`; it was called
"Hide-show", which promised a motion it never had — `B-105`, the owner's
decision 2026-10-14, Q7 (a)) — and the decomposition is the extensible seam for
future styles (new enum members, no schema break).

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
  Cut)

#### Scenario: Presets map onto the three fields; anything else is Custom

- **WHEN** the operator picks a transition preset
- **THEN** the three fields are set accordingly (Push ×4 = simultaneous,
  Slide ×4 = sequential, Cut = none/none) and editing any field
  afterwards shows **Custom** — every IN × OUT × timing combination is
  authorable

#### Scenario: The instant swap is called Cut

- **WHEN** the preset list is shown
- **THEN** the `none`/`none` preset reads **Cut**, and no preset is labelled "Hide-show"

### Requirement: Designer authoring — time-driven, not scrubbed

The Designer SHALL provide a Sequence tool and an inspector section editing the transition preset (Crossfade, Fade out fade in, the drift crossfades, Push up/down/left/right, Slide up/down/left/right, Cut; a field combination matching no preset displays Custom), the decomposed In/Out/Timing fields, `transitionMs` (edited in seconds as **transition time**, like the dwell), `advance`, the default dwell (edited in seconds), `repeat` (infinite | N passes), `direction`, and the items (via the shared editor with the dwell column), alongside text styling (font, colour incl. gradient `colorFill`, and a **Text Shadow** section with offset X/Y on one line) — and NO background, box padding, border-radius, or stroke/path-style controls (D-056 — the sequence carries only its text; box styling belongs on a separate shape layer). The inspector SHALL state the sequence is time-driven: timeline scrubbing does not move it (same affordance as ticker/clock). The playout inspector SHALL offer the content-driven hold source when the composition contains a sequence, with copy naming all three content kinds.

#### Scenario: Scrubbing does not move the sequence

- **WHEN** the operator scrubs the timeline over a composition containing a sequence
- **THEN** the displayed item does not change, and the inspector states the sequence is time-driven

#### Scenario: A sequence enables the content-driven hold source

- **WHEN** a composition contains a sequence
- **THEN** the playout inspector offers the content-driven hold source (copy generalized: ticker passes / countdown / sequence passes)

#### Scenario: The sequence inspector exposes no box styling

- **WHEN** a sequence is inspected
- **THEN** it shows text controls (font, colour incl. gradient, Text Shadow) but NO background, box padding, border-radius, or stroke/path-style controls (D-056)

### Requirement: A non-list-bound sequence exposes per-item operator fields (text AND composition)

When a sequence's ITEM-LIST is NOT data-bound, its items SHALL contribute operator-editable
field(s) to the data form, NAMESPACED per item, reusing the D-025 instance-namespacing (no new data
model). A COMPOSITION item SHALL contribute its referenced composition's fields as a group. A TEXT
item SHALL contribute a field only when the designer bound it explicitly (its per-item data key);
an unbound text item is static design-time content and contributes nothing (the D-083 follow-up,
which this text now states — it used to say every item contributes). A composition item's group
SHALL be DISPLAYED as `<composition> — item N` — the item's COMPOSITION's authored name and its
1-based position (`R-037`, the owner's decision 2026-10-14, Q22 (a); it used to be the sequence
element's name, an internal label such as `ROTATOR`) — and, ONLY when two headings at one level
would otherwise read the same, followed by ` · <stub>`: the sequence's name when the colliding
sequences' names differ, else a short stub of its id (`R-040`). The heading SHALL also be carried as
its parts, so CG Control's Inspector and the Designer's preview form render each name in its own
`<bdi>` with `— item N` as chrome (golden rule 11); the GDD carries the joined text. Each group
SHALL be KEYED by a stable, parent-unique id-based value (so two same-named sequences never collide
and a rename never orphans values), and lives under the item's own scope path (a sequence nested in
a composition instance reads its correctly-scoped sub-object). Setting a field SHALL update that
item in the preview — a bound text item's text directly, a composition item's content via the
existing composition-field mechanism — applied when the item renders and re-applied live on
`update()`. To avoid double-exposure, a LIST-BOUND sequence SHALL expose NO per-item fields (the
bound list owns the items; the list editor with the dwell column is unchanged).

#### Scenario: A non-bound mixed sequence exposes its composition item, named for the composition

- **WHEN** a sequence named `Now/Next` is NOT list-bound and has an unbound text item and, at
  position 2, an item of composition `card`
- **THEN** the data form shows NO field for the text item, and the composition item's fields under
  the heading `card — item 2` (keyed stably so same-named sequences don't collide)

#### Scenario: Two headings that would collide are told apart

- **WHEN** two sequences each show composition `card` at position 1
- **THEN** their headings read `card — item 1 · <sequence name>` when the sequences' names differ,
  and `card — item 1 · <id stub>` when they do not; with no collision no stub is shown

#### Scenario: Each name is isolated

- **WHEN** the composition's name is Persian and a stub is shown
- **THEN** CG Control's Inspector and the Designer's preview form render the name and the stub each
  in its own `<bdi>`, and `— item N` outside them

#### Scenario: Setting a per-item field updates the right item

- **WHEN** the operator sets a bound text item's field or a composition item's field
- **THEN** that item updates in the preview — the text item's text directly, the composition item's
  content via the composition-field mechanism — at render and live on `update()`

#### Scenario: A list-bound sequence exposes no per-item fields

- **WHEN** a sequence's item-list IS data-bound
- **THEN** no per-item fields are exposed (the bound list drives the items via the existing list
  editor); per-item exposure resumes if the binding is removed
