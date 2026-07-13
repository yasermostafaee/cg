# Bundle font files in the `.vcg` export

## Why

A `.vcg` is meant to run anywhere, but today it ships **zero font bytes**: the
Exporter never passes anything to the `@cg/vcg-format` `pack()` `fonts` seam. Only
the single-file HTML export inlines fonts.

That is not merely a portability wart — it is an **on-air correctness bug**. A
content-driven ticker measures its text width to decide when the crawl completes
one pass, and that pass duration is what ends the hold. On a playout machine
without the face, the crawl measures **fallback glyphs** → wrong width → wrong
content-driven hold duration on air. Same class of "a playout-critical input is
lost in export" gap as B-032's `holdMs`.

The live `vcg-ticker-fonts-not-bundled` preflight warning says exactly this, and
pushes operators to the single-file HTML export to get correct crawl timing.
Bundling the fonts removes the footgun and the warning's reason to exist.

## What Changes

- The Designer's `.vcg` Exporter resolves each `scene.fonts` entry's bytes and
  supplies them to the existing `pack()` `fonts` map, written into the package's
  `fonts/` directory, plus an `assetIndex` entry (`kind: 'font'`) so the bytes are
  addressable by `assetId`.
- The package's own `index.html` carries a package-relative `@font-face` per
  bundled font, so an unzipped-and-served `.vcg` renders with the correct face and
  makes **no external or `file://` request** (it must run under CasparCG's CEF).
- A font that genuinely cannot be bundled (a `system` / licensed face with no
  shippable bytes) is **skipped**, and the ticker font warning still fires **for
  that font**. Policy recorded in `design.md`.
- The `vcg-ticker-fonts-not-bundled` warning stops firing merely because a scene
  contains a ticker; it now fires only when a ticker's font cannot be bundled.
- Single-file HTML export behavior is **unchanged** (it already inlines fonts).

## Non-goals / explicitly out of scope

- **No Runtime-track or caspar-bridge change.** The bridge serves one
  self-contained HTML string over a single route; the Runtime app already unpacks a
  `.vcg` and re-renders it through `ExporterSingleFile`, whose `#inlineFonts`
  already base64-inlines every `asset-*` family from the supplied asset source —
  and on that path the source **is the package**. Supplying the bytes at export is
  therefore sufficient; nothing on the serving side learns about `fonts/`.
- No `FontReference` schema change. Byte resolution keys off the existing
  `family: 'asset-<assetId>'` convention (`bundledPath` is, and stays, unread).

## Impact

- Affected specs: **`designer-font-export`** (new capability).
- Affected code: `apps/designer/src/platform/Exporter.ts` (font byte gathering,
  `index.html` `@font-face` bake, re-scoped preflight warning). No changes to
  `@cg/vcg-format`, `@cg/single-file-export`, the Runtime app, or the bridge.
- Package size: fonts are woff2 (~16–22 KB per face); only faces a scene actually
  references are shipped.
