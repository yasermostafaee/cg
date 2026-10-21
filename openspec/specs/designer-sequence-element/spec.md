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

### Requirement: Picture items in a sequence

A sequence item SHALL also be a PICTURE item `{ kind: 'image', id, assetId?, media?, name?, dwellMs? }`
carrying exactly one of `assetId` (a page the author put in the template, a project asset) or
`media` (the SHA-256 of a page the operator loaded, held by CG Bridge). A sequence SHALL carry one
`imageFit` for all its pictures, with the image element's `fit` values and default `contain`. A
picture item SHALL be drawn by the image element's own renderer, never a second one. The widening is
additive: every sequence authored before it parses unchanged, with no schema-version bump.

#### Scenario: An old sequence parses unchanged

- **WHEN** a sequence authored before picture items is parsed
- **THEN** it parses to the same value, with no `imageFit` and no picture item injected

#### Scenario: A picture item round-trips through export and import

- **WHEN** a sequence holding picture items is exported as a `.vcg` and unpacked
- **THEN** its items and `imageFit` come back unchanged and the package carries each picture's asset

#### Scenario: A picture item needs exactly one source

- **WHEN** a picture item names both `assetId` and `media`, or neither
- **THEN** the schema refuses it

### Requirement: Add many pictures at once, in natural order

The Designer SHALL offer `Add pictures…` (many files) and `Add folder…` on a sequence. Each file
SHALL be imported through the existing asset import (deduplicated by SHA-256) and become one picture
item, in natural file-name order: digit runs compare as numbers in Latin, Persian and Arabic-Indic
digits alike (`page2` before `page10`, `صفحه۲` before `صفحه۱۰`). For a sequence holding pictures,
the Inspector's Items section SHALL be a card — the page count, the first pages as thumbnails,
`Manage pages…`, and the add row `Add pictures…`, `Add folder…`, `Add text`, `Add composition` — and
SHALL NOT list the pages one row each; the pages are seen and arranged in the Pages manager. Every
button SHALL say what it does in its tooltip, drawn above any dialog. The first pictures added to a
sequence SHALL make it a book: transition Crossfade (`fade`/`fade`, simultaneous), `advance:
'manual'`, `repeat: 1`, all of which the author can change.

#### Scenario: Twelve files become twelve pages in natural order

- **WHEN** the author adds twelve files named `page1.png` … `page12.png`, picked in any order
- **THEN** the sequence holds twelve picture items in the order 1 … 12, the Inspector reads
  `12 pages` with no row per page, and the Pages manager lists them 1 … 12

#### Scenario: The pages render where the author works

- **WHEN** pictures are added with the Assets panel closed
- **THEN** the canvas and Preview draw the pictures themselves, not the missing-image placeholder

#### Scenario: A duplicate file is one asset

- **WHEN** two of the picked files have identical bytes
- **THEN** the project holds one asset for them and both items name it

#### Scenario: The first pictures make a book

- **WHEN** pictures are added to a sequence that has none
- **THEN** its transition is Crossfade, its advance manual and its repeat one pass

### Requirement: Fade and crossfade between items

A sequence edge SHALL also be `fade`: no motion, the item's opacity eased in (IN) or out (OUT) over
`transitionMs` through the shared ease-in-out curve. IN and OUT both `fade` under `simultaneous` SHALL
be a DISSOLVE that adds the two items (`plus-lighter` in an isolated box) so the picture never dims
mid-way, and SHALL leave the item at rest with no opacity, blend or isolation of its own; under
`sequential` the current item fades out, then the next fades in. `fade-right` / `fade-left` /
`fade-bottom` / `fade-top` SHALL fade and drift a short way from that side into place — 3 % of the box
along that axis, at least 6 and at most 40 px, never from off-screen — and count as fades for the
dissolve. The Inspector SHALL offer the presets `Crossfade` (fade/fade simultaneous), `Fade out, fade
in` (fade/fade sequential), and the drift crossfades — in from right, from left, up from below, down
from above (the current item fades where it is; the next fades in with the drift), name the
preset field `transition` and the time field `transition time` (in seconds, as the dwell is), and
withhold that time — shown, disabled,
saying why — when Cut leaves nothing to time.

#### Scenario: A crossfade never dims the page

- **WHEN** a book of opaque pages crossfades from one page to the next
- **THEN** every frame shows the pages mixed at full brightness — no darker frame between them, no
  blank frame — and at rest the page carries no fade styling

