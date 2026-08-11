# The project IS the package: a saved project carries its own assets

## Why

**B-104 is a DATA-LOSS bug and it is not a leak in a pipe — it is the shape of the
document.** A project is saved as a bare `.cg.json` holding the `Scene` and nothing else.
The asset BYTES live somewhere else entirely: `projects/<scene.id>/assets/<kind>/<sha>.<ext>`
inside the Workspace. The file the author points at, backs up, emails, and re-opens does not
contain the images or the fonts it needs. It contains a set of `assetId` strings and a hope
that the other place still resolves.

**The other place stops resolving, and here is the exact mechanism** — B-104 asked for it to
be pinned before a fix could be called credible, so it is pinned here rather than assumed:

`initWorkspace()` (`apps/designer/src/platform/workspace.ts:36`) prefers a previously
connected on-disk folder:

```ts
try {
  const restored = await restoreRememberedDirectory(HANDLE_ID);
  // ...
} catch {
  // fall through to OPFS      <- a bare catch, no word to the author
}
```

`restoreRememberedDirectory` calls `ensureHandlePermission`, which calls
`handle.requestPermission({ mode: 'readwrite' })`. **Chromium refuses `requestPermission()`
outside a user gesture** — and `initWorkspace()` runs at BOOT, where there is no gesture. A
full browser restart drops the session's permission grant, so on the next boot the call
either rejects (into the bare `catch`) or resolves `'prompt'` (into `null`). Both legs land
on the SAME silent outcome: the workspace root becomes OPFS instead of the connected folder.

The `projects/<scene.id>/assets/...` path then resolves against a **different root**. The
project opens. The scene is intact. Every asset is gone, and nothing anywhere says why.

The 2026-08-02 field report — _"Designer JSON save/import loses assets"_ — is the same defect
seen from the other side, and it is the one that settles the design: **a `.cg.json` handed to
another machine can never have assets**, because it never carried any. No amount of repair to
the workspace linkage fixes a document whose format excludes its own dependencies.

## What changes

**A project's durable form becomes a self-contained package that carries its assets inside
it — the same shape `.vcg` already uses.** The author points at ONE artifact and everything
travels with it. When the package holds the bytes, losing a folder permission cannot orphan
them, because there is no second place for them to be.

- **`.cgproj` — a new project package.** A deterministic zip: `project.json` (the full
  authoring `Scene`), `manifest.json` (`ProjectPackageManifest`), and
  `assets/<kind>/<sha>.<ext>` (the bytes). Written by `packProject`, read by `unpackProject`,
  both in `@cg/vcg-format` on the SAME `writeZip` / `readZip` / `sha256Hex` primitives the
  `.vcg` exporter uses. There is one zip implementation in this repo and it stays that way.
- **Pre-package `.cg.json` projects open, and convert — by PARSE-TIME NORMALIZATION.** One
  entry point, `readProjectDocument(bytes)`, sniffs the document: zip magic means package,
  else UTF-8 JSON means legacy scene. A legacy open additionally ADOPTS whatever asset bytes
  still live under `projects/<scene.id>/assets/` in the current workspace, so an author whose
  OPFS copy survived gets their assets rescued into the package on the next save.
  WARNING — **NOT registered in `migrations.migrate()`**, see [[P-031]]: that registry has
  zero production call sites, so a migration registered there is a conversion that never runs.
- **Conversion is non-destructive, and the original bytes are stated.** The legacy `.cg.json`
  is never written to and never deleted; the legacy asset subtree is read, never moved. The
  converted project's first Save routes through Save As with a `.cgproj` suggested name, so
  the old file survives byte-identical on disk and still opens in an older build.
- **No silent storage-root fallback survives.** `initWorkspace()` returns a `WorkspaceInit`
  naming the root it chose and WHY. The two bare `catch {}` legs are replaced by named
  reasons, and the Designer SHOWS the degraded ones — including `MemoryWorkspace`, which is a
  session-only store that vanishes on tab close and may never again be a silent state.

## The design fork, decided — ONE FILE, rewritten whole on every save

