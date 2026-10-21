# One package id per composition, and an import that never replaces in silence (B-352, RUN-NEXT-VERSION-02 Part 1.2)

## Why

The owner: _"from one template, with a few changes, we take several outputs; when we import them into CG Control,
each one takes the place of the previous one; we cannot have them side by side."_

Measured at `9421a8bb`:

- `editSceneOf` (`apps/designer/src/renderer/state/scene-doc.ts:130`) spreads `...scene`, so the export projection
  `scopeSceneToComposition` keeps the PROJECT's `scene.id`, and the Exporter writes it as `manifest.id`
  (`apps/designer/src/platform/Exporter.ts:488`). Every composition of one project exported with ONE id.
- CG Control lists a template by that id (`templateDelivery.ts:321`, `templateId: manifest.id`), and CG Bridge's
  `importOn` lists the new version under the same id on the channel (`template-registry.ts:587`). So each import
  REPLACED the previous one, silently — the success line said `Imported · …` either way.
- **Save As** kept the project id too, so a project saved as a copy exported over its original in CG Control (and
  its file handle and Recent entry were filed under the original's id).
- **Duplicate composition** already mints a fresh composition id (`duplicateComposition`).

No entry existed in `docs/prd/` for it (swept by "replace", "same id", "manifest.id", "scene.id", "collid").

## What Changes

- **One package id per composition**, derived from the project id and the composition id
  (`compositionPackageId`, `@cg/vcg-format`): the same composition re-exported keeps its id, so it still UPDATES its
  template (Source defaults kept, page rebuild intact); another composition gets another.
- **Save As makes a copy with its own project id** (and so its own package ids), its assets and its own Recent entry
  and file handle; the original file is untouched. A Save that falls back to the dialog (no file yet, or the old file
  cannot be written) keeps the id.
- **CG Control asks when a package's id is already on the channel:** `Update "<name>"` (the default — the rows and the
  Source defaults stay) or `Add as a new template` (a new library id; the name gets ` (2)` when it clashes). The
  success line says which: `Updated · telavat` / `Imported · telavat (2)`. A row already loaded or on air keeps the
  version it was loaded with until it is loaded again — CG Bridge's versioned store already does this; unchanged.
- A template added as new is rebuilt under its own id when CG Control's runtime changes (the rebuild used to answer
  `stale` for an id that differs from the package's).

## Migration

Templates already in CG Control under a project-wide id stay as they are. The first time a composition is exported
with its new id and imported, it arrives BESIDE the old entry (a new id is a new template); the old entry can be
removed. Release note: _"Each composition now exports as its own template: the first import of a re-exported
composition appears next to its old entry in CG Control — remove the old one when you no longer need it."_

## Impact

- **Specs:** `designer-composition-export` (ADDED × 2), `runtime-template-library` (ADDED × 1).
- **Code:** `@cg/vcg-format` (`compositionPackageId`), the Designer's scoping, Save As and store, CG Control's import
  and the picker, the page rebuild. The wire is unchanged: a template id is still an opaque string.