#### Scenario: A drift crossfade nudges the next item into place

- **WHEN** a sequence crossfades with a drift in from the right
- **THEN** the current item fades out where it is, and the next fades in while moving a few pixels
  from the right to its place, ending exactly at rest

#### Scenario: Every sequence's first item enters with its effect

- **WHEN** a sequence — infinite or counted — starts with a transition other than Cut
- **THEN** its first item enters with that transition, and a NEXT pressed during that entrance is
  applied as it ends, once

#### Scenario: Cut has no transition time to set

- **WHEN** the author picks Cut
- **THEN** the `transition time` field is disabled and its tooltip says Cut swaps at once

### Requirement: The author decides whether the operator steps a sequence

A sequence SHALL carry `operatorSteps` (absent ⇒ the operator steps it, so every template authored
before keeps its NEXT), shown in the Inspector as `operator steps`, on by default. One predicate
(`sequenceStepsByOperator`) SHALL answer it, and `hasNextStep` — CG Control's NEXT and the Designer
Preview's Next / Previous — the page's `CG NEXT`, Previous and Go to, and a page list's `step` SHALL
all read it: a sequence that runs by itself is moved by no console verb, still advances on its own
dwell, and a book of it shows no Previous / Next / Go to while its pictures stay the operator's to
load. The bridge SHALL refuse a page turn on such a list, sending nothing.

#### Scenario: Clocks that run by themselves offer no Next

- **WHEN** a template's only sequence has `operator steps` off
- **THEN** CG Control offers no NEXT for it, the Preview's Next and Previous are disabled, and a
  `CG NEXT` leaves it where it is while its own dwell still advances it

#### Scenario: An older template keeps its Next

- **WHEN** a sequence authored before this option is imported
- **THEN** it is stepped exactly as before

### Requirement: The Pages manager

