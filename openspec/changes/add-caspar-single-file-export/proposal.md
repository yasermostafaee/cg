## Why

There is no output you can drop straight into CasparCG. The existing `.vcg`
exporter already emits a CasparCG-shaped `index.html` + `cg.js` + `cg.css`, but
that HTML uses ES-module `import` + `fetch('./template.json')`, which Chromium
blocks when the file is loaded over `file://` (the way a `templates/` file
loads). There is also no GDD schema, so standard CasparCG clients can't
auto-build a data-entry form. We need a single, self-contained, `file://`-safe
HTML with an embedded GDD schema, reusing the same runtime as the preview so
preview behavior equals on-air behavior.

## What Changes

- **New single-file exporter** (`ExporterSingleFile.ts`) producing one `.html`
  with everything inlined: the scene as a JS object literal (no `fetch`), CSS
  (`cg.css` + `@font-face`), images as base64 data URIs, fonts as base64, and the
  runtime as a **classic IIFE script** (no ES modules, the reason it is
  `file://`-safe). A **"Download HTML"** action sits next to the existing `.vcg`
  export. The existing `.vcg` exporter is unchanged (it targets http serving by
  the project's own Runtime).
- **IIFE runtime build:** add a second build target of `@cg/template-runtime`
  (e.g. `cg.iife.js` exposing `window.CG = { createRuntime, installCasparGlobals }`)
  fed to the exporter the same way `cgJs` is today (`platform/cg-runtime.js`).
  Same TypeScript source as the preview and `.vcg` — only the bundle format
  differs, so render/runtime code is not duplicated.
- **GDD generator** (`packages/vcg-format/src/gdd.ts`, `buildGddSchema(scene)`):
  emits a JSON-schema subset embedded in `<head>` as
  `<script name="graphics-data-definition" type="application/json+gdd">`. One
  `properties` entry per dynamic field keyed by field id; `text`→`string` with
  `gddType` `single-line`/`multi-line`; `number`→`number`; `color`→`string`
  `gddType:"color-rrggbb"`; `boolean`→`boolean`; `select`→`string` with `enum`;
  `image`→`string` (flagged in preflight as not fully portable to third-party
  clients). Includes `minLength`/`maxLength`/`pattern`/`default`/`minimum`/
  `maximum` when set; `required:true` fields go to the top-level `required` array;
  `gddPlayoutOptions.client.{duration,steps,dataformat:"json"}` where `duration`
  = the active-range length in ms (or `null` for manual out) and `steps` = 1. The
  generator sits behind a small `SchemaExporter` interface so an OGraf exporter
  can be added later (OGraf is **not** built now).
- **CasparCG runtime guarantees** (already met by the shared runtime, asserted by
  the export): transparent `html,body`; stage sized to the composition
  resolution (default 1920×1080); no network at runtime; globals
  `play/update/stop/next/remove` installed; no auto-play. A permissive CSP for
  the inlined file (inline script/style, `font-src data:`), commented as
  differing from the strict `.vcg` CSP. CSS kept within common CasparCG CEF
  builds (63 = 2.2, 71 = 2.3.x, 117 = 2.4.x), commented.

## Capabilities

### New Capabilities

- `caspar-template-export`: export a composition as one self-contained,
  `file://`-safe CasparCG HTML template with an embedded GDD schema, sharing the
  runtime used by the preview.

### Modified Capabilities

<!-- None. The .vcg exporter is untouched. -->

## Impact

- **Runtime build:** `packages/template-runtime` — add an IIFE/UMD bundle target
  alongside the ESM bundle.
- **Schema/export:** `packages/vcg-format/src/gdd.ts` (`buildGddSchema` +
  `SchemaExporter` interface).
- **Designer:** new `apps/designer/src/platform/ExporterSingleFile.ts`;
  `platform/cg-runtime.js` (expose the IIFE bundle string); `createDesignerBridge.ts`
  (wire it); "Download HTML" in `features/shell/TopToolbar.tsx`; a bridge method
  `export.runSingleFileHtml(scene)`.
- **Unchanged:** the `.vcg` `Exporter.ts`, `@cg/vcg-format` `pack()`, preview.
- **Tests:** `vcg-format` GDD generator (each field type → correct
  `type`/`gddType`/constraints; required array; duration math); a designer export
  test that the produced HTML has no external refs and parses the embedded GDD as
  valid JSON; a headless runtime smoke test (`update` then `play` mutates DOM).
- **Dependencies:** none new. **Depends on D-018** (dynamic fields + the `play()`
  merge fix).
