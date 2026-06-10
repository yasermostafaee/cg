# designer-ticker-element Specification

## Purpose
TBD - created by archiving change add-ticker-element. Update Purpose after archive.
## Requirements
### Requirement: Ticker element with content-driven crawl

The schema SHALL define a `ticker` element: a clipped horizontal band (geometry
from the base transform) that scrolls a list of text items continuously, styled
with the shared text styling (`font`, `color`, optional background and
`textShadow`), configured by `direction: 'rtl' | 'ltr'` (reading direction,
explicit — no `'auto'`), `speed` (px/s, positive), `gap` (px between items),
optional `separator`, and `items: [{ id, text }]` as authored defaults. The
crawl's duration SHALL be content-driven: measured content width ÷ `speed` —
never a manually authored duration.

#### Scenario: Longer content crawls proportionally longer

- **WHEN** a ticker's items are replaced with content of twice the measured
  width at the same `speed`
- **THEN** one full pass takes proportionally longer (≈ twice the crawl time),
  with no manual duration edit anywhere

#### Scenario: Measurement waits for fonts

- **WHEN** the first pass duration is computed
- **THEN** item widths have been measured at or after `document.fonts.ready`,
  so glyph metrics are final (no FOUT mis-measure) — in the Designer preview
  this includes operator-imported `asset-*` font faces, which the preview
  loads and awaits before the runtime can play

### Requirement: Treadmill crawl with an inner repeat loop

The runtime SHALL render the ticker as a clipped band with an inner track
translated via `transform` (no per-frame relayout). Item widths SHALL be
measured at or after fonts-ready and RE-measured once per content cycle (the
self-heal: a width measured mid-font-swap — e.g. an `update()` whose text
first triggers a lazy `unicode-range` face — is corrected within one lap);
exited item nodes SHALL be recycled to feed the continuing crawl.

The ticker SHALL own its INNER repeat loop: `repeat: 'infinite' | N`
(default `'infinite'`) crawl passes per run, with
`cycleBoundary: 'seamless' | 'drain'` (default `'seamless'`) deciding the
seam between passes — `'seamless'` lets the first item follow the last
(separated by `gap`/`separator`) with no gap, flash, or restart; `'drain'`
lets each pass fully EXIT the band before the next re-enters. A finite run
SHALL end CLEANLY: feeding stops after the Nth pass's last item, and the run
completes only when that item has fully exited the band — never cut
mid-scroll — then signals completion to its scope's playout (the
`designer-playout-lifecycle` content-driven hold). WITHIN one hold the
treadmill rolls continuously; each composition open/close cycle restarts the
crawl from its entering edge. These are designer-set defaults and
session-overridable per scope (`tickerRepeat` / `tickerBoundary`), the same
layering as `holdMs`/`repeat`. `pause()` SHALL freeze the crawl and
`resume()` SHALL continue it, in lockstep with the playout controller's hold
timing.

#### Scenario: Seamless wrap at the loop seam

- **WHEN** the crawl reaches the end of the item list with
  `cycleBoundary: 'seamless'` (and passes remain)
- **THEN** the first item follows the last item at the configured spacing with
  no visible gap, flash, or jump

#### Scenario: Drain empties the band between passes

- **WHEN** the crawl reaches the end of the item list with
  `cycleBoundary: 'drain'` (and passes remain)
- **THEN** every item of the finished pass fully exits the band before the
  next pass's first item enters

#### Scenario: A finite repeat ends cleanly and completes

- **WHEN** a `repeat: 2` ticker's second pass's last item fully exits the band
- **THEN** the run signals completion to its scope (no third pass is ever fed,
  and nothing is cut mid-scroll)

#### Scenario: Pause freezes the crawl

- **WHEN** `pause()` is called mid-crawl and `resume()` follows
- **THEN** the crawl freezes at its current offset and continues from exactly
  there, consistent with the frozen hold timing

### Requirement: update() reconciles items by stable id

A ticker bound to a `list` field SHALL reconcile on `update()`: items are
matched by `id`; existing items keep their node and on-screen position; new
items enter the feed at their list position; removed items leave gracefully
once off-screen (they are never re-fed); an existing id with changed text is
corrected IN PLACE — re-measured with its leading edge unchanged and the
following on-screen content shifted by exactly the width delta (no restart,
no flash; a re-feed never pops in behind the entering edge). A bare
string-array payload SHALL be accepted with positional-id fallback.