The prompt named a real fork and asked for it to be decided in the proposal on **measured**
cost, not guessed. Measured (node v26.4.0, this machine, the REAL `writeZip` from the built
`@cg/vcg-format` dist, so the STORE/DEFLATE policy is exactly a save's):

| project                          | payload | `writeZip` | + sha256/Merkle |  total |
| -------------------------------- | ------: | ---------: | --------------: | -----: |
| tiny — 1 logo + 1 font           |  0.5 MB |      12 ms |            3 ms |  15 ms |
| **typical — 4 images + 2 fonts** |  5.1 MB |      36 ms |           33 ms |  69 ms |
| **heavy — 8 MB of images**       |  8.5 MB |      45 ms |           55 ms |  99 ms |
| very heavy                       | 24.5 MB |      93 ms |          159 ms | 252 ms |
| extreme — 60 MB w/ video         | 60.5 MB |     215 ms |          395 ms | 610 ms |

**The measurement's surprise is why the fork resolves cleanly: a whole-package rewrite is not
a compression pass.** `writeZip` already STOREs (never deflates) the extensions that carry
essentially all of a project's bytes — `png|jpe?g|webp|gif|woff2?|mp4|mov|webm` — so
re-writing the package is a memcpy + CRC32 over the asset bytes. The prompt's worry, _"a
naive implementation rewrites the whole bundle on every save, which will hurt on a heavy
project"_, costs **45 ms** at 8.5 MB.

Two further measured facts settle it:

- **The Merkle/sha pass costs MORE than the zip write, and a project save does not need it.**
  Every asset's sha256 is already computed once at IMPORT (`AssetStore.importBytes`). The
  package manifest reuses those stored hashes, so the right-hand column is not paid at all.
  A `.vcg` export still computes its integrity root — that is a broadcast-trust artifact.
- **The only expensive branch is DEFLATE, and it is driven by bytes ENTERING deflate, not by
  project size**: a 2 MB Lottie JSON costs 131 ms, a 6 MB one 363 ms. This is the honest
  worst case, and it is still an explicit `Ctrl+S` on an extreme project. **There is no
  autosave in the Designer** (verified — no timer-driven save exists), so no rewrite ever
  happens on a keystroke.

**Decision: the single `.cgproj` file is the durable, author-facing form AND the working
form. No incremental layer is added.** An incremental working store behind `@cg/storage` that
flushes to the package would buy ~45 ms on a heavy save and cost a second source of truth —
which is the exact class of defect B-104 IS: two places that must agree, and one day do not.
Paying 45 ms to have only one place is the trade this bug argues for.

**This is revisitable on evidence, and the trigger is named**: if a save ever exceeds ~500 ms
in real use, the first move is dropping the DEFLATE level for `.cgproj` (the working file
needs no byte-determinism), and only then an incremental layer.

## Why the project path and the export path are DIFFERENT documents

The non-negotiable is to reuse `@cg/vcg-format` rather than grow a second packaging
implementation. That is met: **one `writeZip`, one `readZip`, one `sha256Hex`, one zip
library.** But `.cgproj` is not literally a `.vcg`, and pretending otherwise would be a bug:

1. **`pack()` calls `withoutEditorBackdrop(input.scene)`.** That is B-129's fix and it is
   correct for a broadcast artifact — and saving a PROJECT through it would silently delete
   the author's canvas backdrop on every save. A project file must round-trip the authoring
   scene exactly; an export must not.
2. **`pack()` requires `indexHtml` + `cgJs` + `cgCss`.** A `.vcg` embeds the runtime bundle so
   it can play standalone. Writing hundreds of KB of runtime into every project save buys the
   author nothing.
3. **`ManifestSchema` is a broadcast contract** — `format: 'vcg'`, a Merkle integrity root, an
   optional Ed25519 signature. A working save is not a signed distribution artifact.
   Conflating them means either signing every save or emitting things that LOOK like
   publishable `.vcg`s and are not.

So: **same primitives, same package shape, different document type.** `.cgproj` says
`format: 'cgproj'` in its manifest, and `readProjectDocument` refuses a `.vcg` with a message
that points at Import rather than failing obscurely.

## Impact

- **Capabilities**: `designer-project-persistence` (MODIFIED — file format, tiered fallback,
  open/convert, storage-root visibility), `designer-project-assets` (MODIFIED — assets travel
  in the package).
- **Schema**: `@cg/shared-schema` gains `ProjectPackageManifestSchema` +
  `ProjectAssetEntrySchema`. `AssetMetaSchema` / `VideoProvenanceSchema` MOVE down from
  `@cg/shared-ipc` into `@cg/shared-schema` (they are domain types — golden rule 3) and are
  re-exported from their old home, so every existing import keeps working unchanged. The
  package entry is DERIVED (`AssetMetaSchema.omit({ workingPath }).extend({ path })`) so no
  second asset shape can exist.
- **Packages**: `@cg/vcg-format` gains `project-package.ts`. `@cg/storage` is unchanged — the
  `Workspace` seam already does everything needed.
- **Runtime**: unaffected, and verified so — the Runtime imports `.vcg` and stores standalone
  HTML (`LibraryStore`); nothing in `apps/runtime` reads a Designer project file or a Designer
  asset path.
- **Fixes**: [[B-104]]. Filed as [[D-150]].
