# designer-ticker-element (delta)

## MODIFIED Requirements

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
session-overridable PER TICKER in the preview (each ticker's own `repeat` /
`cycleBoundary`, addressed by `elementId` — D-102 Phase 1), the same layering
as `holdMs`/`repeat`. `pause()` SHALL freeze the crawl and
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

### Requirement: Designer authoring and live preview editing

The Designer SHALL provide a ticker tool that inserts a ticker element, and an inspector section editing `direction`, `speed`, `gap`, `separator`, the inner loop (`repeat` — a fresh ticker shows `'infinite'` by design — and `cycleBoundary`), text styling (font family/weight/size, colour incl. gradient `colorFill`, and a **Text Shadow** section with offset X/Y on one line) — and NO band background, box padding, border-radius, or stroke/path-style controls (D-056 — the ticker carries only its text; box styling belongs on a separate shape layer) — and the items (add / remove / reorder / edit text). The composition inspector and the preview's per-scope timing SHALL expose the hold-source select ONLY when the scope contains a content source, and the preview SHALL show a session-only per-TICKER repeat + cycle-seam override — one row per ticker, by name (D-102 Phase 1) — for each ticker the scope contains (no dead controls). Assigning a data key to a ticker SHALL seed a `list` field from the element's authored items and bind it via `ticker-items`; the preview field form SHALL render a `list` field as the same items editor, live-updating the crawl. The UI SHALL state that the ticker is time-driven: timeline scrubbing does not move it.

#### Scenario: Author → bind → live-edit flow

- **WHEN** the author inserts a ticker, edits its items, assigns a data key, opens the preview, and edits the list in the field form
- **THEN** the canvas shows the ticker, the field form shows the items editor seeded from the element, and each edit live-updates the crawl via `update()`

#### Scenario: Scrubbing does not move the ticker

- **WHEN** the author scrubs the timeline over a composition containing a ticker
- **THEN** keyframed elements follow the playhead but the ticker's crawl offset does not change, and the UI communicates that the ticker is time-driven

#### Scenario: The ticker inspector exposes no box styling

- **WHEN** a ticker is inspected
- **THEN** it shows text controls (font, colour incl. gradient, Text Shadow) but NO background, box padding, border-radius, or stroke/path-style controls (D-056)
