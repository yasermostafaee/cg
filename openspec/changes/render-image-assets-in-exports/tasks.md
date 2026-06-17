# Tasks — render per-project image assets in exports (D-062)

## 1. Runtime seam (`@cg/template-runtime`)

- [x] Add `assetUrls?: Readonly<Record<string, string>>` to `RuntimeBootOptions` (`types.ts`).
- [x] In `createRuntime`, after building the scene, set `src` on each `img[data-cg-asset-id]` whose id
      is in `assetUrls` (small helper). No-op when absent (preview parity).

## 2. Source-aware-ready resolver (`apps/designer/src/platform/image-export.ts`, new)

- [x] `collectImageElements(scene)` — walk main scene + all compositions, recursing containers →
      `{ elementId, assetId }[]`.
- [x] `ImageAssetSource` interface (`get` + `bytes`); `resolveImageAsset(source, assetId)` →
      `{ meta, bytes } | null`, with the D-040/PR-2 shared-first extension point clearly marked.

## 3. `.vcg` (`Exporter.ts`)

- [x] `#gatherBinaries`: recurse compositions/containers (was top-level layers only); resolve via
      `resolveImageAsset`.
- [x] `buildIndexHtml(scene, assetIndex)`: bake `assetUrls = { id → relative path }` and pass to
      `createRuntime(scene, { assetUrls })`.
- [x] Confirm `Exporter.preflight` still blocks on a missing image element (no change expected).

## 4. Single-file HTML (`ExporterSingleFile.ts`)

- [x] `#inlineImages(scene)`: resolve each image element → base64 data-URI; return the `assetUrls` map +
      the unresolved list. Mirror `#inlineFonts`.
- [x] `buildSingleFileHtml`: bake the `assetUrls` literal; pass to `CG.createRuntime(scene, { assetUrls })`.
- [x] `produce()`: push a `missing-asset` **warning** for each image element whose bytes didn't resolve
      (HTML never blocks). Update the stale "images not inlined" scope note.

## 5. Tests (cover every export path — the central risk)

- [x] Runtime unit: `assetUrls` sets `<img>` src; absent ⇒ unset (preview parity).
- [x] `.vcg`: image packaged + served `index.html` wires `assetUrls`/`createRuntime`; nested-comp image
      packaged.
- [x] HTML: image base64-inlined + baked into `createRuntime`; renders offline (no external ref).
- [x] Missing-asset: `.vcg` blocks (error), HTML warns — both report.
- [x] Preview unchanged (regression).
- [x] `resolveImageAsset` unit (project resolve + missing).

## 6. Docs / PRD / gate

- [x] PRD `D-062` in `docs/prd/designer.md` + a ROADMAP line (prerequisite for D-040, surfaced by its
      Phase-1 recon). Mark `[~]`.
- [x] Engine doc-sync if a runtime/export contract changed (`docs/engines/overview.md` +
      `packages/template-runtime/README.md`).
- [x] Full green gate (uncached) for every touched workspace; the OpenSpec change validates
      `--strict`.
