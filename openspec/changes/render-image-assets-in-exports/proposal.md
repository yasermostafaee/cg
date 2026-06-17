# Render per-project image assets in exported output (D-062)

## Why

Exported templates don't render images at all today. The runtime emits each image element as
`<img data-cg-asset-id>` with **no `src`**; only the Designer **preview** wires `src` (from a
host-posted blob-URL map in `apps/designer/src/platform/preview.ts`). On the export paths:

- **`.vcg`** — `Exporter.#gatherBinaries` packages the asset bytes into the zip and records an
  `assetIndex`, but the served `index.html` boots `createRuntime(scene)` with no asset wiring, so the
  `<img>` never gets a `src` (documented stub).
- **single-file HTML** — `ExporterSingleFile` inlines fonts as base64 but does **not** inline image
  bytes at all (explicit scope note), so images don't render offline.

This was surfaced by the D-040 Phase-1 recon (the `add-shared-image-library` design / draft PR #128):
per-project image rendering in exports is the **foundational byte→`src` path** the shared-library
work builds on. This PR (PR-1 of the D-040 epic) makes per-project images actually render in exports.
**Shared-library work is NOT in this PR** — but the resolver is written in a source-aware-ready shape
so D-040/PR-2 adds a `'shared'` branch in one place.

## What changes

- **Runtime (shared seam)** — `createRuntime` accepts an optional `assetUrls` map
  (`assetId → url`) and, after building the scene, sets `src` on each `img[data-cg-asset-id]` whose id
  is in the map. This is the single entry point both exporters use. The Designer preview is unchanged
  (it keeps its own host-side `applyAssetUrls`; it does not pass `assetUrls` to `createRuntime`, so the
  new step is a no-op there).
- **`.vcg`** — the served `index.html` bootstrap bakes `assetUrls = { id → "assets/<kind>/<sha>.<ext>" }`
  (the packaged relative paths, from the `assetIndex`) and passes it to `createRuntime`. `#gatherBinaries`
  also recurses compositions/containers (it walked only top-level layers) so a referenced image in a
  nested comp is packaged. A `.vcg` renders per-project images with no external / `file://` access.
- **single-file HTML** — a new image-inline step (mirroring `#inlineFonts`) resolves each image
  element's bytes, base64-data-URIs them, and bakes `assetUrls = { id → "data:…" }` passed to
  `createRuntime`. The standalone HTML renders per-project images offline. (CSP already allows
  `img-src data:`.)
- **Missing-asset preflight** — extend the report to image **elements** on the HTML path (today
  fields-only): an image whose bytes don't resolve is **warned** (HTML export never blocks, per its
  convention). The `.vcg` path already **blocks** on a missing image element (`Exporter.preflight`) —
  confirmed/kept. Never a silent broken export.
- **Source-aware-ready resolver** — a single `resolveImageAsset(source, assetId)` seam (project
  `AssetStore` for PR-1) both exporters use, with the extension point clearly marked for D-040/PR-2 to
  add the shared-library-first branch minimally.

## Capabilities

### Added Capabilities

- `designer-image-export` — image elements render in exported output (`.vcg` packaged + `src` wired;
  single-file HTML base64-inlined), the runtime's `assetUrls` seam, and the missing-asset report on
  both export paths. **No existing capability owned export image rendering** (it was an unspecced
  stub), so this is captured net-new. D-040/PR-2 (`designer-shared-image-library`) will MODIFY this to
  add the shared source.

### Modified Capabilities

- None at the spec level — see above (export/runtime image rendering was never specced).

## Impact

- `@cg/template-runtime`: `RuntimeBootOptions.assetUrls` + apply-on-build in `createRuntime`.
- `apps/designer`: `Exporter.ts` (`buildIndexHtml` bakes `assetUrls`; `#gatherBinaries` recurses);
  `ExporterSingleFile.ts` (image base64 inline + bake `assetUrls` + element preflight); a new shared
  `resolveImageAsset` / scene image-walk helper.
- **Schema:** none. **Preview:** unchanged.
- Docs: PRD `D-062` + ROADMAP line (prerequisite for D-040, surfaced by its Phase-1 recon).

## Out of scope

- The shared image library / `source: 'shared'` (D-040/PR-2 — this PR only makes the resolver ready).
- Dynamic image **fields** binding new asset bytes at play time (the static image-element path only).
- Images inside repeater rows stamped at play time (the static built tree is covered; re-applying the
  map on row-stamp is a follow-up — noted as a known limitation).
