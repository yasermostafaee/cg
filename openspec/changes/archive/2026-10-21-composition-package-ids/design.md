# Design — composition-package-ids (B-352)

## The id

`compositionPackageId(projectId, compositionId)` = SHA-256 of `["cg-package", projectId, compositionId]` (JSON, so no
joining character can make two pairs collide), printed as a UUID (version nibble `8`, RFC 4122 variant). It is set in
`scopeSceneToComposition`, the export projection — not in `editSceneOf`, whose stable project id the canvas relies on
(`B-035`). The Exporter writes the scoped scene's id as `manifest.id`, so the package and its `template.json` agree.
The scoped scene feeds the Preview and the HTML export too; neither reads the id for anything but a ready message.

Side effect, wanted: the Designer remembers an export's file per scene id (`exportHandles`), so each composition now
remembers its own file instead of offering the last composition's name.

## Save As

`saveDisk({ asCopy: true })` mints a new project id before packing, writes the package, then ADOPTS it exactly as an
Open does: activate under the new id (the asset store re-points) and write the assets there. The renderer renames the
open scene and its undo history (`adoptProjectId`), outside the history. `asCopy` is set only by the author's own
Save As; the fall-backs that also open the dialog (`SaveBeforeSwitchModal`, `UnsavedChangesDialog`, and a Save whose
handle cannot be written) save the same project. There is no "Duplicate project" in the Designer.

## The question in CG Control

The import is split into `produceTemplateDelivery` (verify, unpack, render) and `deliverTemplateImport` (keep, size
check, register), so `importVcgFile` can read the channel's list in between. A caller with a surface to ask on passes
`choose`; without one (a byte-only caller) the import updates, as every import did. "Add as a new template" registers
the same page under a `uuid()` library id with `sourceFileName` `<name> (n).vcg` — the fact the operator's label is
read from, which a page rebuild preserves; the rebuild now sends the library's id (CG Bridge answers `stale` for a
rebuild whose id differs from the page's).

## What a row keeps

Measured, unchanged: CG Bridge's registry HOLDS, per row, the version its page was served from (recorded at every
`CG ADD`, `template-registry.ts` `hold`). An update moves the channel's list; a held version stays stored and served
until that row's next ADD. A row loaded but never played holds nothing, so its PLAY adds the version the channel lists
then.
