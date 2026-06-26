# designer-ticker-element (delta)

## ADDED Requirements

### Requirement: Image/logo ticker separator

The ticker's `separator` SHALL accept an image/logo as well as a text glyph: the schema widens
`separator` to `string | { kind: 'image', assetId, source: 'project' | 'shared', size: { w, h } }`
(still optional). This SHALL be a backward-compatible widening — every existing string separator
stays valid — so it needs NO schema-version bump and NO migration. The runtime SHALL render an image
separator as its own `<img>` node placed BETWEEN items only (never trailing the final item — the
D-081 rule holds for images too), vertically centred in the band, at the authored `size` (an
explicit `w`×`h` box, so the treadmill has a deterministic separator width with no asynchronous
image measurement; `object-fit: contain` fits the logo within the box). The image `src` SHALL
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
- **THEN** the logo renders as an `<img>` between consecutive items — vertically centred at the
  authored size — and never after the last item (the drain seam / a finite run's end), exactly as
  the text separator does (D-081)

#### Scenario: A string separator is unchanged (backward compatible)

- **WHEN** a ticker authored with a text separator (or none) is loaded, rendered, or played
- **THEN** it parses and behaves exactly as before — the union widening adds the image variant with
  no schema-version bump and no migration

#### Scenario: An image separator is inlined and preflighted on export

- **WHEN** a scene whose ticker uses an image separator is exported (single-file HTML / `.vcg`)
- **THEN** the separator image's bytes are inlined like an image element, and a missing separator
  image is reported by preflight (not silently dropped)
