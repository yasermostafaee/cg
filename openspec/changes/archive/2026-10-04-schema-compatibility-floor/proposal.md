# The compatibility floor: shed every legacy path now, and write down when that reverses

## Why

**`P-031` asked one question — wire the schema-migration registry up, or delete it — and the
owner answered a bigger one.** The context that settles it is not in the code: _the product
has not been delivered to a client yet, and no project file in the world has to keep opening._

That turns every backward-compatibility path in the repo from safety into DEBT:

- **The migration registry is dead code that advertises itself as the migration path.** Its
  docstring told the next author that `@cg/vcg-format`'s loader walks it. Nothing walks it —
  `schemaVersion` is written by two call sites and read back only as `z.literal(1)`, so a
  document with any other version FAILS TO PARSE rather than entering a conversion, and the
  walker's `while (version < CURRENT)` loop can never execute a step. Two changes have already
  had to stop and re-derive that fact under time pressure.
- **The other shims are the same defect one layer down.** `readProjectDocument` accepted a bare
  pre-package `.cg.json`, which forced a SECOND document shape (`ProjectDocumentForm`, a
  nullable `manifest`, an asset-scraping conversion path, and a forced-Save-As rule to protect
  the original bytes) through every consumer. `SceneSchema` accepted a legacy `background`
  spelling through a `z.preprocess`. Each is a branch, a test and a paragraph of explanation
  bought for nobody.

**This is the cheapest moment these will ever be to remove**, and the reason to do it now
rather than "later" is that later is exactly when it stops being possible.

## What Changes

- **DELETE** the schema-migration registry (`packages/shared-schema/src/migrations/`) and its
  export. `SceneSchema.schemaVersion` stays `z.literal(1)` — that is now the WHOLE mechanism
  for a version mismatch, not a leftover beside one, and it must not be softened.
- **DELETE** the pre-package `.cg.json` read path and everything it forced into being: the
  `ProjectDocumentForm` union, `ProjectDocument.form`, the nullable `manifest`,
  `AssetStore.collectLegacyAssets`, and the forced-Save-As rule for converted projects.
- **DELETE** the `background` → `editorBackdrop` parse-time shim on `SceneSchema` and
  `CompositionSchema`.
- **KEEP** the parse-time normalization MECHANISM (`z.preprocess`) — only its LEGACY USES go.
  `PlayoutSchema`'s legacy `mode` key is left standing and flagged in `P-031` as the one
  remaining shim and the owner's call.
- **REPLACE** each removed conversion with ONE loud, readable failure. An author handed a file
  that predates the current format is told what it is and what to do about it.
- **RECORD THE POLICY AND ITS REVERSAL** in `P-031`: no backward compatibility is owed until
  the first client delivery, and **the first shipped release becomes the compatibility floor**,
  at which point this reverses and shims stop being optional.

## Impact

- **Affected specs:** `designer-project-persistence` (MODIFIED — one document form, and the
  refusal that replaces the second one).
- **Affected code:** `@cg/shared-schema` (registry deleted, `scene.ts` shim removed),
  `@cg/vcg-format` (`project-package.ts`), `@cg/designer`
  (`createDesignerBridge.ts`, `AssetStore.ts`).
- **Affected tests:** six tests covered the removed shims and went with them (they are
  enumerated in place, in the files that held them, so the removal is legible rather than
  silent); the pre-package fixtures now carry `editorBackdrop` and the `.vcg` fixtures were
  regenerated from their `.gen.mjs`.
- **No runtime/on-air surface is touched.**
