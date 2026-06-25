# designer-controls (delta)

## ADDED Requirements

### Requirement: Shared Icon primitive

The Designer SHALL provide a single shared `Icon` component in
`apps/designer/src/renderer/ui/` (alongside `Button` / `Control`), backed by
`lucide-react`, as the ONE way to render a UI icon in the renderer. An `Icon`
SHALL render a vector `<svg>` that inherits the current text colour
(`currentColor`), SHALL be decorative by default (`aria-hidden`, so the
interactive parent keeps its own `aria-label` / `title`), and SHALL take a single
`size` prop. An `Icon` SHALL NOT mirror by default; a call site MAY opt a
directional icon into RTL mirroring via a `flipRtl` prop, which mirrors the icon
horizontally only when it is inside an `[dir="rtl"]` subtree.

#### Scenario: Icon renders a vector svg via lucide

- **WHEN** an `Icon` is rendered
- **THEN** it draws a `lucide-react` vector `<svg>` (not a Unicode glyph character)

#### Scenario: Icon is monochrome via currentColor and decorative by default

- **WHEN** an `Icon` renders inside a control with a given text colour
- **THEN** the icon takes that colour through `currentColor` and is `aria-hidden`,
  adding no second accessible name, and is sized by its single `size` prop

#### Scenario: Opt-in RTL mirroring

- **WHEN** an `Icon` with `flipRtl` is rendered inside an `[dir="rtl"]` subtree
- **THEN** it is mirrored horizontally, WHILE an `Icon` without `flipRtl` is NOT
  mirrored in the same subtree

### Requirement: Designer UI icons are vector icons, not glyphs

Every migrated Designer control SHALL render its icon through the shared `Icon`
component as a `lucide-react` vector icon — replacing both Unicode-glyph icons and
local ad-hoc inline-`<svg>` icon helpers — and no glyph-string icon SHALL remain
in the migrated files. There SHALL be exactly one icon mechanism: the transport bar's
local inline-SVG helper (`ic()` in `TransportBar.tsx`) and the asset panels' local
`GridIcon` / `ListIcon` SVG functions are removed and their icons go through
`Icon`. The Designer's meaning SHALL be preserved under RTL (no icon's meaning
breaks).

#### Scenario: A migrated control renders a vector icon

- **WHEN** a migrated toolbar / inspector / timeline / shell control is rendered
- **THEN** it contains a vector `<svg>` icon and no longer contains its old glyph
  character

#### Scenario: Transport uses the single Icon path

- **WHEN** the canvas transport Play / Pause (and the other transport controls)
  render
- **THEN** they render through the shared `Icon` / lucide path and the local
  `ic()` SVG helper no longer exists

#### Scenario: Asset grid/list toggle uses the shared Icon

- **WHEN** the Project Assets or Shared Library panel's grid/list view toggle
  renders
- **THEN** it shows a `lucide-react` `LayoutGrid` / `List` vector icon via the
  shared `Icon`, and the local `GridIcon` / `ListIcon` SVG functions no longer
  exist

#### Scenario: Border-radius toggle uses the shared Icon

- **WHEN** the border-radius single / per-corner toggle renders
- **THEN** it shows the shared `Icon` — `Square` (uniform) or `Maximize`
  (per-corner) at `size={12}` — and the old vanilla-extract `iconUniform` /
  `iconPerCorner` styles are removed

#### Scenario: Timeline layer-type icons match the toolbar

- **WHEN** a timeline layer row renders its per-kind type icon
- **THEN** it uses the shared `Icon` and matches the canvas-toolbar tool icon for
  the shared kinds (text / shape / ellipse / image / ticker / clock / sequence /
  repeater), tinted with the layer's timeline colour via `currentColor`

#### Scenario: The More text options gear uses the shared Icon

- **WHEN** the "More text options" trigger renders
- **THEN** it shows the shared `Icon` lucide `Settings2` (no `⚙` glyph), keeping
  its `aria-label` / `title`

#### Scenario: Zoom controls use the shared Icon

- **WHEN** the timeline zoom controls (status bar) or the canvas zoom controls
  (canvas header) render
- **THEN** the zoom-out control shows `ZoomOut` and the zoom-in control shows
  `ZoomIn` — the SAME pair in both areas — via the shared `Icon` (no `−` / `+`
  glyph text), keeping their existing aria-label / title / disabled behaviour

#### Scenario: RTL meaning is preserved

- **WHEN** the Designer runs in RTL
- **THEN** no icon's meaning breaks (directional icons that opted into `flipRtl`
  mirror; the rest keep their orientation)

### Requirement: Text labels are not icons and are unchanged

