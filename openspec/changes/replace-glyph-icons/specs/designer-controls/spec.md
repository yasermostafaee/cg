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

Every Designer control that previously rendered a Unicode-glyph icon SHALL render
a `lucide-react` vector icon through the shared `Icon` component, and no
glyph-string icon SHALL remain in the migrated files. There SHALL be exactly one
icon mechanism: the transport bar's local inline-SVG helper (`ic()` in
`TransportBar.tsx`) is removed and its icons go through `Icon`. The Designer's
meaning SHALL be preserved under RTL (no icon's meaning breaks).

#### Scenario: A migrated control renders a vector icon

- **WHEN** a migrated toolbar / inspector / timeline / shell control is rendered
- **THEN** it contains a vector `<svg>` icon and no longer contains its old glyph
  character

#### Scenario: Transport uses the single Icon path

- **WHEN** the canvas transport Play / Pause (and the other transport controls)
  render
- **THEN** they render through the shared `Icon` / lucide path and the local
  `ic()` SVG helper no longer exists

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
