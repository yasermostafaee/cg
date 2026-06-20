# Design — per-composition export scoping (Phase A)

## The three seams the recon found

The full recon is `docs/recon/d-086-export-scoping.md`. Three concrete seams drive this design:

### 1. `editSceneOf` over-gather

`scene-doc.ts` `editSceneOf(scene, id)` projects the open composition by spreading `...scene`
and overriding `layers` (and name/resolution/fields/…) with the comp's — but it deliberately
KEEPS `scene.compositions` whole ("compositions stays from the root so nested instances
resolve and aggregate"). That is correct for preview/inspector RENDERING, but wrong for
PACKAGING: `collectImageElements` walks `scene.layers` AND every entry in `scene.compositions`,
so the HTML export inlines images from sibling compositions that the package shouldn't carry.

**Fix:** `scopeSceneToComposition` = `editSceneOf` projection + `compositions` filtered to the
root's closure. The projection still lifts the root's layers to `scene.layers` (the play-entry);
the filter drops everything not reachable from the root.

### 2. The repeater-closure bug (B-023)

Two ref-collectors had drifted:

- `compositionInstancesOf` (in `composition-fields.ts`) — `composition`-only. Correct for FIELD
  aggregation: a repeater's rows are data, not field namespaces.
- `collectCompRefs` (in `state/slices/composition.ts`, behind the cycle guard) — also
  `composition`-only. WRONG for REACHABILITY: a `repeater` references a child composition
  (`RepeaterElementSchema.compositionId`) whose template + assets the runtime resolves from
  `scene.compositions`, so a repeater IS a real edge for both export closure and cycle
  detection.

The result: `canNestComposition` could not see a repeater edge, so nesting A into B while A
repeats B passed the guard and the runtime recursed to its depth cap.

**Fix:** ONE shared, repeater-aware collector `collectChildCompositionRefs`
(`composition` + `repeater`, recursing containers) in `@cg/shared-schema`, with
`directCompositionRefs` (per-doc) and `compositionClosure(scene, rootId)` (transitive) on top.
The cycle guard becomes `!compositionClosure(scene, childId).has(parentId)`. Field aggregation
is untouched — it keeps the `composition`-only collector by design.

### 3. The whole-project cycle/preflight assumption

`Exporter.preflight` walks `scene.layers` + every `scene.compositions` entry (image
resolution, binding targets, tickers). Against the raw project that means a broken SIBLING
blocks a valid root. Because `scopeSceneToComposition` hands preflight a scene whose
`compositions` is ALREADY the closure, the existing whole-scene walk auto-scopes — no preflight
code change needed.

## Why filter upstream (renderer), not in the packager

`@cg/vcg-format` `pack()` serializes whatever `Scene` it is given (`template.json =
JSON.stringify(scene)`); it does no filtering and should stay dumb. The HTML/Preview paths
already pass a projected scene from the renderer, so scoping `.vcg` the same way keeps ONE
filtering seam and leaves the bridge channel (`ExportRunChannel { scene, outputPath, sign }`)
and packager untouched.

## Closure semantics

`compositionClosure(scene, rootId)` returns the set of compositions reachable FROM `rootId` by
following `composition` + `repeater` child refs transitively. It does NOT include `rootId`
itself (cycles are forbidden, so a comp never reaches itself); the root's content is the
top-level doc after projection, and nothing reachable references it. A visited-set keeps it
terminating even on a malformed cyclic scene. `scopeSceneToComposition` keeps exactly the comps
whose id is in the closure — the root is excluded from `compositions` precisely because it is
the projected top-level doc.

## Play-entry resolution (reported)

The runtime's only entry is `scene.layers` (`@cg/template-runtime` `scene-builder.ts` — the
root build iterates `scene.layers`; nested `composition` / `repeater` elements resolve their
child from `scene.compositions`). So a per-composition `.vcg` MUST lift the root comp's layers
into `scene.layers` (the projection) — passing the raw layerless root renders a blank frame.
That is the concrete reason `.vcg` switches from the raw scene to the scoped+projected scene.

## Phase B (not implemented here)

The chrome relocation (slim global bar + centered project name + per-composition sticky bar,
project-level export removed) is the follow-up. The handlers (`exportVcg` / `exportHtml` /
`openPreview`) already read the active composition from the store, so Phase B is a relocation
plus a new `scene.name` read plus a playout-target combo — no further export-engine change.
The playout-target's natural home is the `Composition` schema (sibling to the existing
per-comp `playout` / `lifecycle`), so it persists with the comp; that schema field is deferred
to Phase B.
