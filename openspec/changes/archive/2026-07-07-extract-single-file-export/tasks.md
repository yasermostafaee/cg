# Tasks — Extract single-file exporter (B-038 Phase 1)

Pure refactor: same behavior, code relocated, both apps green. Scope guard: NO
bridge HTTP server, NO `templates.import` change, NO `CG ADD`/command-builder
change, NO `amcp-mock` change (Phases 2–4).

## 1. New `@cg/single-file-export` package

- [x] Scaffold `packages/single-file-export` (browser-tier: ES2023 + DOM lib,
      `broadcast` eslint tier; deps `@cg/shared-schema`, `@cg/shared-ipc`,
      `@cg/vcg-format`; devDep `esbuild`, `@cg/template-runtime`).
- [x] Move `ExporterSingleFile` (relax `assets: AssetStore` → `ImageAssetSource`)
      and `image-export` into the package; export them + `SingleFileExportOptions`
      / `SingleFileResult` + `cgJs` / `cgJsIife` / `cgCss`.
- [x] Move `bundle-runtime.mjs` into the package, retargeted to emit a generated
      TS module (`cgJs` / `cgJsIife` as consts) — bundler-agnostic, no `?raw`.
      Regenerated via `pre{build,typecheck,test}` hooks; atomic write; gitignored.
- [x] Move the single-file exporter unit test into the package.

## 2. `@cg/designer` consumes the package (single source)

- [x] `createDesignerBridge` / `.vcg` `Exporter` / preview import the exporter /
      `image-export` / `cgJs` / `cgJsIife` / `cgCss` from `@cg/single-file-export`.
- [x] Delete the Designer's `ExporterSingleFile.ts`, `image-export.ts`,
      `cg-runtime.ts`, `scripts/bundle-runtime.mjs`, `src/generated/` + the
      `prebuild` step; add the package dependency.
- [x] Update the Designer's exporter integration tests' imports to the package.
- [x] Move the `apps/designer/src/generated/cg-runtime*.js` ignore entries to the
      package's generated path.

## 3. `@cg/runtime` can import it

- [x] Add `@cg/single-file-export` as a dependency; a test imports it and produces
      HTML for a fixture scene (proves browser-tier importability + structure).

## 4. Verification

- [x] Full UNCACHED gate (`turbo --force`) — format:check + typecheck + lint +
      test + build for `@cg/single-file-export`, `@cg/designer`, `@cg/runtime`.
- [x] Full `pnpm test:e2e` (turbo builds first) — the Designer single-file export
      E2E (`exportHtml()` assertions) MUST pass.
- [x] Clean-rebuild: delete the generated bundle module, rebuild, confirm it's
      recreated and inlined (the move didn't strand a checked-in artifact).
- [x] `openspec validate extract-single-file-export --strict`.

## 5. Close-out

- [x] Conventional commit + push; open a PR (Designer-still-works evidence). B-038
      stays `[~]`. No archive.
