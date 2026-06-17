# Design — render per-project image assets in exports (D-062)

PR-1 of the D-040 epic. Foundational byte→`src` render/inline path; project source only, written
source-aware-ready for D-040/PR-2. Touches the runtime + both exporters.

## STEP 0 — verified

1. **Runtime emits `<img>` with no `src`; only preview wires it.** `buildImage`
   (`packages/template-runtime/src/scene-builder.ts:824`) sets `el.dataset['cgAssetId']` and returns —
   no `src`. `runtime.ts` has no asset-URL resolution. The Designer preview patches `src` in its HTML
   template (`apps/designer/src/platform/preview.ts:179` `applyAssetUrls`) from a host-posted
   `assetUrls` blob-URL map. ✅
2. **`.vcg` packages bytes but never wires `src`.** `Exporter.#gatherBinaries`
   (`apps/designer/src/platform/Exporter.ts:213`) builds `assetsMap` (`assets/<kind>/<sha><ext>` →
   bytes) + `assetIndex`; `pack` (`packages/vcg-format/src/pack.ts`) writes `template.json`,
   `index.html`, `cg.js`, `cg.css`, and the asset files. The served `buildIndexHtml`
   (`Exporter.ts:265`) boots `createRuntime(scene)` with no asset wiring → `<img>` has no `src`. The
   served runtime should resolve `src` from the packaged relative paths (`assets/<kind>/<sha><ext>`,
   served alongside `index.html`). ✅
3. **HTML inlines fonts, not images.** `ExporterSingleFile.#inlineFonts`
   (`ExporterSingleFile.ts:88`) base64-inlines fonts via `toDataUri(mime, bytes)` + `toBase64`; image
   elements are not inlined (scope note `:39`). CSP already allows `img-src data:` (`:196`). Image
   inlining mirrors the font path. ✅
4. **Missing-asset preflight.** `Exporter.preflight` (`Exporter.ts:34`) reports image **elements** with
   an unknown `assetId` as a `missing-asset` **error** (blocks), recursing comps/containers (`:62`).
   `ExporterSingleFile`'s preflight (`:102`) reports image **fields** only — **not elements** — and HTML
   export never blocks (returns issues as warnings). So the HTML path needs an image-element check. ✅

All four hold → proceeding.

## Design

### The shared seam: `createRuntime({ assetUrls })`

The `src`-wiring is a host responsibility, currently duplicated only in preview's template. Rather than
copy that DOM walk into each export bootstrap, make it a runtime option both exporters share:

- Add `assetUrls?: Readonly<Record<string, string>>` to `RuntimeBootOptions`
  (`packages/template-runtime/src/types.ts`).
- In `createRuntime`, after `root.appendChild(built.container)`, walk
  `built.container.querySelectorAll('img[data-cg-asset-id]')` and set `node.src = assetUrls[id]` when a
  non-empty url is present. Source-agnostic — the runtime just consumes a finished map.
- **Preview stays unchanged**: it does not pass `assetUrls` to `createRuntime` (it keeps its
  host-posted map + template `applyAssetUrls`), so the new step is a no-op for preview.

Covers the static built tree including composition instances (built at `createRuntime` time). **Known
limitation:** images inside repeater rows are stamped at play time (after build) and aren't re-wired —
out of PR-1 scope; noted in the proposal.

### Source-aware-ready byte resolver (the PR-2 seam)

A single helper module `apps/designer/src/platform/image-export.ts`:

- `collectImageElements(scene)` — walk the main scene AND all compositions, recursing containers,
  yielding `{ elementId, assetId }` for every image element (mirrors `Exporter.preflight`'s walk; DRYs
  the gather/inline/preflight walks).
- `interface ImageAssetSource { get(id): Promise<AssetMeta | null>; bytes(id): Promise<Uint8Array | null> }`
  — the project `AssetStore` satisfies it structurally.
- `resolveImageAsset(source, assetId): Promise<{ meta; bytes } | null>` — **THE source extension
  point.** PR-1 resolves from the project source only. A `// D-040/PR-2: try the shared library first,
then fall back to project` marker documents exactly where the `'shared'` branch goes — PR-2 passes a
  composite source (shared-first) and changes nothing else.

### `.vcg` (served over http → relative-path `src`)

- `#gatherBinaries`: recurse compositions/containers (was top-level layers only) so every referenced
  image is packaged; resolve via `resolveImageAsset`. Output unchanged in shape (`assetsMap` +
  `assetIndex`).
- `buildIndexHtml(scene, assetIndex)`: bake `const assetUrls = { [entry.id]: entry.path }` (the
  packaged relative paths) and pass it to `createRuntime(scene, { assetUrls })`. Browser fetches the
  packaged file — no inlining needed (it's http-served), no external/`file://` access.
- Preflight unchanged — already blocks on a missing image element.

### Single-file HTML (offline → base64 data-URI `src`)

- New `#inlineImages(scene)`: for each image element (via `collectImageElements`), `resolveImageAsset`
  → `toDataUri(mime, bytes)`; build `assetUrls = { [assetId]: dataUri }` and a `missing` list for
  unresolved ones. Mime from the resolved `meta` (filename ext → `mimeFor`).
- `buildSingleFileHtml`: bake the `assetUrls` literal and pass it to `CG.createRuntime(scene, {
assetUrls })`. CSP already permits `img-src data:`.
- Preflight: `produce()` pushes a `missing-asset` **warning** (HTML never blocks) for each image
  element whose bytes didn't resolve — the report the HTML path lacked.

### Missing-asset behavior (per each path's existing convention)

- `.vcg`: **blocks** (`Exporter.preflight` `missing-asset` error) — kept.
- HTML: **warns** (`ExporterSingleFile` returns issues; never throws) — added for image elements.
- Never a silent broken export on either path.

## Test plan (every export path — the central risk)

- **Runtime unit:** `createRuntime(scene-with-image, { assetUrls: { id: 'x.png' }, … })` sets the
  `<img>` `src`; absent map ⇒ no `src` (preview parity).
- **`.vcg`:** a scene with a per-project image → packed output contains the asset bytes AND the served
  `index.html` bakes the `assetUrls` map / passes it to `createRuntime` (no external ref); a nested-comp
  image is packaged (regression for the layers-only walk).
- **single-file HTML:** same scene → the HTML base64-inlines the bytes (`data:image/...;base64,`) and
  bakes them into the `assetUrls` passed to `createRuntime`; renders offline (no external ref).
- **missing-asset:** a scene referencing an absent image → `.vcg` preflight **blocks** (error); HTML
  produce reports a **warning**. Both paths report; neither silently breaks.
- **preview unchanged:** existing image-preview behavior still renders (regression guard;
  `createRuntime` with no `assetUrls` leaves `src` unset for the preview host to patch).
- **resolver unit:** `resolveImageAsset` returns project bytes+meta; `null` when absent (the PR-2 seam
  covered by shape).

## Out of scope

Shared library / `source: 'shared'` (D-040/PR-2); dynamic image-field byte binding at play; repeater-row
images stamped at play.
