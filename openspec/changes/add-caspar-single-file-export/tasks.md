## 1. Runtime build (IIFE)

- [x] 1.1 Add an IIFE/UMD bundle target to `packages/template-runtime` exposing
      `window.CG = { createRuntime, installCasparGlobals }` (same source as the
      ESM bundle); keep the ESM bundle for preview/`.vcg`
- [x] 1.2 Expose the IIFE bundle string via `apps/designer/src/platform/cg-runtime.js`

## 2. GDD generator

- [x] 2.1 `packages/vcg-format/src/gdd.ts` — `buildGddSchema(scene)` mapping each
      field type → `type`/`gddType` + `minLength`/`maxLength`/`pattern`/`default`/
      `minimum`/`maximum`; `required[]`; `gddPlayoutOptions.client`
      (`dataformat:"json"`, `steps`, `duration` = active-range ms or `null`)
- [x] 2.2 Define a small `SchemaExporter` interface and implement `GddExporter`
      behind it (so an `OGrafExporter` can be added later); export from package index
- [x] 2.3 Preflight warning when an `image` field is exported (resource handling
      not portable to third-party GDD clients)

## 3. Single-file exporter

- [x] 3.1 `apps/designer/src/platform/ExporterSingleFile.ts` — build one HTML:
      inline scene JSON as a JS literal (no `fetch`), inline `cg.css` + `@font-face`,
      base64 images, base64 fonts (only used weights), inline IIFE runtime + a
      classic-script bootstrap (`createRuntime` → `installCasparGlobals` →
      `await ready`, no auto-play), embedded GDD `<script>` in `<head>`
- [x] 3.2 Transparent `html,body`; stage = composition resolution; permissive CSP
      for the inlined file (comment why it differs from `.vcg`); CEF-compat CSS note
- [x] 3.3 Bridge: `export.runSingleFileHtml(scene)`; "Download HTML" action in
      `features/shell/TopToolbar.tsx`

## 4. Tests + gate

- [x] 4.1 `vcg-format` GDD test — each field type maps correctly; constraints and
      `required[]` present; `duration` math; output parses as a JSON object
- [x] 4.2 `apps/designer` export test — produced HTML has no external references
      and embeds a parseable GDD block
- [~] 4.3 Headless runtime smoke test — `window.update({f0:'x'})` then
  `window.play()` mutates the DOM text (order-independent). Covered by the
  `@cg/template-runtime` runtime/caspar-globals tests (the exported file runs
  that exact source via the IIFE bundle).
- [x] 4.4 Green gate: typecheck + lint + test + build for `@cg/template-runtime`,
      `@cg/vcg-format`, `@cg/designer`
- [x] 4.5 `pnpm openspec validate add-caspar-single-file-export --strict`
- [ ] 4.6 Manual: drop the file into CasparCG `templates/` and run the
      `CG ADD/PLAY/UPDATE/STOP` sequence from D-019 acceptance _(operator step —
      needs a CasparCG install; not runnable in CI)_
