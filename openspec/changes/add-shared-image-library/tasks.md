# Tasks — shared image library + logo element (D-040)

## 0. Phase 1 — recon + design

- [x] Recon the per-project `AssetStore` surface, the three byte paths, and the inert tool (design.md).
- [x] Decide schema (widen image with `source`), the two-source resolver, missing-asset behavior,
      shared store API, UI, test plan, out-of-scope (design.md).
- [x] `openspec validate add-shared-image-library --strict`.
- [x] **OWNER REVIEW GATE** — signed off: (a) the `source`-widening schema choice; (b) the two-source
      resolver plan; (c) the coupled render/inline path. **D-062 (merged, PR #129) already completed the
      per-project image render/inline path on `.vcg` + HTML and left the source-aware seam
      (`resolveImageAsset` / `ImageAssetSource` in `image-export.ts`)**, so phase 2 is now purely the
      "second source" addition through that seam.

## 1. Shared storage namespace (mirror `AssetStore`)

- [x] `SharedImageStore` (`apps/designer/src/platform/SharedImageStore.ts`): `import`/`list`/`get`/`bytes`/`remove` + `imported` emitter, project-independent paths `shared/images/<sha>.<ext>` + `shared/images/index.json`,
      reusing `sha256Hex` dedupe + `AssetMeta`. No `setActiveProject`/`cleared`. Decodes image dimensions
      (browser only) for aspect-sized insertion.
- [x] Parallel `@cg/shared-ipc` channels (`sharedImages.import/list/remove/imported`) mirroring `assets.*`,
      reusing the exported `AssetMetaSchema`.
- [x] Bridge surface (`designer-bridge.ts` + `createDesignerBridge.ts`): a `sharedImages` channel group
      (import / list / remove / url / onImported), constructed once with the shared `Workspace` (not
      re-scoped on project change) + its own blob-URL cache (not revoked on project change).

## 2. Schema (smaller diff)

- [x] Widen `ImageElementSchema` with `source: z.enum(['project','shared']).default('project')`
      (`@cg/shared-schema`); fix `ElementInput` to `z.input<typeof ImageElementSchema>`; update
      `defaultImage` to accept/set `source` (+ optional aspect size). No new element kind.

## 3. Two-source resolver across the THREE byte paths (+ render completion)

- [x] Shared `compositeImageSource(source, shared, project)` helper in `image-export.ts` (source-primary,
      other-store fallback); `ImageRef` carries `source`.
- [x] **preview** (`CanvasArea` merges the project + shared URL maps; `sharedImageUrlCache` mirrors the
      project cache against `sharedImages.url`): a `source: 'shared'` logo resolves + renders; missing →
      visible placeholder (iframe) + one-time, store-definitive warning (`showNotice`), never a crash.
- [x] **`.vcg`** (`Exporter.#gatherBinaries`): each image resolves through the per-element composite; the
      D-062 byte→`src` render path renders shared logos identically. (Recursion into comps/containers was
      already done by D-062.)
- [x] **HTML** (`ExporterSingleFile.#inlineImages`): base64-inline through the composite.
- [x] Preflight: `Exporter.preflight`'s `missing-asset` gate now consults BOTH stores (a logo present only
      in the library is not falsely blocked). HTML still warns (never blocks). Export never silently broken.

## 4. Designer UI

- [x] Shared Library panel (`SharedLibraryPanel`, mirroring `ProjectAssetsPanel`/`AssetThumb`/`useAssets`/
      `assetUrlCache` against `sharedImages.*`): add / list (thumbnails + name) / remove; new left-rail tab.
- [x] Wire the canvas image/logo tool: re-added the `CanvasToolbar` entry; replaced the `CanvasOverlay`
      placeholder `alert` with insert-`source:'shared'`-image-sized-to-aspect + select; empty library ⇒
      `showNotice` hint, no silent insert (D-030 guard). The clicked library thumbnail is the tool's target.
- [x] Image inspector combo (`SharedImagePicker`, thumbnail + name via the shared `SelectField`/`Select`)
      listing the shared library; re-points `assetId` + sets `source:'shared'`.

## 5. Tests (per design.md TEST PLAN — all three paths + fallbacks)

- [x] Shared store unit (`shared-image-store.test.ts`); schema back-compat + shared round-trip unit
      (`elements.test.ts`); resolver unit (`image-source-resolver.test.ts` — shared/project/fallback/missing).
- [x] Byte resolution + inlining on **`.vcg`** + **HTML** (`exporter-shared-image.test.ts`: nested-comp
      packaging, two-projects-one-source, preflight unions both stores).
- [x] Missing-asset: export preflight (`.vcg` blocks, HTML warns) when missing from BOTH stores.
- [x] E2E (`shared-image-library.spec.ts`): library add/list/remove; tool insert + empty-library guard;
      inspector combo re-point.

## 6. Gate / docs (phase 2)

- [x] Full green gate for every touched workspace; ran the new E2E.
- [x] Engine doc-sync: `docs/engines/overview.md` (shared image store + two-source resolver) +
      `apps/designer/src/renderer/features/canvas/README.md` (logo tool + two-source preview map).
- [x] Mark D-040 `[~]` in `docs/prd/designer.md` with the change dir.
