# Tasks — the project IS the package (B-104 / D-150)

## 1. Schema — one asset shape, one manifest

- [x] 1.1 MOVE `VideoProvenanceSchema`, `AssetKindSchema` and `AssetMetaSchema` from
      `@cg/shared-ipc` (`src/channels/assets.ts`) into `@cg/shared-schema`
      (`src/assets.ts`). They are DOMAIN types (golden rule 3) and `@cg/shared-schema` cannot
      import `@cg/shared-ipc`, so the package manifest could not otherwise derive from them.
- [x] 1.2 Re-export all three from `@cg/shared-ipc` so every existing import keeps working
      unchanged. No consumer edit.
- [x] 1.3 `packages/shared-schema/src/project-package.ts`: `ProjectAssetEntrySchema` DERIVED as
      `AssetMetaSchema.omit({ workingPath: true }).extend({ path })` — a second asset shape must
      be impossible to write, not merely discouraged.
- [x] 1.4 `ProjectPackageManifestSchema` — `format: z.literal('cgproj')`, `formatVersion`,
      `projectId`, `name`, `savedAt`, `assets: ProjectAssetEntry[]`. Distinct from
      `ManifestSchema` (`format: 'vcg'`), which is a broadcast contract.

## 2. Packaging — reuse, do not re-implement

- [x] 2.1 `packages/vcg-format/src/project-package.ts`: `packProject` on the SAME `writeZip`,
      `unpackProject` on the SAME `readZip`. No new zip code, no new hashing.
- [x] 2.2 `packProject` writes the FULL scene — it must NOT call `withoutEditorBackdrop`. Record
      WHY on the function: that helper is the export path's B-129 fix, and running it on a save
      would delete the author's backdrop every time.
- [x] 2.3 `readProjectDocument(bytes)` — the ONE entry point. Zip magic `50 4B 03 04` ⇒ package;
      anything else ⇒ UTF-8 JSON ⇒ `SceneSchema.parse` ⇒ `form: 'legacy-json'`. Parse-time
      normalization, NOT `migrations.migrate()` — record why ([[P-031]]).
- [x] 2.4 A `.vcg` opened as a project is refused by NAME (its manifest says `format: 'vcg'`),
      with a message pointing at the right action.
- [x] 2.5 Export `PROJECT_PACKAGE_EXT`, `packProject`, `unpackProject`, `readProjectDocument` +
      types from the package index.

## 3. Designer platform — the save/open paths

- [x] 3.1 `AssetStore.exportForPackage()` → `{ files: Map<path, bytes>, index }` using the
      ALREADY-STORED `sha256` (no re-hash — the measured cost the proposal declines to pay).
- [x] 3.2 `AssetStore.adoptFromPackage(index, files)` — write the bytes into the active project's
      workspace subtree and rebuild the in-memory index. Idempotent (dedupe by sha).
- [x] 3.3 `AssetStore.collectLegacyAssets(projectId)` — read `projects/<id>/assets/index.json` + bytes for the CONVERSION path. Read-only: never move, never delete.
- [x] 3.4 `ProjectStore.savePackage` / `openPackage` — package bytes in, package bytes out;
      workspace path-model tier writes `.cgproj`.
- [x] 3.5 `createDesignerBridge`: `saveDisk` / `openDisk` / `openRecent` / `open` all route
      through the package. Suggested name `<slug>.cgproj`; the file picker accepts BOTH
      `.cgproj` and legacy `.cg.json`.
- [x] 3.6 A project opened from legacy JSON is marked `converted` so the next Save routes to
      Save As — the original file is never written through.

## 4. `initWorkspace()` — no silent substitution

- [x] 4.1 Return `WorkspaceInit { workspace, root: { kind, label, reason, detail? } }`. Both bare
      `catch {}` legs become NAMED reasons; a throw keeps its message.
- [x] 4.2 Distinguish `folder-permission-lost` (restore returned null) from
      `folder-restore-failed` (restore threw) — different conditions, different remedies.
- [x] 4.3 `?storage=memory` diagnostic override ⇒ `forced-memory`. Deliberately NOT the
      `CG_E2E` flag, and defensible only because §5 makes the state loud.
- [x] 4.4 `bridge.storage.state()` + `bridge.storage.reconnectFolder()` on the designer bridge —
      reconnect needs a user GESTURE, which boot does not have. That is B-104's storage leg.

## 5. Renderer — `MemoryWorkspace` is never silent again

- [x] 5.1 `StorageNotice` (shared `Callout`) — shown for every degraded/session-only reason,
      absent for the healthy ones. States the reason in words, not a code.
- [x] 5.2 The session-only notice says plainly: nothing is being saved, closing the tab discards
      it. `role="alert"`, not dismissable.
- [x] 5.3 The lost-folder notice names the folder and offers **Reconnect** (the gesture).
- [x] 5.4 Mounted in the app shell so it is visible on the landing screen AND in the editor —
      the landing screen is where an author decides to open a project.

## 6. Tests

