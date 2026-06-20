# Per-composition export + top-chrome relocation (D-086, absorbs D-095)

## Why

Post-D-024 there is no "main scene": the project root is layerless and all content lives in
`scene.compositions`. Today's export pipeline still assumes a whole-project scene, which is
now wrong in three ways the D-086 recon (`docs/recon/d-086-export-scoping.md`) pinned down:

1. **The `.vcg` renders a blank frame.** The runtime's only play-entry is `scene.layers`
   (`@cg/template-runtime` `scene-builder.ts`), but `exportVcg` passes the raw, layerless
   root — so the served package renders nothing.
2. **The single-file HTML over-gathers.** It projects the open composition via `editSceneOf`
   but that projection KEEPS the full `scene.compositions` array, so the image walk
   (`collectImageElements`) inlines assets from sibling compositions the export shouldn't
   contain.
3. **A repeater-mediated nesting cycle slips past the author-time guard.** A `repeater` also
   references a child composition, but the cycle guard's ref-collector only followed
   `composition` instance edges — so nesting A into B while A repeats B was allowed, and the
   runtime would recurse to its depth cap (bug B-023).

Export must be scoped to ONE root composition plus its transitive nested **closure**. This is
the risky correctness core; doing it first de-risks the chrome relocation that follows.

## What Changes

**Phase A — engine (this change's implemented scope):**

- New `compositionClosure(scene, rootId)` in `@cg/shared-schema`, built on ONE shared
  ref-collector (`collectChildCompositionRefs`) that follows BOTH `composition` and
  `repeater` child references, recursing containers. Lives beside
  `compositionInstancesOf` / `aggregateCompositionFields`.
- The author-time cycle guard (`canNestComposition`) is repointed at that shared collector,
  so a repeater-mediated cycle is now blocked (B-023). Field aggregation keeps its
  `composition`-only collector (repeater rows don't form field namespaces).
- New renderer helper `scopeSceneToComposition(scene, rootId)` = `editSceneOf`'s layer
  projection (so the root comp's layers become `scene.layers`, the play-entry) PLUS filtering
  `scene.compositions` to `rootId`'s closure (sibling comps + assets excluded).
- Both exports route the open composition through it: `.vcg` (`runDisk`) now sends the
  scoped+projected scene (fixing the blank frame); HTML (`runSingleFileHtml`) swaps
  `editSceneOf` for `scopeSceneToComposition` (no more sibling over-gather). Preview reuses
  it for parity. The exporter's whole-project preflight auto-scopes because the scoped
  scene's `compositions` IS the closure — a broken sibling no longer blocks a valid root.
- The bridge/channel and the `@cg/vcg-format` packager are UNCHANGED — filtering is upstream
  in the renderer, exactly as HTML/Preview already did.

**Phase B — chrome (follow-up; tasks listed unchecked):**

- Slim the GLOBAL top bar to menus + a centered project name + Save (D-089 amber kept);
  remove Preview / Export .vcg / Export HTML from it (absorbs D-095 — centered name + Save).
- Add a per-composition sticky bar above the canvas: Preview, Export .vcg, Export HTML, and a
  playout-target combo (CasparCG-only for now). Remove the project-level export entirely.

## Impact

- Affected specs: **designer-composition-export** (new capability — Phase A);
  **designer-repeater-element** (MODIFIED Cycle guarding — Phase A). Phase B will add chrome
  scenarios to **designer-shell**.
- Affected code (Phase A): `@cg/shared-schema` (`composition-fields.ts`), `@cg/designer`
  (`state/scene-doc.ts`, `state/slices/composition.ts`, `state/store.ts`,
  `features/shell/TopToolbar.tsx`). `@cg/vcg-format` untouched.
- Risk is concentrated in the closure walker and the cycle guard; both are unit-pinned.
