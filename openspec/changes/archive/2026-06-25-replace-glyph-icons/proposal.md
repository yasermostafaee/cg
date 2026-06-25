# Icon pack: replace Unicode-glyph icons with a shared vector Icon (D-092)

## Why

Tool / inspector / timeline / shell controls across the Designer draw their icons
as **Unicode glyphs** (e.g. `↖ ⇇ ◷ ⇉ ▤ ▭ ○ ▦` in the toolbars; `⫷ ☰ ⫸ ⤒ ⇳ ⤓` in
alignment; `↔ ↕ ↻ ◑` in transform; `▾ ▸ ▶` chevrons; `✕` close; `✓` menu check;
`▶ ⏸ ■ ⏭ ↺` preview transport; `⚠ ℹ` callouts). Glyphs render inconsistently
(size / weight vary with the OS glyph font), depend on the platform font being
present, and look unprofessional. There is no shared icon mechanism, so each new
button reinvents one. A real icon library behind one wrapper fixes consistency and
lets the upcoming timeline / layers items (D-075 / D-078 / D-080 / D-084) reuse
named icons instead of drawing SVG each time.

## What Changes

- A single shared **`Icon`** component lands in `apps/designer/src/renderer/ui/`,
  backed by **`lucide-react`** (imported per-icon, so the bundle only carries the
  icons used). It centralizes a single `size` prop, `currentColor` inheritance,
  `aria-hidden` (decorative) by default, and an **opt-in `flipRtl`** for the few
  directional icons that must mirror under RTL.
- Every ad-hoc Unicode-glyph icon in the Designer UI is replaced with `<Icon>`
  across the migration inventory (canvas / tools / inspector / timeline / shell /
  fields / callout). The transport bar's local `ic()` inline-SVG helper is removed
  so there is exactly **one** icon mechanism.
- Post-review amendments folded in: the ticker / sequence tool icons use symmetric
  double-arrows (`MoveHorizontal` / `ArrowDownUp`); the canvas tool palette is
  reordered (drawing tools first — cursor, hand, text, rectangle, ellipse, image —
  then the dynamic elements ticker, sequence, clock, repeater); the asset
  grid/list toggle (the local `GridIcon` / `ListIcon` SVG functions) and both
  zoom controls (timeline `StatusBar` + canvas `CanvasArea`) migrate to `Icon`
  (`LayoutGrid` / `List`; the same `ZoomIn` / `ZoomOut` pair in both zoom areas;
  canvas Fit → `ScanSearch`), and the canvas zoom reset is relabelled from the
  `1×` glyph to the plain text `100%` with the group reordered to
  readout → Fit → reset → in → out. The three panel `+` add buttons (Project
  Assets / Compositions / Shared Library) become one shared `Plus` icon (with the
  two `iconButton` CSS boxes aligned), and the `100%` reset gets a dedicated
  auto-width `zoomResetButton` style so its text doesn't overflow the square
  icon-button box. The border-radius single/per-corner toggle moves off its
  vanilla-extract CSS-drawn icon to the shared `Icon` (`Square` / `Maximize`),
  and the now-dead radius-icon styles are removed.
- Out of scope (these are TEXT, not icons, and stay unchanged): the
  keyboard-shortcut key labels (`⌘` / `Ctrl`), the mixed-value `—` placeholder
  (`controls.tsx` / `transform-fields.tsx`), the transform axis letters
  (`X` / `Y` / `W` / `H`), and the `New project` modal's `×` / `≈` math symbols.
- `lucide-react` (ISC) is added to `THIRD_PARTY_LICENSES.md`.

## Impact

- Affected specs: **designer-controls** (ADDED — the shared `Icon` primitive and
  the glyph→vector migration, alongside the Button / Control recipe).
- Affected code: `@cg/designer` renderer only — the new `ui/Icon.tsx` (+
  `ui/Icon.css.ts` for the RTL-flip class) and the migration inventory files. New
  dependency `lucide-react` on `apps/designer`.
- **No** schema / `@cg/template-runtime` / exporter / `.vcg` / runtime change —
  this is presentational only. `@cg/ui` stays tokens-only; `Icon` is app-local.
