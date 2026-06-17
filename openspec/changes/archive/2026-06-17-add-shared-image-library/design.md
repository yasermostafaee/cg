# Design — shared image library + logo element (D-040)

Recon findings (with file:line) + every design decision. **Design only** — no implementation here.

---

## RECON

### 1. The per-project `AssetStore` surface to mirror

**Location (recon correction):** `apps/designer/src/platform/AssetStore.ts` — **not** `@cg/storage`. The
brief said "expect `@cg/storage`"; in fact the store is in the designer app's platform layer and
_uses_ the `@cg/storage` `Workspace` as its byte backend. The "shared `@cg/storage` namespace" is
therefore a **path namespace inside the same `Workspace`**, with a new store class that mirrors
`AssetStore`. (This matches the PRD's own note: "shared across projects on this storage backend.")

**API (`AssetStore`, `apps/designer/src/platform/AssetStore.ts:42`):**

- `setActiveProject(projectId | null)` (`:60`) — scopes reads/writes to `projects/<id>/...`, clears the
  in-memory index, fires `cleared`. **The shared store drops this** (project-independent).
- `importFile(file, kindHint?)` (`:97`) — hashes bytes (`sha256Hex` from `@cg/vcg-format`, `:103`),
  **dedupes by sha256** (`:104`), writes bytes to `#bytesPath` (`:73` →
  `projects/<id>/assets/<kind>/<sha>.<ext>`), appends `AssetMeta` to the index, persists, emits `imported`.
- `list()` (`:129`), `get(assetId)` (`:134`), `bytes(assetId)` (`:140` → `ws.readFile(meta.workingPath)`),
  `remove(assetId)` (`:146` — **removes the index entry only, not the bytes**).
- Index persisted as JSON at `projects/<id>/assets/index.json` (`#indexPath`, `:68`) via
  `ws.readJson` / `ws.writeJson`.
- Emitters: `imported: Emitter<AssetMeta>` (`:43`), `cleared: Emitter<void>` (`:44`).

**`AssetMeta` (`packages/shared-ipc/src/channels/assets.ts:13`):**
`{ assetId: string, kind: 'image'|'font'|'lottie'|'video', filename: string, sha256: string,
byteSize: number, workingPath: string }`.

**`Workspace` (`packages/storage/src/types.ts:10`):** a flat, path-addressed byte store —
`readFile`/`writeFile`/`readText`/`writeText`/`readJson`/`writeJson`/`delete`/`exists`/`list`. Paths
are POSIX relative (e.g. `assets/image/<sha>.png`); intermediate dirs created on write. Backends:
`DirectoryWorkspace` (File System Access), `MemoryWorkspace` (tests).

**Bridge wiring (`apps/designer/src/platform/createDesignerBridge.ts`):** `const assets = new
AssetStore(ws)` (`:27`); on project change, `assets.setActiveProject(scene?.id ?? null)` (`:47`). The
bridge exposes `assets.{ import, list, remove, onImported, onCleared, url }`
(`apps/designer/src/shared/designer-bridge.ts:75`). `url(assetId)` (`createDesignerBridge.ts:196`)
resolves `bytes` → `Blob` → `URL.createObjectURL` and caches it (`assetUrlCache`). IPC channels:
`AssetsImportChannel` / `AssetsListChannel` / `AssetsRemoveChannel` / `AssetsImportedChannel`
(`packages/shared-ipc/src/channels/assets.ts`).

> **Mirror plan:** a `SharedImageStore` in `apps/designer/src/platform/` reusing the SAME byte/blob
> handling (sha256 dedupe, `Workspace` read/write, the `AssetMeta` shape) under a project-independent
> path namespace `shared/images/<kind>/<sha>.<ext>` + `shared/images/index.json`. No `setActiveProject`.
> Constructed once with the same `ws` (no re-scope on project change). Parallel bridge surface
> `sharedImages.{ import, list, remove, url, onImported }` + parallel IPC channels. **Do NOT invent a
> parallel encoding** — reuse `sha256Hex`, `AssetMeta`, and the `url`/blob path verbatim.

### 2. Asset RESOLUTION + inlining across the THREE byte paths (the central refactor + main risk)

The runtime's image builder emits an `<img>` with **no `src`** —
`buildImage` (`packages/template-runtime/src/scene-builder.ts:824`) sets
`el.dataset['cgAssetId'] = element.assetId` and `data-cg-element-id`, then returns; **nothing in the
runtime sets `src`** (`packages/template-runtime/src/runtime.ts` has no asset-URL resolution — `assetId`
appears only in field-binding merge logic). So the `assetId → URL` mapping is entirely external, and
**it exists on only ONE of the three paths today.**

**(a) Live preview — `apps/designer/src/platform/preview.ts`.** WORKS. The preview iframe holds an
`assetUrls` map and `applyAssetUrls()` patches each `[data-cg-asset-id]` `<img>.src` from it. The map is
built in the renderer (`CanvasArea.tsx` → `assetUrlGetAll()`) from
`window.cg.assets.url(assetId)` → bridge `url` (`createDesignerBridge.ts:196`) → `AssetStore.bytes` →
blob URL. **Missing asset:** `url` returns `null`, the map has no entry, the `<img>` keeps an empty
`src` — no crash, **but no placeholder/warning either** (silent broken image).

**(b) `.vcg` packaging — `Exporter.#gatherBinaries` (`apps/designer/src/platform/Exporter.ts:213`) +
`pack` (`packages/vcg-format/src/pack.ts:66`).** PARTIAL. `#gatherBinaries` walks `scene.layers`
children, collects `el.type === 'image'` ids, calls `assets.get` + `assets.bytes`, and builds an
`assetsMap` (`relativePath → bytes`, `assets/<kind>/<sha><ext>`) + `assetIndex` entries; `pack` copies
the map into the zip (`copyInto`, `pack.ts:123`). **BUT** the runtime serving the `.vcg` never wires
`<img>.src` from those packaged paths (same stub as above) → the bytes are shipped but the image
**doesn't render**. Two gaps: (i) `#gatherBinaries` only walks `scene.layers`, **not compositions or
container children** (pre-existing limitation); (ii) no `src` wiring in the served runtime. **Missing
asset:** `#gatherBinaries` silently `continue`s (bytes omitted), but `Exporter.preflight`
(`Exporter.ts:34`) catches it first — see (d).

**(c) Single-file HTML — `ExporterSingleFile.ts`.** IMAGES NOT INLINED. The scope note (`:39`) states
plainly: "image elements are not yet base64-inlined — the runtime's image resolution is still a stub
(static images don't render in the preview/`.vcg` either)." Only **fonts** are inlined
(`#inlineFonts`, `:88`, base64 `@font-face`). The scene JSON is embedded but image elements keep their
`assetId` with no resolved bytes and no `src`. **Missing asset:** the HTML preflight (`:102`) warns
image **fields** only — image **elements** are neither inlined nor validated.

**(d) Preflight / validation — `Exporter.preflight` (`apps/designer/src/platform/Exporter.ts:34`).** The
only real asset gate. Builds `knownAssetIds = new Set(assets.list().map(assetId))` (`:45`), walks every
element across the main scene AND all compositions, **recursing into containers** (`:51`), and for each
`el.type === 'image'` with `assetId ∉ knownAssetIds` pushes
`{ severity:'error', code:'missing-asset', elementId }` (`:62`). `produce()` filters errors and
**throws** if any (`Exporter.ts:156`). `ExportIssue` shape:
`packages/shared-ipc/src/channels/export.ts:16`. The HTML exporter has its **own** lighter `preflight`
that does **not** check image elements.

> **Resolution-path summary:** preview resolves+renders (blob URLs, project store only); `.vcg` packages
> bytes but does not render them; HTML neither inlines nor renders image bytes. **"Inline exactly like a
> per-project asset" presupposes a per-project image render path that, on the export paths, isn't there
> yet.** See Decision §B and the scope flag.

### 3. The image element, the inert tool, and the inspector

- **`ImageElementSchema` (`packages/shared-schema/src/elements.ts:402`):**
  `{ type:'image', assetId: IdSchema, fit: 'contain'|'cover'|'fill'|'none', preserveAspect: boolean,
tint?: HexColor }`. `defaultImage(id, x, y, assetId)` exists
  (`apps/designer/src/renderer/state/element-defaults.ts:269`).
- **The inert tool:** the toolbar entry is **commented out** (`CanvasToolbar.tsx:36` — "Image tool
  hidden for now — placement/upload flow needs rework before it ships. Re-add `{ id:'image', … }` when
  fixed."). The `'image'` tool click handler (`CanvasOverlay.tsx:248`) only runs
  `window.alert('Import an image asset via the Library first (M6.4 placeholder).')` — it **inserts
  nothing**. That is the "inert tool + empty picker" the PRD describes: there was no shared source to
  pick from, so the placement flow was parked.
- **What DOES work:** dragging a per-project asset from the Project Assets panel onto the canvas
  (`CanvasOverlay.onDrop`, `:295` — `application/x-cg-asset-id` → `defaultImage(...)`, `:319`). Project
  images render in preview via that path. The Project Assets UI to mirror for the library panel:
  `apps/designer/src/renderer/features/assets/{ProjectAssetsPanel,AssetThumb,useAssets,assetUrlCache}.tsx`.
- **D-030 insertion guard precedent:** the repeater tool refuses to insert when there is no child
  composition and surfaces a hint via `designerStore.showNotice(...)` (the same notice mechanism used in
  `CanvasOverlay.onDrop` for the composition-cycle case). The logo tool mirrors this: empty library ⇒
  `showNotice("Add a library image first")`, no silent insert.

---

## DECISIONS

### A. SCHEMA — widen the image element (CHOSEN), not a new `logo` kind

**Decision:** add `source: z.enum(['project', 'shared']).default('project')` to `ImageElementSchema`.
A logo is an image with `source: 'shared'`; `assetId` holds the shared image id (the same field, a
different id-space). The resolver branches on `source`. **One image renderer (`buildImage`), one default
(`defaultImage`), one inspector — unchanged.**

**Why (smaller diff, justified against the code):** a new `logo` element kind would force a new member
into the `Element` discriminated union, which fans out into every exhaustive `switch`/registry that
enumerates kinds — `scene-builder` `buildElement`, `field-registry`, the `StyleSection` router, the
`Exporter.preflight`/`#gatherBinaries` walks, `element-defaults`, multi-select descriptors, the timeline
icon map — and would duplicate `buildImage` + `defaultImage` + the image inspector + `fit`/
`preserveAspect`/`tint`. Widening adds **one optional field + one resolver branch**, reuses the entire
image render/inspect/default path, and the `source` axis (where the bytes live) is genuinely orthogonal
to "it's an image." **Back-compat:** `.default('project')` means every scene authored before D-040
parses unchanged (no `source` ⇒ `'project'`), so no migration. (Open question for phase 2: whether
`source` is keyframe-able — it is NOT; it's a structural reference, like `assetId`/`font.family`.)

### B. The TWO-SOURCE resolver (shared-first → project), applied identically on all three paths

**Decision:** one shared resolver used by preview, `.vcg`, and HTML:

```
resolveImageBytes(el): Uint8Array | null
  primary  = el.source === 'shared' ? sharedStore : projectStore
  fallback = el.source === 'shared' ? projectStore : sharedStore
  return (await primary.bytes(el.assetId))        // source-indicated store first
      ?? (await fallback.bytes(el.assetId))        // tolerant fallback (other store)
      ?? null                                       // missing → caller handles
```

The two stores have independent uuid id-spaces, so an id resolves in at most one — the fallback is
tolerant (a mis-tagged `source`, or a shared image later localized) and never ambiguous. The
`knownAssetIds` preflight gate becomes "known in shared **or** project."

- **preview** — the bridge `url(assetId)` / the `assetUrls` map is built from `resolveImageBytes`
  instead of `AssetStore.bytes` alone.
- **`.vcg`** — `#gatherBinaries` resolves each image via `resolveImageBytes` (and, per §2(b)(i), should
  also recurse compositions/containers so logos in nested comps are packaged).
- **HTML** — a new image-inline step base64-data-URI's each resolved image (mirroring `#inlineFonts`).

**Missing-asset behavior (decision):**

- **edit / preview:** render a **visible missing-asset placeholder** on the `<img>` (e.g. a
  broken-image frame) **and** a one-time `showNotice` warning — never crash. (Today preview is silently
  broken; D-040 adds the placeholder + warning.)
- **export (`.vcg` + HTML):** reported via the **existing preflight/validation path** — extend
  `Exporter.preflight`'s `missing-asset` error to consult both stores, and **add the equivalent
  image-element preflight to the HTML exporter** (today it only warns image fields). Consistent with how
  unresolved assets are handled today (blocked or clearly warned), **never a silent broken export**.

**⚠ Coupled scope (the main risk).** Because per-project image **rendering** in exported output does not
exist yet (§2: `.vcg` ships bytes without `src` wiring; HTML doesn't inline images), the two-source
resolver alone won't make an exported logo render. Phase 2 must **complete the byte→`src` render/inline
path on `.vcg` + HTML for the project source too** (the served-runtime `src` wiring + the HTML inline
step), for BOTH sources via the one resolver. **Recommendation:** D-040 owns this completion — the
shared-vs-project axis is orthogonal and one resolver refactor covers both; splitting it would leave
D-040 unable to meet its own "exported file renders the logo" acceptance. **Owner: confirm this enlarged
scope, or split the render-completion into a coupled prerequisite item, before phase-2 implementation.**

### C. Shared `@cg/storage` namespace API (mirrors `AssetStore`, project-independent)

`SharedImageStore` (in `apps/designer/src/platform/`, byte backend = `@cg/storage` `Workspace`):
`import(file)`, `list()`, `get(id)`, `bytes(id)`, `remove(id)`, `imported`/`changed` emitters. Paths
`shared/images/<kind>/<sha>.<ext>` + `shared/images/index.json`. Reuses `sha256Hex` dedupe + `AssetMeta`.
`kind` restricted to `'image'` (libraries hold images). `remove` mirrors `AssetStore` (index entry only;
bytes left for dedupe-safety) — or optionally `ws.delete` the bytes when no other index entry shares the
sha (decide in phase 2; v1 may keep the simpler index-only remove). Bridge + IPC channels parallel the
`assets.*` ones (`sharedImages.import/list/remove/url/onImported`).

### D. Designer UI

- **Shared Library panel** — mirror `ProjectAssetsPanel` + `AssetThumb` + `useAssets` + `assetUrlCache`
  against the `sharedImages.*` bridge: add (file picker → `import`), list (thumbnails + name), remove.
- **Tool wiring** — un-hide the canvas image/logo tool (re-add the `CanvasToolbar` entry) and replace the
  placeholder `alert` in `CanvasOverlay` (`:248`): on click with a **non-empty** library, insert a
  `source: 'shared'` image referencing the first/selected library image, **default-sized to the image's
  aspect ratio**, and select it; with an **empty** library, `showNotice` a hint and insert nothing
  (D-030 guard). (Per-project drag-drop placement, `onDrop` `:295`, stays as-is.)
- **Inspector combo box** — for a selected image element, a combo (thumbnail + name) listing the shared
  library; choosing one re-points `assetId` (and sets `source: 'shared'`). Lives in the image inspector.

---

## TEST PLAN (phase 2 — explicit, covers all three paths + fallbacks)

**Shared store (unit):** import dedupes by sha256; `list`/`get`/`bytes`/`remove`; project-independent
paths; survives a simulated project switch (no `setActiveProject` re-scope); `MemoryWorkspace`-backed.

**Schema (unit):** `source` defaults to `'project'` when absent (back-compat parse of a pre-D-040 image);
`'shared'` round-trips; no other image field changed.

**Two-source resolver (unit):** resolves a `source:'shared'` id from the shared store; a `source:'project'`
id from the project store; the tolerant fallback (id only in the other store); `null` when in neither.

**Byte resolution + inlining — ALL THREE PATHS (the core of D-040):**

- **preview:** a scene with a `source:'shared'` logo → the preview `assetUrls`/resolver yields the shared
  bytes and the `<img>` gets a `src`; a project image still resolves; a missing id → placeholder + warning,
  no crash.
- **`.vcg`:** packing a scene with a shared logo includes the resolved bytes in the zip (assetsMap +
  assetIndex) **and** the served runtime renders it (`src` wired); a logo in a nested composition/container
  is packaged (regression for the layers-only walk); two projects using the same library image each package
  independently from the one source.
- **HTML:** exporting a scene with a shared logo base64-inlines the resolved bytes (data-URI `<img>`), no
  external/`file://` reference; renders headless with no network.

**Missing-asset fallbacks:** preview/edit placeholder + warning; **export preflight** reports an
unresolved logo id on BOTH `.vcg` and HTML (blocked/warned via `ExportIssue` `missing-asset`), never a
silent broken export. Parametrize over `source: 'project' | 'shared'`.

**UI / E2E:** add → list → remove in the Shared Library panel (thumbnails); the image/logo tool inserts a
selected, aspect-sized shared image on a non-empty library and shows a hint (no insert) on an empty one
(D-030 guard); the inspector combo re-points the selection. Compose from `apps/designer/tests/e2e/`
fixtures.

---

## OUT OF SCOPE (v1 — explicit)

- Cross-machine / central sync — no backend; "shared" = across projects on this storage backend (OS-level
  sharing only if the operator points the `Workspace` at a shared drive — their setup, not a feature).
- Categories / folders / tagging in the library.
- SVG-specific handling beyond what the image element already does.
- Per-project overrides of a shared image (no per-project fork of one library image's bytes).
