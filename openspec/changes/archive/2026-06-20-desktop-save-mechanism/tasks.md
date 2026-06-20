# Tasks — Desktop-style Save (D-088 + folded D-089)

## 1. Storage — file-handle persistence

- [x] 1.1 `handle-store.ts`: add `saveFileHandle` / `loadFileHandle` / `forgetFileHandle`
      (namespaced key `project-file:<projectId>`, reusing the `cg-storage` / `handles` store).
- [x] 1.2 Widen `ensureHandlePermission` to `FileSystemHandle`.
- [x] 1.3 Re-export the new helpers from `@cg/storage` index.
- [x] 1.4 Unit test: round-trip (in-memory IndexedDB shim — `fake-indexeddb` avoided to keep the
      gate dependency-free) + permission gating (granted / denied, mocked `query`/`requestPermission`).

## 2. Contract — Recent re-keying

- [x] 2.1 `@cg/shared-ipc` `channels/projects.ts`: re-key `RecentEntrySchema` to
      `{ projectId, name, lastSavedAt, handleKey?, path?, templateType? }` (legacy fields optional).
- [x] 2.2 Update `designer-channels` test for the new shape.

## 3. Dirty — content hash

- [x] 3.1 New `state/scene-hash.ts`: FNV-1a over a canonical (recursively sorted-key)
      serialization of `Scene` with `metadata.updatedAt` removed.
- [x] 3.2 Unit test: key-order stability, `updatedAt` excluded, tiny change ⇒ different hash.
- [x] 3.3 `store-core.ts`: `savedHash`/`currentHash`; `setSavedBaseline(scene)`;
      optimistic dirty in `set()`; `reconcileDirty()` (authoritative `savedHash !== currentHash`)
      called from `markHistoryBoundary` and `markSaved`; close reset clears hashes. No per-tick hashing.
- [x] 3.4 Unit test: edit ⇒ dirty; edit-then-revert ⇒ clean; undo-to-saved ⇒ clean;
      `markSaved` ⇒ clean; only `updatedAt` differs ⇒ clean.

## 4. Platform — native handle Save / Open / Recent

- [x] 4.1 `createDesignerBridge.ts` `saveDisk`: persist handle (IndexedDB) keyed by project id;
      Save reuses it; delete-then-save ⇒ Save As + notice; tiered fallback (handle → OPFS → download).
- [x] 4.2 `createDesignerBridge.ts`: add `openDisk` (`showOpenFilePicker` → handle) and `openRecent`
      (re-acquire permission → open; stale/denied ⇒ needs-picker); hidden-input only as no-FS-Access fallback.
- [x] 4.3 `ProjectStore.ts`: handle-keyed Recent recording + `recent()` new shape; keep OPFS
      `save(path)`/`open(path)` as fallback; keep legacy path entries openable.
- [x] 4.4 `shared/designer-bridge.ts`: extend `saveDisk` return + add `openDisk`/`openRecent` types.

## 5. Renderer — store + chrome

- [x] 5.1 `slices/document.ts`: `setScene` resets baseline + hashes; add `closeProject` action.
- [x] 5.2 `store.ts`: expose `closeProject` (+ any new surface).
- [x] 5.3 `TopToolbar.tsx`: Home → close; Save/Save As thread handle + `markSaved`; Open → `openDisk`;
      SAVE control driven by `isDirty` (enabled-when-dirty, not primary).
- [x] 5.4 `TopToolbar.css.ts`: D-089 unsaved `border-top: 2px solid #ffdd40`.
- [x] 5.5 `LandingView.tsx`: Recent rows handle-keyed; `openRecent` flow + `showOpenFilePicker` fallback notice.
- [x] 5.6 `SaveBeforeSwitchModal.tsx`: call `markSaved` after a successful save.
- [x] 5.7 `App.tsx`: `document.title` effect (`* name`/`name`/`cg Designer`) + `beforeunload` guard armed on dirty.

## 6. Tests + docs

- [x] 6.1 Unit: Save / Save As branch logic (mocked bridge + `FileSystemFileHandle`).
- [x] 6.2 E2E (MemoryWorkspace mode): title asterisk; Save enabled/disabled + yellow border-top;
      SaveBeforeSwitch on New/Open/Home; duplicate-modal regression (Home closes).
- [x] 6.3 `state/README.md` engine doc-sync (dirty/hash + handle model).
- [x] 6.4 Update `design.md` with the 5 clarifications + a manual checklist for native-picker paths.

## 7. Gate

- [x] 7.1 Full green gate for every touched workspace (`format:check` + `typecheck` + `lint` +
      `test` + `build`), `test` run uncached once (`turbo --force`).
- [x] 7.2 `pnpm test:e2e` for the E2E above.
- [x] 7.3 `pnpm openspec validate desktop-save-mechanism --strict`.
