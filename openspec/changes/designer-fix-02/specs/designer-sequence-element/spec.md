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
