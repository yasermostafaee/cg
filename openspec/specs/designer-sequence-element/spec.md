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
reading `direction: 'ltr' | 'rtl'`. Items are
`{ id, text, dwellMs? }` (`SequenceItemSchema` — stable `id` is the
reconcile key). The move between items SHALL be a DECOMPOSED transition: an
IN edge and an OUT edge (`'top' | 'bottom' | 'left' | 'right' | 'none'`,
defaults `'bottom'`/`'top'`), a `transitionTiming`
(`'simultaneous'` push, both motions together | `'sequential'` out-then-in;
default `'simultaneous'`), each motion lasting `transitionMs` (default 400),
eased with the SHARED `ease-in-out` easing, transform-only inside the
clipped box. An edge of `'none'` is an instant cut for that side. Named
presets are VALUES over those fields — Push ×4 (simultaneous), Slide ×4
(sequential), Hide-show (`none`/`none`) — and the decomposition is the
extensible seam for future styles (new enum members, no schema break).

#### Scenario: Sequence tool inserts the Persian now/next defaults

- **WHEN** the operator picks the Sequence tool and clicks the canvas
- **THEN** a sequence element is added (3 sample Persian now/next items,
  `rtl`, `advance: 'auto'`, `defaultDwellMs: 5000`,
  `transitionIn: 'bottom'`, `transitionOut: 'top'`,
  `transitionTiming: 'simultaneous'` — the "Push up" preset —
  `transitionMs: 400`, `repeat: 'infinite'`) and the authoring canvas shows
  item 1

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
preserving unknown item fields.

#### Scenario: Reconcile never yanks the current item

- **WHEN** `update()` delivers a bound `list` value while an item displays
- **THEN** items reconcile by stable id; the CURRENT item is never yanked
  mid-display (a text edit applies in place; a removal takes effect at the
  next advance); per-item `dwellMs` carried in the list value is honored

#### Scenario: The shared items editor gains an optional per-item dwell

- **WHEN** items are edited in the inspector or the preview field form
- **THEN** the shared items editor exposes an optional per-item dwell, and
  unknown item fields are preserved (the existing editor invariant)

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