- [x] 6.1 shared-schema: `ProjectPackageManifestSchema` round-trip; the entry shape is DERIVED
      (a `workingPath` key is rejected / `path` required).
- [x] 6.2 vcg-format: pack → unpack round-trip preserves scene + asset bytes exactly;
      `editorBackdrop` SURVIVES (the anti-`withoutEditorBackdrop` regression); deterministic
      re-pack.
- [x] 6.3 vcg-format: `readProjectDocument` on legacy JSON ⇒ `form: 'legacy-json'` + a parsed
      scene; on a package ⇒ `form: 'package'`; on a `.vcg` ⇒ a named refusal.
- [x] 6.4 🔴 **The simulated-restart regression test.** Save a project with assets from
      workspace A; construct a SEPARATE, EMPTY workspace B (the restart: different root, zero
      asset bytes); open the package bytes against B; assert every asset lists and its bytes
      match. Not an in-memory round-trip — the point is that the workspace changed.
- [x] 6.5 Conversion test: open a pre-package `.cg.json` whose assets live under
      `projects/<id>/assets/`; assert the scene loads, the assets are adopted, and BOTH the
      original JSON and the legacy asset bytes are still present and unmodified afterwards.
- [x] 6.6 `initWorkspace` tests: each reason is reported; nothing is swallowed; the healthy path
      reports no degradation.
- [x] 6.7 E2E `apps/designer/tests/e2e/project-package.spec.ts` — import an image, save,
      capture the `.cgproj` bytes, RELOAD (fresh MemoryWorkspace + MemoryKv = a harder-than-real
      restart, since even the sandboxed store is gone), reopen from the captured bytes, assert
      the asset is listed and the element renders.
- [x] 6.8 E2E: the session-only storage notice is visible when the memory root is active.

## 7. PRD + docs

- [x] 7.1 File `D-150` in `docs/prd/designer.md` (the format), and record on `B-104` that it is
      closed by it — B-104 stays the bug, D-150 is the mechanism.
- [x] 7.2 `packages/template-runtime/README.md` — the `paintEditorBackdrop` boot option is a
      new extension point on the runtime, so it is documented beside `RenderMode` (B-134).

## 7b. The two backdrop defects the owner reported mid-change

Folded in rather than deferred: both are small, both reach what the author sees, and B-133 is a
direct ripple of B-129's rename that this session was already standing on.

- [x] 7b.1 🔴 **B-133** — `updateScene`'s `docKeys` still said `'background'` after B-129 renamed
      the field, so an `editorBackdrop` patch routed to the scene ROOT while the canvas renders the
      ACTIVE COMPOSITION's field. Written to one place, read from another: the control did nothing.
      Fixed, plus a `satisfies` constraint so the next doc-field rename is a BUILD ERROR here.
- [x] 7b.2 B-133's record correction: B-129's `tasks.md` §5.4(a) blamed `!important` in the D-071
      pasteboard CSS. That was wrong — those rules carry no `!important` and the runtime sets the
      `background` shorthand inline, which beats them. Corrected in place, not deleted.
- [x] 7b.3 **B-134** — the Preview modal painted the backdrop, though it is a preview of AIR.
      A SECOND axis (`paintEditorBackdrop`) rather than a third `RenderMode`, because the modal
      needs `'author'` (Live Source bars) and "no backdrop" at the same time.
- [x] 7b.4 Tests: `apps/designer/tests/editor-backdrop-routing.test.ts` (5) and
      `packages/template-runtime/tests/editor-backdrop-surface.test.ts` (5).

## 8. Gate

- [x] 8.1 `pnpm openspec validate designer-project-package --strict`.
- [x] 8.2 Full green gate — plain `pnpm gate`, uncached: **85 successful, 85 total, `0 cached`**,
      plus `openspec validate --all --strict` 45/45.
- [x] 8.3 `pnpm test:e2e` locally — **designer 255 passed, runtime 67 passed**, each suite run on
      its own. ⚠ Stated honestly: the COMBINED `pnpm test:e2e` turbo run showed 1 designer and 3
      runtime failures (the runtime ones all `page.goto: Test timeout`), and both suites then
      passed clean in isolation on the same build. That is the known B-098 / B-073 contention
      class — two Playwright suites co-scheduled on this host — not a defect in this change, and
      per CLAUDE.md the answer is the bound, never a longer timeout. The authoritative signal is
      the Linux `e2e` job in 8.4.
- [x] 8.4 ✅ **Linux `gate:e2e` DISCHARGED.**
      <https://github.com/yasermostafaee/cg/actions/runs/31490830071> — `head_sha`
      `8cad8989135cc2a747d444a7622543272ae3187a`, the commit that carries this change. Job
      **`E2E (Playwright)` → `completed` / `success`** — it RAN, it was not skipped. The `ci`
      job (`Lint • Typecheck • Test • Build`) is `success` on the same SHA, and the run's own
      conclusion is `success`.
      ⭐ This also settles the local combined-run noise recorded in 8.3: the authoritative
      Linux suite is green on this exact tree, so those failures were the host contention
      class and not this change.
