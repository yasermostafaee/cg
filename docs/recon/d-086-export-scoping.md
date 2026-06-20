# D-086 — recon: per-composition export scoping

Read-only recon (STEP-0) behind D-086 Phase A. All citations against the `main` that
preceded `feat/D-086`. The framing fact: post-D-024 the "main scene" is gone — editing always
targets a composition, the project root is layerless (`scene.layers === []` after load), and
all content lives in `scene.compositions`.

## A) Global top bar — `apps/designer/src/renderer/features/shell/TopToolbar.tsx`

- Menus: Home (`closeProject`), File (New/Open/Save/Save As/Export…/Close), Edit (Undo/Redo),
  View (Ruler/Snapping), Help.
- Save control + D-089 amber: `dirty` from store; className `cx(s.saveCtl, dirty &&
s.saveCtlDirty)`; the amber is a `borderTop` swap `2px solid transparent` → `2px solid
#ffdd40` in `TopToolbar.css.ts` — independent of the D-094 button recipe.
- Export/preview buttons: PREVIEW (`openPreview`), EXPORT .vcg (`exportVcg`), HTML
  (`exportHtml`).
- Project name is NOT in the top bar today — only the browser tab title
  (`App.tsx`, `* {name}` when dirty). The centered name is net-new chrome (Phase B).

## B) Per-composition bar insertion point — `apps/designer/src/renderer/features/canvas/CanvasArea.tsx`

- Canvas surface = the `srcDoc` iframe. A zoom/tool header (`<div className={s.header}>`)
  already sits directly above it, inside `<div className={s.wrap}>`.
- Cleanest insertion for the new per-composition sticky bar: first child of `s.wrap`,
  immediately before the existing `s.header`.
- Active composition in the store: `activeCompositionId: string | null` (`store-core.ts`),
  setter `setActiveComposition` (`state/slices/composition.ts`).

## C) Export pipeline

| Path    | Trigger                                                         | Scene passed   | Effective scope (pre-D-086)                                                               |
| ------- | --------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `.vcg`  | `exportVcg` → `export.runDisk({ scene })`                       | raw `scene`    | whole project — and the raw root is layerless ⇒ **blank frame**                           |
| HTML    | `exportHtml` → `runSingleFileHtml({ scene: editSceneOf(...) })` | projected comp | per-comp layers, but `editSceneOf` keeps ALL `compositions` ⇒ over-gathers sibling images |
| Preview | `openPreview` → `setPreviewScene(editSceneOf(...))`             | projected comp | per-comp                                                                                  |

- `editSceneOf` (`state/scene-doc.ts`) spreads `...scene`, overrides `layers` with the comp's,
  but deliberately keeps `scene.compositions` whole ("compositions stays from the root so
  nested instances resolve and aggregate").
- The packager is scope-agnostic: `@cg/vcg-format` `pack()` does `template.json =
JSON.stringify(scene)` with no filtering — so scoping must happen upstream, in the renderer
  / `Exporter`, not in `pack()`.
- `Exporter.preflight` walks `scene.layers` + every `scene.compositions` entry (images,
  bindings, tickers) — whole-project, so a broken sibling blocks a valid root.
- Fonts are project-level only (`scene.fonts`); no per-composition font list. Over-includes on
  a per-comp export but is a size issue, not a correctness blocker.

## D) Composition graph + closure

- A composition is referenced by an element with `type: 'composition'`, `compositionId`
  (`packages/shared-schema/src/elements.ts` `CompositionElementSchema`).
- **A `repeater` ALSO references a child composition** (`RepeaterElementSchema`, `type:
'repeater'`, `compositionId`) — it stamps that child per row, and the runtime resolves the
  child from `scene.compositions` (`@cg/template-runtime` `scene-builder.ts`).
- The existing author-time cycle guard (`state/slices/composition.ts` `canNestComposition` →
  `directRefsOf` → `collectCompRefs`) is a BFS over the reference graph — but `collectCompRefs`
  only collected `composition` edges, NOT `repeater` edges. So a repeater-mediated cycle was
  invisible to it (bug B-023).
- `compositionInstancesOf` / `aggregateCompositionFields` (`composition-fields.ts`) are
  `composition`-only and correct for FIELD aggregation (repeater rows are not field
  namespaces) — a different concern from reference closure.

## E) Playout-target

- No export-time target/format concept exists today (`ExportRunChannel` carries `{ scene,
outputPath, sign }`; the manifest hardcodes `format: 'vcg'`). The only "target" in the
  codebase is the runtime AMCP failover enum (`primary`/`backup`/`both`), unrelated to export.
- Natural home for a per-composition playout-target: the `Composition` schema, as an optional
  sibling to the existing per-comp `playout` / `lifecycle` — it persists with the comp and
  travels when the comp is nested. (Deferred to Phase B.)

## Seams & risks (ranked)

1. Repeater refs missing from the closure/cycle walker (B-023) — would silently drop a
   repeater's child comp from a per-comp export and allow a repeater-mediated cycle. Fixed in
   Phase A via one shared, repeater-aware collector (`compositionClosure`).
2. `editSceneOf` retains all `compositions` — per-comp packaging needs a closure-FILTERED
   `compositions`, not the projection alone. Fixed by `scopeSceneToComposition`.
3. Whole-project preflight — auto-scopes once the scoped scene's `compositions` IS the
   closure; no preflight code change needed.
4. Filter upstream (renderer), keep `pack()` dumb.
5. Project-level fonts — over-include (size only), optional Phase-B polish.

## Implementation shape (Phase A, implemented)

- `compositionClosure(scene, rootId)` in `@cg/shared-schema` (composition + repeater),
  reused by the cycle guard.
- `scopeSceneToComposition(scene, rootId)` renderer helper = `editSceneOf` projection +
  `compositions` filtered to the closure; routes `.vcg` + HTML + Preview.
- Phase B: relocate chrome (slim global bar + centered name + per-composition sticky bar),
  add `Composition.playoutTarget`, remove the project-level export path.
