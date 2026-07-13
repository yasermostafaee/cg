# Design — bundling fonts in the `.vcg`

## The two consumers of a packaged font

A packaged font has to satisfy two very different readers, and the design serves
both from **one** set of bytes in the archive:

1. **The on-air path (what actually fixes the bug).** The Runtime app unpacks the
   `.vcg` in the browser and **re-renders** the scene through `ExporterSingleFile`
   with `assets: vcgImageAssetSource(manifest, files)`
   (`apps/runtime/src/renderer/features/library/templateDelivery.ts`). That
   exporter's `#inlineFonts` already walks `scene.fonts`, and for every family
   shaped `asset-<assetId>` calls `assets.bytes(assetId)` and emits a base64
   `@font-face`. `vcgImageAssetSource.bytes()` is **path- and kind-agnostic**
   (`byId.get(assetId)` → `files.get(entry.path)`), so a `fonts/…` path resolves
   exactly as an `assets/…` one does. The bridge then serves that one
   self-contained HTML string. **Nothing on the serving side changes.**
2. **A standalone/unzipped `.vcg`.** The package's own `index.html` is loaded
   directly. It gets a package-relative `@font-face` (`url('./fonts/<sha>.woff2')`),
   so the package is genuinely portable and self-contained.

The load-bearing consequence: the Exporter must write the bytes **and** an
`assetIndex` entry keyed by the same `assetId` the family encodes. Bytes without
an index entry would render a standalone package correctly but still mis-measure
on air — the exact bug we're fixing.

## Why not serve `fonts/` from the caspar-bridge

Considered and rejected. The bridge's HTTP server is a route-matched handler with
exactly one route (`^/template/([^/]+)$`) and no filesystem access; the `.vcg`
never lands on disk on the playout machine. Serving `fonts/` would mean inventing
an asset-serving subsystem in the Runtime track. Decisively, the served page's own
CSP is `font-src data:` — a relative or `http://` font URL would be **blocked by
the page's own policy**. Inlining is not merely the cheaper option, it is the only
one the current CSP permits.

## Which fonts get bundled — the embedding policy

The `FontReference.source` (`'bundled' | 'system'`) and `bundledPath` fields are
**not** the resolution mechanism — no code has ever dereferenced `bundledPath`, and
starters set it to a family label (`'Vazirmatn'`). Resolution keys off the
**family prefix**, the same convention `ExporterSingleFile` has always used:

| `scene.fonts` entry                        | Bytes available?                    | Policy                                    |
| ------------------------------------------ | ----------------------------------- | ----------------------------------------- |
| `family: 'asset-<assetId>'`                | Yes — the project AssetStore        | **Bundle** into `fonts/<sha>.woff2`       |
| `family: 'asset-<assetId>'`, bytes missing | No — asset deleted / never imported | **Skip** + keep the warning for that font |
| `source: 'system'` / any plain family      | No — a licensed/OS-installed face   | **Skip** + keep the warning for that font |

A licensed/system font is skipped rather than blocked: an export must never fail
because the author picked Arial. We ship what we legally and physically can, and
we tell the operator precisely what we could not ship.

The app's OWN faces (Vazirmatn / Exo 2 in `public/fonts/`) need no packaging: the
**Runtime app bundles them itself** and inlines its `fonts.css` at import, so a
plain `Vazirmatn` family already renders correctly on air. The broken case is
exactly the `asset-*` font — which is what every D-119 starter uses.

## Re-scoping the `vcg-ticker-fonts-not-bundled` warning

Today it fires on "the scene contains ≥1 ticker", full stop, and tells the operator
to prefer the single-file HTML export. That advice becomes false once fonts ship.

New rule: for each ticker, resolve the font family it renders with; warn **only**
if that family's bytes cannot be bundled. A ticker in Vazirmatn-as-`asset-*` →
silent. A ticker in Arial → still warned, because its crawl really will measure
fallback glyphs on a machine without Arial. The warning keeps its code (operators'
muscle memory, and it is still literally "this ticker's fonts are not bundled") but
gains a per-font message naming the offending family.

## Why the owner saw NO on-air change (and why the Persian fixture can never show one)

Owner-verified on real CasparCG: a `.vcg` that bundled its Vazirmatn and one that
withheld it crawled for the same 35s. That is **not** a packaging failure — reproduced
in Chromium against the real served HTML, and the cause is structural:

`scene-builder` appends a fallback stack behind every authored family —
`${family}, Vazirmatn, "Noto Sans Arabic", "Segoe UI", …` — and the Runtime app inlines
its OWN Vazirmatn into every served page. So a **missing bundled Vazirmatn falls back to
Vazirmatn**. Same typeface, same measured widths, same crawl duration. A Persian template
is therefore structurally incapable of demonstrating this change on air, bundled or not.

Two hypotheses were tested and REFUTED by measurement, and are recorded so nobody
re-litigates them:

- _"The served HTML keeps the package's relative `./fonts/…` URL, which the page's
  `font-src data:` CSP blocks."_ No: the served HTML inlines the face as a `data:` URI
  and contains zero relative font refs. The relative `@font-face` in the package's own
  `index.html` is by design (for an unzipped, self-served package) and is never the file
  CEF loads.
- _"`document.fonts.ready` resolves before a lazily-matched `@font-face` finishes
  loading, so the ticker caches FALLBACK widths."_ Plausible, and reproducible in a
  synthetic page — but **not** what happens here. A/B against the real served HTML: the
  ground-truth pair's durations differ by 3.36s with the existing `fonts.ready` gate and
  3.34s with a force-loading gate. Identical. The runtime builds and ATTACHES the scene
  DOM before awaiting `ready`, so the font loads are already pending and `ready` genuinely
  waits for them. No runtime change is warranted; none was made.

## The ground-truth fixture

Because Persian cannot discriminate, the owner-verification pair bundles **Exo 2 (Latin)**
under an `asset-*` family (a name no OS font can claim), at **weight 400** — at 800 the
browser faux-bolds both Exo 2 and the Vazirmatn fallback and their widths converge to
within 3px, hiding the very difference under test. Lowercase + digits, where Exo 2 runs
~18% wider than Vazirmatn. Measured on the real served HTML: **63.11s bundled vs 59.76s
control**, with plainly different letterforms.

## Format notes

- Path shape `fonts/<sha256><ext>` mirrors D-062's `assets/<kind>/<sha256><ext>`:
  content-addressed, so re-exporting is deterministic and a font shared by two
  families is stored once.
- woff2 is preferred and is what the AssetStore holds; the packer is
  format-agnostic, and `mimeFor` already maps `.woff2/.woff/.ttf/.otf`.
- `kind: 'font'` is already legal in the manifest's `AssetEntry` enum — no
  schema change.
