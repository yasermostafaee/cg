# designer-ticker-element

## MODIFIED Requirements

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