Characters that are TEXT rather than icons SHALL be left unchanged by the icon
migration: the keyboard-shortcut key labels (`⌘` / `Ctrl`), the mixed-value `—`
placeholder, the transform axis letters (`X` / `Y` / `W` / `H`), and the
`New project` modal's `×` / `≈` math symbols.

#### Scenario: Out-of-scope text is untouched

- **WHEN** the keyboard-shortcut key labels, the mixed-value `—` placeholder, the
  transform axis letters, or the `New project` `×` / `≈` symbols render
- **THEN** they render unchanged as text (no `Icon` substitution)

### Requirement: lucide-react is a per-icon, attributed dependency

`lucide-react` SHALL be added to `apps/designer` and imported per-icon (named
imports, tree-shaken) rather than as a namespace import, and a third-party
attribution entry for lucide (ISC) SHALL be recorded in
`THIRD_PARTY_LICENSES.md`.

#### Scenario: Per-icon import and attribution

- **WHEN** the Designer imports a lucide icon
- **THEN** it uses a per-icon named import (so only used icons are bundled), AND
  `THIRD_PARTY_LICENSES.md` lists lucide-react with its ISC license

### Requirement: Canvas tool palette order

The canvas tool palette SHALL list the drawing tools first — cursor, hand, text,
rectangle, ellipse, image — then the dynamic / data-driven elements — ticker,
sequence, clock, repeater. The ticker tool SHALL use a horizontal double-arrow
icon and the sequence tool a vertical double-arrow icon; both are symmetric and
SHALL NOT be RTL-mirrored.

#### Scenario: Tools are ordered drawing-first, then dynamic

- **WHEN** the canvas toolbar renders
- **THEN** its tools appear in order: cursor, hand, text, rectangle, ellipse,
  image, ticker, sequence, clock, repeater

#### Scenario: Ticker and sequence use symmetric double-arrow icons

- **WHEN** the ticker and sequence tools render
- **THEN** the ticker shows a horizontal double-arrow icon and the sequence a
  vertical double-arrow icon, neither mirrored under RTL

### Requirement: Canvas zoom controls

The canvas header's zoom group SHALL read left→right as: the live percent readout,
then Fit, then a reset control, then zoom-in, then zoom-out. The Fit / zoom-in /
zoom-out controls SHALL render `lucide-react` icons (`ScanSearch` / `ZoomIn` /
`ZoomOut`) via the shared `Icon`, while the reset control SHALL show the plain TEXT
`100%` (not an icon). Each control keeps its existing `onClick` / `aria-label` /
`title`. Both the canvas viewport zoom and the status-bar TIMELINE zoom use the
SAME `ZoomIn` / `ZoomOut` pair.

#### Scenario: Canvas zoom group order and icons

- **WHEN** the canvas header renders
- **THEN** the zoom group is ordered percent-readout → Fit → reset → zoom-in →
  zoom-out, with Fit / zoom-in / zoom-out as `ScanSearch` / `ZoomIn` / `ZoomOut`
  vector icons

#### Scenario: Reset zoom is the text 100%

- **WHEN** the canvas zoom reset control renders
- **THEN** it shows the text `100%` (not a glyph or icon), keeping its
  `aria-label` "Reset zoom to 100%"

### Requirement: Panel add buttons use one shared Plus icon

Each of the three panel "add" buttons SHALL render the `lucide-react` `Plus` icon
via the shared `Icon` at ONE consistent size, replacing the per-panel `+` glyph
text — these are the Project Assets "Add asset", Compositions "New composition",
and Shared Library "Add library image" controls — and their `iconButton` boxes
SHALL match (no divergent `fontSize`). Each control keeps its existing
`aria-label` / `title` / handlers.

#### Scenario: Add buttons render one consistent Plus icon

- **WHEN** any of the three panel add buttons renders
- **THEN** it shows the shared `Icon` `Plus` at the same size as the others, and
  the asset / compositions `iconButton` boxes are identical

### Requirement: The shared Select chevron is a real lucide icon

The shared `Select` dropdown's down-chevron SHALL be a REAL lucide `ChevronDown`
rendered through the shared `Icon`, overlaid (absolutely positioned,
`pointer-events: none`) at the right edge inside the `Select` wrapper — NOT a
`background-image` data-URI (a per-site `background` shorthand override kept wiping
the data-URI). It SHALL appear on every dropdown, be immune to per-site background
overrides, and let clicks fall through to the `<select>`.

#### Scenario: Dropdown shows a real lucide chevron element

- **WHEN** a shared `Select` renders
- **THEN** a lucide `ChevronDown` `<svg>` element is overlaid at its right edge
  (not a CSS background), the value text does not run under it, and clicking the
  control still opens the list