The Pages manager SHALL show every item of the sequence as a numbered card in reading order — a
picture as a thumbnail scaled down once and kept for the session (never every page decoded at full
size) with its file name, a text item as its text box (typed in the sequence's Digits), a composition
item as its composition picker. It SHALL add pictures, a folder, a text item or a composition item in
the grid itself; move an item by dragging it (the selected items move together) and by an earlier /
later button on each card; remove one item, or a selection made by clicking a thumbnail or a card's
number (Shift-click selects a run); sort the pictures in natural file-name order, a text or
composition item keeping its place; and offer the sequence's item editor as a List view. Each change
SHALL be one edit, applied at once and undoable; Done SHALL only close.

#### Scenario: Drag, step, remove a selection, sort

- **WHEN** the author drags page 4 before page 1, moves page 1 one step later, selects two pages and
  removes them, then sorts by name
- **THEN** the cards follow each change in that order, the count reads the pages left, and the sort
  restores natural file-name order

#### Scenario: Every kind is added where the author is

- **WHEN** the author adds a text item from the Inspector's card, types its text in the grid, and
  adds a composition item in the grid
- **THEN** the sequence holds them in that order, the composition card shows the first composition,
  the List view shows the same text, and every add button carries a tooltip

### Requirement: Previous and Go to beside Next

The page runtime SHALL implement `previous()` and `goTo(index)` beside `next()`. Under a finite
`repeat`, Previous on the first item SHALL stay on it and Next on the last item SHALL stay on it (the
book does not wrap); under `'infinite'`, Next SHALL wrap as today and Previous SHALL mirror it.
`goTo` SHALL be absolute and latest-wins: a request arriving during a transition SHALL be applied
when the transition ends, never dropped; before a run starts it SHALL set the item the run starts on.
A bridge-driven page turn SHALL arrive as the `__cg.page` member of a `CG UPDATE`
(`{ field, index, media? }`), which an older page ignores.

#### Scenario: The book does not wrap

- **WHEN** a sequence with `repeat: 1` shows its last page and Next arrives, or its first page and
  Previous arrives
- **THEN** the same page stays on screen

#### Scenario: An infinite sequence wraps both ways

- **WHEN** a sequence with `repeat: 'infinite'` shows its first item and Previous arrives
- **THEN** it moves to the last item

#### Scenario: Go to during a transition is not lost

- **WHEN** `goTo` arrives while a transition is running
- **THEN** the sequence moves to that page as soon as the transition ends

### Requirement: A page turn never shows a blank frame

A picture SHALL be decoded before it replaces the page on screen. A picture whose bytes are missing
or cannot be decoded SHALL leave the previous page on screen. Only the page on screen and the page
coming in SHALL exist as nodes. An operator page SHALL arrive as an ADDRESS on the template's own
origin (`/page/<sha256>.<ext>`) — never as bytes — and the page SHALL keep at most three of them; any
other value in `__cg.page.media` SHALL be dropped.

#### Scenario: The old page holds until the new one is decoded

- **WHEN** a page turn's picture takes time to decode
- **THEN** the old page stays fully on screen until the new one is ready, then the new one replaces
  it

#### Scenario: A page that cannot be shown keeps the previous one

- **WHEN** a page turn names a picture the page does not have or cannot decode
- **THEN** the previous page stays on screen

### Requirement: A picture sequence's Data key is a page list whatever order the author worked in

A `list` field bound by `sequence-items` to a sequence SHALL be a page list exactly when every item of the sequence,
and every item of the field's default, is a picture; an empty sequence SHALL keep the field's stored mark. The rule
SHALL be one predicate in `@cg/shared-schema` (`isPageListField`), and the Designer SHALL keep the stored `pages` mark
equal to it after every edit: a field-meta edit (Title, Description, Required, Digits, Allow file source) SHALL keep
the mark; a change of the items from text to pictures or back SHALL keep the Data key and flip the mark (only a list
that mixes text and pictures, or holds a composition item, loses its key); a list re-adopted by a Data key or bound
from the canvas SHALL take the mark, and a book given an empty list SHALL take its pages as the default. Opening a
project SHALL repair a mark that disagrees with the rule (a registered scene migration, identity-preserving).

#### Scenario: The key set before Add folder… survives as a page list

- **WHEN** an author gives a new sequence a Data key and then adds a folder of pictures (which replace the untouched
  samples)
- **THEN** the key is still there, its field is marked a page list, and its default is the pictures

#### Scenario: Allow file source does not unmake a book

- **WHEN** a picture sequence's Data key field has "Allow file source", Title, Description, Required or Digits edited
- **THEN** the field is still marked a page list

#### Scenario: Pages managed after the key stay a page list

- **WHEN** pages are removed or reordered in the Pages manager, or the sequence's Advance is changed, after the key was
  set
- **THEN** the field is still a page list and its default follows the pages

#### Scenario: Pictures replaced by text

- **WHEN** a keyed picture sequence's items are replaced by text items
- **THEN** the key is kept as a text list, without the page-list mark

#### Scenario: An old project with a lost mark opens repaired and clean

- **WHEN** a project whose book field lacks the mark (the owner's `telavat2` shape) is opened
- **THEN** the field carries the mark and the project reads as saved

### Requirement: A stepped picture sequence exports as a book without a Data key

The `.vcg` export SHALL give every sequence of the package's root (or entry composition) that holds only pictures, that
the operator steps, and whose items no field drives, a page list: id `pages-<elementId>`, the sequence's name as its
label, the pictures as its default, and a `sequence-items` binding. The author's project SHALL NOT gain the field. A
sequence the operator does not step SHALL NOT get one.

#### Scenario: A keyless book exports with its page list

- **WHEN** a composition holding a picture sequence with no Data key is exported
- **THEN** the package's `template.json` has a field `pages-<elementId>`, labelled with the sequence's name, marked a
  page list, bound to the sequence's items

#### Scenario: A lost mark is exported marked

- **WHEN** a book whose key field lacks the mark is exported
- **THEN** the package's field carries `pages: true`

### Requirement: A book on advance auto is said in the Inspector

The Designer's Inspector SHALL show one sentence under **advance** when a sequence holds only pictures, is stepped by
the operator, and is set to `auto`: that the book turns itself every dwell while CG Control counts only the operator's
turns, so its page number falls behind and its Next goes to the page after the last one it sent; and that advance
manual is the setting for a book the operator turns. A page list's Data key SHALL NOT offer "Allow file source"; it
SHALL say that operators turn and load its pages in CG Control (Load folder…).

#### Scenario: Auto is said, manual is not

- **WHEN** a book's advance is `auto`
- **THEN** the sentence shows, naming the dwell; with `manual`, or for a sequence that runs by itself, or for text, it
  does not

#### Scenario: A book's key offers no text-file grant

- **WHEN** a book's Data key section is open
- **THEN** there is no "Allow file source" control, and a line names Load folder…
