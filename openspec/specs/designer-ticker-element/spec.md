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

The Designer SHALL provide a ticker tool that inserts a ticker element, and an inspector section editing `direction`, `speed`, `gap`, `separator`, the inner loop (`repeat` — a fresh ticker shows `'infinite'` by design — and `cycleBoundary`), text styling (font family/weight/size, colour incl. gradient `colorFill`, and a **Text Shadow** section with offset X/Y on one line) — and NO band background, box padding, border-radius, or stroke/path-style controls (D-056 — the ticker carries only its text; box styling belongs on a separate shape layer) — and the items (add / remove / reorder / edit text). The composition inspector and the preview's per-scope timing SHALL expose the hold-source select and the session-only `tickerRepeat`/`tickerBoundary` overrides ONLY when the scope actually contains a ticker (no dead controls). Assigning a data key to a ticker SHALL seed a `list` field from the element's authored items and bind it via `ticker-items`; the preview field form SHALL render a `list` field as the same items editor, live-updating the crawl. The UI SHALL state that the ticker is time-driven: timeline scrubbing does not move it.

#### Scenario: Author → bind → live-edit flow

- **WHEN** the author inserts a ticker, edits its items, assigns a data key, opens the preview, and edits the list in the field form
- **THEN** the canvas shows the ticker, the field form shows the items editor seeded from the element, and each edit live-updates the crawl via `update()`

#### Scenario: Scrubbing does not move the ticker

- **WHEN** the author scrubs the timeline over a composition containing a ticker
- **THEN** keyframed elements follow the playhead but the ticker's crawl offset does not change, and the UI communicates that the ticker is time-driven

#### Scenario: The ticker inspector exposes no box styling

- **WHEN** a ticker is inspected
- **THEN** it shows text controls (font, colour incl. gradient, Text Shadow) but NO background, box padding, border-radius, or stroke/path-style controls (D-056)

### Requirement: Export parity and GDD representation

The single-file HTML export SHALL carry the ticker with behaviour identical to
the preview (same runtime source; the duration supplier needs no boot-option
wiring). The GDD SHALL represent a `list` field as a typed array property with
an object `items` schema declaring the known keys; a `list` field bound
`repeater-items` (D-030) SHALL instead derive that item schema from the
referenced child composition's fields — each child field mapped through the
standard field→GDD property rules (gddType, min/max/pattern/default) with the
child's required fields as the item schema's `required` (the `id` reconcile
key stays declared) — while every other `list` field keeps the generic open
item shape. Export preflight SHALL warn (not block) that third-party GDD
clients may not render an array editor, and that `.vcg` exports ship no font
bytes (ticker durations measured against fallback fonts are silently wrong).

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

#### Scenario: A repeater-bound list derives its item schema from the child

- **WHEN** a `list` field bound `repeater-items` is exported and the
  referenced child composition declares fields (e.g. a text `name` and a
  number `score` with min/max)
- **THEN** the GDD array's item schema declares those keys with the child
  fields' types, constraints, defaults, and required flags — not the
  generic `{id, text}` shape — while a ticker/sequence-bound list is
  unchanged

### Requirement: Vertical alignment of the crawl text within the band

The ticker SHALL expose a `verticalAlign` (top / middle / bottom) that positions the crawl text within the band height, applied identically to BOTH the static authoring row (the Designer canvas) and the live crawl item nodes (the runtime driver) so authoring and playout match. It SHALL default to `'middle'` (the prior hardcoded centring) so a ticker authored before this change renders vertically centred exactly as today (non-breaking, no migration). The ticker SHALL NOT have a horizontal-align control — it is a crawl. `verticalAlign` SHALL NOT be keyframe-able.

#### Scenario: Vertical align positions both the authoring row and the crawl

- **WHEN** a ticker's `verticalAlign` is set to top or bottom
- **THEN** the static authoring row AND each live crawl item node position the text at that vertical edge of the band (top → `flex-start`, bottom → `flex-end`), so the canvas and the running crawl match

#### Scenario: A pre-D-045 ticker stays vertically centred

- **WHEN** a ticker authored before this change (no `verticalAlign`) is loaded, rendered, or played
- **THEN** `verticalAlign` defaults to `'middle'` and the crawl renders vertically centred exactly as today

### Requirement: Image/logo ticker separator

The ticker's `separator` SHALL accept an image/logo as well as a text glyph: the schema widens
`separator` to `string | { kind: 'image', assetId, source: 'project' | 'shared', size: { w, h } }`
(still optional). This SHALL be a backward-compatible widening — every existing string separator
stays valid — so it needs NO schema-version bump and NO migration. The runtime SHALL render an image
separator as its own `<img>` node placed BETWEEN items only (never trailing the final item — the
D-081 rule holds for images too), vertically aligned to the ticker's `verticalAlign` (centred by
default) like the crawl items, at the authored `size` (an explicit `w`×`h` box, so the treadmill
has a deterministic separator width with no asynchronous image measurement; `object-fit: contain`
fits the logo within the box). The image `src` SHALL
resolve through the same two-source (`project` vs the shared library) asset seam as image elements:
the node SHALL carry `data-cg-asset-id` / `data-cg-asset-source` for the host `assetUrls` walk
(static authoring row + export), and the driver SHALL also set `src` from the resolved URL on the
nodes it FEEDS during the live crawl (which the one-time walk cannot reach). The export paths SHALL
inline an image separator's bytes exactly like an image element (the same collector + two-source
resolver), and export preflight SHALL report a missing separator image. The Designer ticker
inspector SHALL let the operator choose a Text or Image separator; for Image, pick from the
project's assets OR the shared library, with an adjustable size.

#### Scenario: Pick an image separator from either source

- **WHEN** the operator sets the ticker separator to Image in the inspector
- **THEN** they can pick the image from the project's assets OR the shared library, and set its size

#### Scenario: Image separator renders between items, never trailing

- **WHEN** a ticker with an image separator crawls
- **THEN** the logo renders as an `<img>` between consecutive items — vertically aligned with the
  items per the ticker's `verticalAlign` (centred by default), at the authored size — and never
  after the last item (the drain seam / a finite run's end), exactly as the text separator does
  (D-081)

#### Scenario: A string separator is unchanged (backward compatible)

- **WHEN** a ticker authored with a text separator (or none) is loaded, rendered, or played
- **THEN** it parses and behaves exactly as before — the union widening adds the image variant with
  no schema-version bump and no migration

#### Scenario: An image separator is inlined and preflighted on export

- **WHEN** a scene whose ticker uses an image separator is exported (single-file HTML / `.vcg`)
- **THEN** the separator image's bytes are inlined like an image element, and a missing separator
  image is reported by preflight (not silently dropped)