#### Scenario: Live update without a visual jump

- **WHEN** `update()` delivers a list where one item was appended and another
  removed, while the crawl is on screen
- **THEN** the visible items do not jump or restart; the appended item enters
  with the flow; the removed item, if visible, scrolls out and never returns

### Requirement: RTL reading-direction crawl

`direction` SHALL be the reading direction. `'rtl'` (the Persian default in
authoring) SHALL lay items out right-to-left (the list head at the track's
visual right) with the track moving visually left→right; `'ltr'` SHALL be the
exact mirror. Each item SHALL be bidi-isolated (item-level direction +
isolation), so mixed RTL/LTR items — Persian text with embedded Latin brand
names or digits — shape correctly inside an item and never reorder across item
or separator boundaries.

#### Scenario: Persian crawl with mixed-content items

- **WHEN** an `'rtl'` ticker crawls items mixing Persian text and Latin
  words/digits
- **THEN** the track moves visually left→right, items appear in list order
  read right-to-left, each item's internal bidi rendering is correct, and no
  item or separator visually swaps with a neighbour

### Requirement: List dynamic-field type with an extensible item shape

The schema SHALL define a `list` dynamic-field type whose value is an array of
items, each an object with a **required `id`** and open additional fields
(consumers read the fields they know; the ticker reads `text`). `FieldValue`
SHALL admit this array. A `ticker-items` binding target SHALL connect a `list`
field to a ticker element. List values SHALL travel as JSON (the legacy
CasparCG XML payload path cannot carry them).

#### Scenario: List field drives the ticker

- **WHEN** a `list` field bound to a ticker receives a new items array via
  `update()` (JSON payload)
- **THEN** the ticker reconciles to the new items by id

#### Scenario: Item shape stays open for future consumers

- **WHEN** a list item carries extra fields beyond `text` (e.g. a repeater's
  `name`/`number`)
- **THEN** schema validation accepts the item (required `id`, open fields) and
  the ticker simply consumes `text`

### Requirement: Designer authoring and live preview editing

The Designer SHALL provide a ticker tool that inserts a ticker element, and an
inspector section editing `direction`, `speed`, `gap`, `separator`, the inner
loop (`repeat` — a fresh ticker shows `'infinite'` by design — and
`cycleBoundary`), text styling parity (font family/weight/size, colour, band
background defaulting to transparent, shadow, padding, radius), and the items
(add / remove / reorder / edit text). The composition inspector and the
preview's per-scope timing SHALL expose the hold-source select and the
session-only `tickerRepeat`/`tickerBoundary` overrides ONLY when the scope
actually contains a ticker (no dead controls). Assigning a data key to a
ticker SHALL seed a `list` field from the element's authored items and bind it
via `ticker-items`; the preview field form SHALL render a `list` field as the
same items editor, live-updating the crawl. The UI SHALL state that the ticker
is time-driven: timeline scrubbing does not move it.

#### Scenario: Author → bind → live-edit flow

- **WHEN** the author inserts a ticker, edits its items, assigns a data key,
  opens the preview, and edits the list in the field form
- **THEN** the canvas shows the ticker, the field form shows the items editor
  seeded from the element, and each edit live-updates the crawl via `update()`

#### Scenario: Scrubbing does not move the ticker

- **WHEN** the author scrubs the timeline over a composition containing a
  ticker
- **THEN** keyframed elements follow the playhead but the ticker's crawl
  offset does not change, and the UI communicates that the ticker is
  time-driven

### Requirement: Export parity and GDD representation

The single-file HTML export SHALL carry the ticker with behaviour identical to
the preview (same runtime source; the duration supplier needs no boot-option
wiring). The GDD SHALL represent a `list` field as a typed array property with
an object `items` schema declaring the known keys. Export preflight SHALL warn
(not block) that third-party GDD clients may not render an array editor, and
that `.vcg` exports ship no font bytes (ticker durations measured against
fallback fonts are silently wrong).

#### Scenario: Preview equals export

- **WHEN** the same scene plays in the Designer preview and as the exported
  single-file HTML
- **THEN** the ticker's crawl, pass duration, wrap, and RTL behaviour are
  identical

#### Scenario: Preflight warns about list-field portability

- **WHEN** a scene with a ticker bound to a `list` field is exported as
  single-file HTML
- **THEN** the export succeeds and the warnings include the third-party
  list-editor limitation

