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
