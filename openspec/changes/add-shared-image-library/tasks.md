# Tasks — shared image library + logo element (D-040)

## 0. Phase 1 — recon + design (THIS change)

- [x] Recon the per-project `AssetStore` surface, the three byte paths, and the inert tool (design.md).
- [x] Decide schema (widen image with `source`), the two-source resolver, missing-asset behavior,
      shared store API, UI, test plan, out-of-scope (design.md).
- [x] `openspec validate add-shared-image-library --strict`.
- [ ] **OWNER REVIEW GATE** — sign off on: (a) the `source`-widening schema choice; (b) the two-source
      resolver plan; (c) **the coupled scope** to complete per-project image render/inline on `.vcg` +
      HTML (proposal "Scope finding"). **Do not start phase 2 until confirmed.**

## 1. Shared storage namespace (mirror `AssetStore`)

- [ ] `SharedImageStore` (`apps/designer/src/platform/`): `import`/`list`/`get`/`bytes`/`remove` +
      emitters, project-independent paths `shared/images/<kind>/<sha>.<ext>` + `shared/images/index.json`,
      reusing `sha256Hex` dedupe + `AssetMeta`. No `setActiveProject`.
- [ ] Parallel `@cg/shared-ipc` channels (`sharedImages.import/list/remove/imported`) mirroring `assets.*`.
- [ ] Bridge surface (`designer-bridge.ts` + `createDesignerBridge.ts`): a `sharedImages` channel group
      (import / list / remove / url / onImported), constructed once with the shared `Workspace` (not
      re-scoped on project change).

## 2. Schema (smaller diff)

- [ ] Widen `ImageElementSchema` with `source: z.enum(['project','shared']).default('project')`
      (`@cg/shared-schema`); update `defaultImage` to accept/set `source`. No new element kind.

## 3. Two-source resolver across the THREE byte paths (+ render completion)

- [ ] Shared `resolveImageBytes(el)` helper (source-primary, other-store fallback) usable by preview +
      both exporters.
- [ ] **preview** (`preview.ts` / bridge `url` / `assetUrls` map): resolve via `resolveImageBytes`;
      missing → visible placeholder + one-time warning (never crash).
- [ ] **`.vcg`** (`Exporter.#gatherBinaries` + served-runtime `src` wiring): resolve via the helper;
      recurse compositions/containers (fix the layers-only walk); **complete the byte→`src` render** so a
      packaged image actually renders.
- [ ] **HTML** (`ExporterSingleFile.ts`): **new** image base64-inline step (mirror `#inlineFonts`) via the
      helper.
- [ ] Preflight: extend `Exporter.preflight` `missing-asset` to consult BOTH stores; add the equivalent
      image-element preflight to the HTML exporter (today fields-only). Export never silently broken.

## 4. Designer UI

- [ ] Shared Library panel (mirror `ProjectAssetsPanel`/`AssetThumb`/`useAssets`/`assetUrlCache` against
      `sharedImages.*`): add / list (thumbnails + name) / remove.
- [ ] Wire the canvas image/logo tool: re-add the `CanvasToolbar` entry; replace the `CanvasOverlay`
      placeholder `alert` with insert-`source:'shared'`-image-sized-to-aspect + select; empty library ⇒
      `showNotice` hint, no silent insert (D-030 guard).
- [ ] Image inspector combo box (thumbnail + name) listing the shared library; re-points `assetId` +
      sets `source:'shared'`.

## 5. Tests (per design.md TEST PLAN — all three paths + fallbacks)

- [ ] Shared store unit; schema back-compat unit; resolver unit (shared/project/fallback/missing).
- [ ] Byte resolution + inlining on **preview**, **`.vcg`**, **HTML** (incl. nested-comp packaging,
      two-projects-one-source).
- [ ] Missing-asset: preview placeholder + warning; export preflight (`.vcg` + HTML) reports it.
- [ ] E2E: library add/list/remove; tool insert + empty-library guard; inspector combo re-point.

## 6. Gate / docs (phase 2)

- [ ] Full green gate (uncached) for every touched workspace; run the new E2E.
- [ ] Engine doc-sync if a resolver/export contract changes (`docs/engines/overview.md` + relevant
      deep-dives).
- [ ] Mark D-040 `[~]` in `docs/prd/designer.md` with the change dir.
