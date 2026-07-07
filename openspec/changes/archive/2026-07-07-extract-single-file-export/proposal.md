# Extract the single-file HTML exporter into a shared package (B-038 Phase 1)

## Why

B-038's design ([fix-live-template-render](../archive)) needs the `.vcg` →
standalone-HTML export — today Designer-only (`apps/designer/src/platform/
ExporterSingleFile.ts`) — to be callable by the **Runtime** browser at import time
(Phase 2). Cross-app imports are forbidden, so the export path must become a
**shared browser package**.

**Phase 1 is the EXTRACTION ONLY** — create `@cg/single-file-export`, make BOTH
apps consume it, with **zero behavior change**. No bridge HTTP server, no
`templates.import` change, no `CG ADD` change, no `amcp-mock` change (Phases 2–4).

## What Changes

- **New `@cg/single-file-export`** (browser-tier): `ExporterSingleFile`
  (`produce(scene) → { html, issues }`) + the shared `image-export` resolution +
  the runtime bundle (`cgJs` / `cgJsIife` / `cgCss`). The `bundle-runtime.mjs`
  generate script moves into the package and emits the IIFE/ESM bundle as a
  generated TS module (consumable as built `dist` by any bundler — no Vite `?raw`
  coupling). **Exactly one exporter and one bundle, consumed by both apps.**
- **`@cg/designer` becomes a consumer** (single source — no second copy): its
  export feature, `.vcg` `Exporter`, and preview import the exporter / bundle /
  image-export from the package; the Designer's local copies + `prebuild` bundle
  step are removed. Export output stays **byte-identical** (same inlined fonts /
  images as base64, same IIFE, same scene literal).
- **`@cg/runtime` can import it** (browser-tier; proven by a test that produces
  HTML for a fixture scene) — it does not yet _use_ it in the app (Phase 2).
- The exporter's only Designer-specific coupling (`assets: AssetStore`) is relaxed
  to the structural `ImageAssetSource` interface (the AssetStore satisfies it) — no
  behavior change.

## Capabilities

- `runtime-caspar-bridge` (ADDED requirement): the single-file exporter is a
  shared, browser-importable package consumed by both apps — the architectural
  precondition for the bridge to obtain render HTML (B-038 Phase 2+).

## Impact

- New `packages/single-file-export`; `@cg/designer` re-points imports + drops its
  local exporter/bundle; `@cg/runtime` gains the dependency + an import test. No
  runtime/bridge/wire behavior changes. B-038 stays `[~]`.
- Gate: full uncached green for `@cg/single-file-export` + `@cg/designer` +
  `@cg/runtime`; full `pnpm test:e2e` (the D-019 export E2E proves byte-identical);
  a clean-rebuild check that the bundle regenerates.
