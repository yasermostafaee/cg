# runtime-caspar-bridge (B-038 Phase 2 — deliver + retain template HTML)

## ADDED Requirements

### Requirement: Imported templates deliver their rendered HTML to the bridge

The `templates.import` channel SHALL carry the template's rendered **self-contained
HTML** (a string) alongside its `TemplateInfo`. At import the browser SHALL produce
that HTML from the unpacked `.vcg` via the shared single-file export (operator
`asset-*` fonts and images inlined as base64 data URIs, so the page references no
external resources) and deliver `{ template, html }` over the channel. The payload
SHALL be validated at the channel boundary. This is a Runtime-only channel; the
Designer does not consume it.

The bundled app fonts (Vazirmatn / Exo 2) are **not** inlined in this phase — the
Runtime ships no bundled faces — so a template relying on them renders with a
fallback face until Phase 3 wires bundled-font inlining. The produced HTML
nonetheless stays self-contained (no broken external font references).

#### Scenario: Import produces and delivers the standalone HTML

- **WHEN** the operator imports a verified `.vcg` **THEN** the browser produces the
  self-contained single-file HTML (runtime + scene inlined; no external `<link>` or
  `https:`/`/fonts/` references) and sends it over `templates.import` together with
  the `TemplateInfo`

#### Scenario: Image assets are inlined from the package

- **WHEN** the imported `.vcg` contains an image element whose bytes are in the
  package **THEN** the produced HTML inlines that image as a base64 `data:` URI
  (resolved from the `.vcg`'s unpacked file map), so the delivered page carries the
  image with no external fetch

#### Scenario: A bad package delivers nothing

- **WHEN** the uploaded file fails verification, cannot be unpacked, or the export
  fails **THEN** a clear error is shown, `templates.import` is not called, and
  nothing is registered (the R-001 invariant)

### Requirement: The bridge retains delivered template HTML keyed by id

The bridge's in-memory template registry SHALL store the delivered HTML keyed by
`templateId` alongside the `TemplateInfo` it already holds. Re-importing the same
id SHALL replace the stored HTML (and info). The registry SHALL expose the stored
HTML by id so a later phase can serve it over HTTP (`GET /template/<id>`) and
resolve the `CG ADD` URL to it. The registry holds the HTML only — it does **not**
serve it in this phase. The store is in-memory (empty on bridge restart); the
browser retains the produced HTML and re-delivery on reconnect is a later phase.

#### Scenario: Import retains the HTML by template id

- **WHEN** a `templates.import` for id `X` arrives over the WebSocket **THEN** the
  bridge stores the HTML so the registry returns exactly that HTML for id `X`, and
  `templateGet` / `templateList` still surface its `TemplateInfo`

#### Scenario: Re-import replaces the stored HTML

- **WHEN** a second `templates.import` for the same id `X` arrives with different
  HTML **THEN** the registry returns the new HTML for id `X` (the prior HTML is
  replaced, not duplicated)

#### Scenario: Unknown id has no stored HTML

- **WHEN** the registry is queried for the HTML of an id that was never imported
  **THEN** it returns nothing (null), with no error
