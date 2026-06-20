# Desktop-style Save (D-088) — STEP-0 Design / Recon

> **Status: STEP-0 recon only.** This `design.md` is the sole authored artifact.
> `proposal.md`, `specs/`, `tasks.md` are intentionally deferred until this design is
> approved — do NOT run `openspec validate` (the proposal/specs are empty by design).
> No source/test/build file was modified for this step.

Goal: a VS Code / Figma-Desktop document model — a project is a real on-disk file
reached through a `FileSystemFileHandle` that **survives reload**, dirty is a content
hash of the `Scene` only, the tab title shows `* name`/`name`, the Save control reflects
dirty, and unsaved-changes guards cover tab-close/refresh + in-app switches. No auto-save
now, but the architecture must allow `debounce(save, 2000)` later with no rewrite.

---

## 1. Current-state map (verified by reading; file:line)

### 1.1 Dirty model — `apps/designer/src/renderer/state/store-core.ts`

- The store is a hand-rolled singleton: single state `current` ([:171](../../../apps/designer/src/renderer/state/store-core.ts#L171)),
  one write primitive `set(patch)` ([:232](../../../apps/designer/src/renderer/state/store-core.ts#L232)),
  undo/redo stacks `past`/`future` ([:198-199](../../../apps/designer/src/renderer/state/store-core.ts#L198)).
- **Dirty is identity-based**: in `set()`, `dirty: nextScene !== null && nextScene !== savedScene`
  ([:253](../../../apps/designer/src/renderer/state/store-core.ts#L253)). `savedScene` is the
  baseline ([:207](../../../apps/designer/src/renderer/state/store-core.ts#L207)).
- Baseline is set by `markSaved()` (`savedScene = current.scene; set({})`,
  [:353](../../../apps/designer/src/renderer/state/store-core.ts#L353)) and `setSavedScene(s)`
  ([:373](../../../apps/designer/src/renderer/state/store-core.ts#L373)).
- `set()` pushes prior scene to `past` only when the scene REF changes, time-coalesced by
  `COALESCE_MS = 300` ([:197](../../../apps/designer/src/renderer/state/store-core.ts#L197),[:233-246](../../../apps/designer/src/renderer/state/store-core.ts#L233)).
  `markHistoryBoundary()` ([:324](../../../apps/designer/src/renderer/state/store-core.ts#L324)) closes a burst.
- `undo()`/`redo()` restore the exact prior scene **object** ([:276](../../../apps/designer/src/renderer/state/store-core.ts#L276),[:299](../../../apps/designer/src/renderer/state/store-core.ts#L299)).
- **Consequence (the reason D-088 wants a hash):** undo-to-saved clears dirty (same object
  identity), but **edit-then-manually-revert-to-same-content does NOT** (every mutation makes a
  fresh object, so identity differs even when content is identical).
- `DesignerStoreState` ([:39-137](../../../apps/designer/src/renderer/state/store-core.ts#L39)) holds
  the document (`scene`) plus a pile of UI/transient fields — `projectPath`, `activeCompositionId`,
  `notice`, `view`, `tool`, `selection`, `editingTextId`, `bindModeFieldId`, `currentFrame`,
  `selectedKeyframe(s)`, `keyframeInspectorOpen`, `timelineZoom`, `rulerVisible`, `snappingEnabled`,
  `snapGuides`, `guides` (comment: "session-only, not saved into the scene" [:121-126](../../../apps/designer/src/renderer/state/store-core.ts#L121)),
  `canUndo`, `canRedo`, `dirty`. **None of these live inside `scene`** — so hashing `scene`
  already excludes every UI/transient field the brief lists.

### 1.2 `setScene` reset — `apps/designer/src/renderer/state/slices/document.ts`

- `documentSlice.setScene(scene, projectPath)` ([:31](../../../apps/designer/src/renderer/state/slices/document.ts#L31))
  is the load/close primitive: `resetHistory()` ([:32](../../../apps/designer/src/renderer/state/slices/document.ts#L32)),
  `setClipboard(null)`, `setSuppressHistory(true)`, normalize, **`setSavedScene(normalized)`**
  ([:45](../../../apps/designer/src/renderer/state/slices/document.ts#L45)), then `set({ scene, projectPath,
activeCompositionId, view: scene === null ? 'landing' : 'studio', selection:∅, … })`
  ([:47-59](../../../apps/designer/src/renderer/state/slices/document.ts#L47)).
- So **`setScene(null, null)` is already a full "close": scene=null, projectPath=null,
  savedScene=null, history cleared, view='landing', dirty=false.** This is what we extend for
  the Home/close reset (decision F).

### 1.3 Persistence — `apps/designer/src/platform/ProjectStore.ts` (OPFS path-model)

- `save(scene, path)` ([:132](../../../apps/designer/src/platform/ProjectStore.ts#L132)) → normalizes to
  `*.cg.json`, prefixes `projects/` when there's no slash ([:133-134](../../../apps/designer/src/platform/ProjectStore.ts#L133)),
  **bumps `metadata.updatedAt`** ([:137](../../../apps/designer/src/platform/ProjectStore.ts#L137)),
  `#ws.writeJson`, `#setActive`, `#recordRecent`.
- `open(path)` ([:122](../../../apps/designer/src/platform/ProjectStore.ts#L122)) → `#ws.readJson` →
  `SceneSchema.parse` → setActive + recordRecent.
- `recent()` ([:146](../../../apps/designer/src/platform/ProjectStore.ts#L146)) reads KV; `#recordRecent`
  ([:155](../../../apps/designer/src/platform/ProjectStore.ts#L155)) is **path-keyed** (`filter(e => e.path !== path)`),
  cap 16. `activeChanged` emitter ([:36](../../../apps/designer/src/platform/ProjectStore.ts#L36)).

### 1.4 Persistence — `apps/designer/src/platform/createDesignerBridge.ts` (native-handle, in-memory)

- In-memory handle maps `sceneSaveHandles` / `exportHandles` (`Map<string, FileSystemFileHandle>`,
  [:52-53](../../../apps/designer/src/platform/createDesignerBridge.ts#L52)) — **NOT persisted, lost on reload.**
- `projects.saveDisk` ([:147](../../../apps/designer/src/platform/createDesignerBridge.ts#L147)): `askPath`
  forces a new dialog; else reuse `sceneSaveHandles.get(scene.id)` ([:149](../../../apps/designer/src/platform/createDesignerBridge.ts#L149));
  no handle ⇒ `showSaveFilePicker` ([:160](../../../apps/designer/src/platform/createDesignerBridge.ts#L160)) (accept `.json`/`.cg.json`
  [:165](../../../apps/designer/src/platform/createDesignerBridge.ts#L165)) or Firefox `triggerJsonDownload`
  fallback ([:156](../../../apps/designer/src/platform/createDesignerBridge.ts#L156)); cache handle ([:175](../../../apps/designer/src/platform/createDesignerBridge.ts#L175));
  `createWritable`/`write`/`close` ([:177-181](../../../apps/designer/src/platform/createDesignerBridge.ts#L177)).
  Does **not** bump `updatedAt` (writes the raw scene).
- `projects.open` ([:138](../../../apps/designer/src/platform/createDesignerBridge.ts#L138)): with a path →
  `projects.open(path)` (OPFS); without → **`pickJsonFile()`** ([:140](../../../apps/designer/src/platform/createDesignerBridge.ts#L140))
  then **re-saves a copy into OPFS** via `projects.save` ([:143](../../../apps/designer/src/platform/createDesignerBridge.ts#L143)).
- `pickJsonFile` ([:372](../../../apps/designer/src/platform/createDesignerBridge.ts#L372)): a hidden
  `<input type=file accept=.json>` → returns `{ text, name }` — **a `File`, NO handle**, and no
  cancel handling (hangs on cancel, unlike the asset `pickFiles`).
- `export.runDisk` ([:266](../../../apps/designer/src/platform/createDesignerBridge.ts#L266)) mirrors the
  saveDisk pattern with `exportHandles` for `.vcg` (separate concern; out of scope but a template
  for the file-handle persistence).

> **Two disjoint persistence paths today:** the SAVE button writes via the native handle
> (in-memory, scene-id-keyed) and never touches `recent`; Open/Recent/Landing use the OPFS
> path-model (path-keyed `recent`). Saving to disk does not add to Recent, and opening from
> Recent reads OPFS, not the on-disk file. D-088 unifies on native handles.

### 1.5 Workspace — `apps/designer/src/platform/workspace.ts`

- `initWorkspace()` ([:36](../../../apps/designer/src/platform/workspace.ts#L36)): E2E (`window.CG_E2E`,
  [:32](../../../apps/designer/src/platform/workspace.ts#L32)) → `MemoryWorkspace`; else
  `restoreRememberedDirectory(HANDLE_ID)` ([:48](../../../apps/designer/src/platform/workspace.ts#L48)) when
  FS-Access supported; else OPFS `openOpfsWorkspace('designer')` ([:59](../../../apps/designer/src/platform/workspace.ts#L59))
  or `MemoryWorkspace` fallback. `connectDirectory()` ([:78](../../../apps/designer/src/platform/workspace.ts#L78)).
- `prefs` ([:89](../../../apps/designer/src/platform/workspace.ts#L89)) = `LocalStorageKv('cg-designer')`
  (or `MemoryKv` in E2E) — backs `recent`.

### 1.6 Handle persistence — `packages/storage/src/handle-store.ts`

- IndexedDB DB `cg-storage`, object store `handles` ([:6-7](../../../packages/storage/src/handle-store.ts#L6)).
- `saveDirectoryHandle(id, handle)` (`store.put(handle, id)`, [:35](../../../packages/storage/src/handle-store.ts#L35)),
  `loadDirectoryHandle(id)` ([:42](../../../packages/storage/src/handle-store.ts#L42)),
  `forgetDirectoryHandle(id)` ([:47](../../../packages/storage/src/handle-store.ts#L47)).
- `ensureHandlePermission(handle)` ([:56](../../../packages/storage/src/handle-store.ts#L56)):
  `queryPermission`/`requestPermission` with `{ mode: 'readwrite' }`; treats missing methods (OPFS) as
  granted. Typed for `FileSystemDirectoryHandle` but the body is permission-API-generic.
- The header comment ([:1-4](../../../packages/storage/src/handle-store.ts#L1)) states handles are
  **structured-cloneable** so IndexedDB stores them directly, and permission re-acquisition is the
  caller's job. **`FileSystemFileHandle` is structured-cloneable too and exposes the same
  permission API** — extending this module to file handles is low-risk and largely a typing change.

### 1.7 Shell — `TopToolbar.tsx`, `LandingView.tsx`, `SaveBeforeSwitchModal.tsx`

- `TopToolbar.save()` ([:72](../../../apps/designer/src/renderer/features/shell/TopToolbar.tsx#L72)) →
  `saveDisk({ scene, askPath:false })` then `designerStore.markSaved()`; `saveAs()`
  ([:78](../../../apps/designer/src/renderer/features/shell/TopToolbar.tsx#L78)) → `askPath:true`.
- `openProject()` ([:91](../../../apps/designer/src/renderer/features/shell/TopToolbar.tsx#L91)) →
  `projects.open({})` → `setScene`. `closeProject()` ([:96](../../../apps/designer/src/renderer/features/shell/TopToolbar.tsx#L96)) →
  `setScene(null, null)`.
- `guardedSwitch(action)` ([:107](../../../apps/designer/src/renderer/features/shell/TopToolbar.tsx#L107)):
  runs immediately when `scene === null || !dirty`, else queues `pendingSwitch` → `SaveBeforeSwitchModal`
  ([:393](../../../apps/designer/src/renderer/features/shell/TopToolbar.tsx#L393)).
- **Home bug (decision F):** Home ([:216](../../../apps/designer/src/renderer/features/shell/TopToolbar.tsx#L216))
  is `guardedSwitch(() => designerStore.setView('landing'))` — it only flips `view`; the project
  (scene + savedScene + future handle ref) stays loaded, so the guard re-fires on the landing page
  on the next New/Open/recent → the duplicate-modal.
- **SAVE button** ([:385](../../../apps/designer/src/renderer/features/shell/TopToolbar.tsx#L385)):
  `variant="primary"` ALWAYS (blue), `disabled={scene === null}` — does **not** reflect dirty (that's
  D-089).
- No `document.title` and no in-app project-name chrome anywhere in the toolbar.
- `LandingView.guardedSwitch(label, action)` ([:55](../../../apps/designer/src/renderer/features/shell/LandingView.tsx#L55))
  mirrors TopToolbar; `openRecent(path)` ([:69](../../../apps/designer/src/renderer/features/shell/LandingView.tsx#L69))
  → `projects.open({ path })`; recent row type `{ path, name, templateType, lastOpenedAt }`
  ([:33](../../../apps/designer/src/renderer/features/shell/LandingView.tsx#L33)), keyed by `r.path`
  ([:128](../../../apps/designer/src/renderer/features/shell/LandingView.tsx#L128)).
- `SaveBeforeSwitchModal` ([:33](../../../apps/designer/src/renderer/features/shell/SaveBeforeSwitchModal.tsx#L33)):
  Save/Discard/Cancel; `save()` ([:42](../../../apps/designer/src/renderer/features/shell/SaveBeforeSwitchModal.tsx#L42))
  → `saveDisk({ scene, askPath:false })`; on `!ok` keeps the modal open; **does not call `markSaved`**
  (relies on the subsequent switch resetting the baseline).

### 1.8 Contract — `shared/designer-bridge.ts` + `@cg/shared-ipc`

- `projects.saveDisk(req:{ scene, askPath }) → { ok, filename }` ([:64](../../../apps/designer/src/shared/designer-bridge.ts#L64))
  — returns a filename only, **no path/handle/projectId**. `export.runDisk` ([:143](../../../apps/designer/src/shared/designer-bridge.ts#L143)).
- `RecentEntrySchema = { path, name, templateType, lastOpenedAt }` ([projects.ts:14](../../../packages/shared-ipc/src/channels/projects.ts#L14));
  `ProjectsOpenChannel` req `{ path? }` / res `{ scene|null, path|null }` ([:58](../../../packages/shared-ipc/src/channels/projects.ts#L58));
  `ProjectsSaveChannel` req `{ scene, path? }` / res `{ path }` ([:65](../../../packages/shared-ipc/src/channels/projects.ts#L65));
  `ProjectsRecentChannel` → `RecentEntry[]` ([:75](../../../packages/shared-ipc/src/channels/projects.ts#L75)).

### 1.9 Schema — `packages/shared-schema/src/scene.ts`

- `SceneSchema` ([:181-228](../../../packages/shared-schema/src/scene.ts#L181)) fields: `schemaVersion`
  (**`z.literal(1)`** — the migration-ready field, [:183](../../../packages/shared-schema/src/scene.ts#L183)),
  `id`, `name`, `templateType`, `resolution`, `frameRate`, `safeAreas`, `frameRange`, `activeRange?`,
  `lifecycle?`, `playout?`, `background`, `layers`, `fields`, `bindings`, `fonts`, `compositions?`,
  `metadata`. **No UI/transient field anywhere** (no selection/zoom/pan/activeCompositionId/timeline/
  ruler/snapping/hover/menus) — hashing the `Scene` excludes all of them by construction.
- The one volatile field is `metadata.updatedAt` ([:175](../../../packages/shared-schema/src/scene.ts#L175)),
  bumped by `ProjectStore.save` ([ProjectStore.ts:137](../../../apps/designer/src/platform/ProjectStore.ts#L137)) —
  it changes as a side effect of saving, not of user editing, so it must be **excluded** from the dirty
  hash (decision D).

**Extension flag:** the brief says keep `.cg.json`/JSON/`schemaVersion`, do not add a `.cg` extension —
**agreed, no disagreement.** `saveDisk` already accepts `.cg.json`/`.json` ([createDesignerBridge.ts:165](../../../apps/designer/src/platform/createDesignerBridge.ts#L165)),
`schemaVersion` is already `literal(1)` and migration-ready, and no scene-shape change is needed for D-088.

---

## 2. Decisions

### A. Fate of the OPFS `projects/*` path-model vs native-handle source of truth

- **Current:** disjoint (see §1.4 note). Native handle = SAVE; OPFS path-model = Open/Recent/Landing.
- **Options:** (1) remove the OPFS path-model entirely; (2) keep it ONLY as the no-FS-Access
  fallback (Firefox) + the E2E `MemoryWorkspace` writer; (3) migration-only (read legacy, never write).
- **Recommendation: (2).** Native `FileSystemFileHandle` becomes the source of truth on FS-Access
  browsers (the operators' Chromium/Edge). Keep `ProjectStore.save(path)`/`open(path)` **only** as
  (a) the Firefox/no-`showSaveFilePicker` fallback (preserves today's `triggerJsonDownload`,
  [createDesignerBridge.ts:156](../../../apps/designer/src/platform/createDesignerBridge.ts#L156)) and
  (b) the E2E in-memory path (`CG_E2E`, [workspace.ts:32](../../../apps/designer/src/platform/workspace.ts#L32)).
  Do not delete ProjectStore — removing it breaks Firefox + every E2E. New code path is selected by
  `isFileSystemAccessSupported()`.

### B. Persist `FileSystemFileHandle` in IndexedDB keyed by project id

- **Cloneability:** confirmed — file handles are structured-cloneable exactly like the directory
  handles already stored ([handle-store.ts:1-4](../../../packages/storage/src/handle-store.ts#L1)); no
  serialization. **Permission:** `FileSystemFileHandle` has the same `queryPermission`/`requestPermission`
  as directory handles, so `ensureHandlePermission` ([:56](../../../packages/storage/src/handle-store.ts#L56))
  generalizes directly.
- **Options:** (1) generalize `handle-store` to `FileSystemHandle` + add `saveFileHandle`/`loadFileHandle`/
  `forgetFileHandle`; (2) a separate file-handle module; (3) reuse the same `handles` store with a
  namespaced key.
- **Recommendation: (1)+(3).** Add `saveFileHandle(key, h)`/`loadFileHandle(key)`/`forgetFileHandle(key)`
  to `handle-store.ts`, reusing DB `cg-storage`/store `handles` with key `project-file:<projectId>`;
  widen `ensureHandlePermission` to `FileSystemHandle`. **Permission timing:** the browser drops the
  grant between sessions and `requestPermission` REQUIRES a user gesture — so on **boot** we only
  `loadFileHandle` (no prompt) and `queryPermission` silently; we re-acquire (`requestPermission`)
  **inside the gesture** of the first Save or the open-from-recent click. Never `requestPermission`
  on boot.

### C. Re-key `recent` to handles

- **Current:** path-keyed `{ path, name, templateType, lastOpenedAt }` (§1.8); native handles carry no
  workspace path.
- **Proposed record:** `{ projectId, name, lastSavedAt, handleKey, templateType?, path? }` —
  `handleKey` points at the IndexedDB entry; `path?` retained for legacy/Firefox entries.
- **Open-from-recent flow:** `loadFileHandle(handleKey)` → `ensureHandlePermission` **in the click
  gesture** → read the file (`getFile()` → `text()`) → `SceneSchema.parse` → `setScene` + set the
  in-memory current handle. **Stale/denied/missing handle ⇒ fall back to `showOpenFilePicker`**
  (then re-key the recent entry to the freshly picked handle). Legacy `path`-only entries → the
  existing OPFS `projects.open({path})` flow, upgraded to a handle on next save.
- **Migration:** keep BOTH shapes valid in `RecentEntrySchema` (all new fields optional); branch on
  presence of `handleKey` vs `path`. No destructive rewrite of the KV.
- **Recommendation:** as above (union schema + gesture-time permission + `showOpenFilePicker` fallback).

### D. Dirty = content hash (where it lives, which hash, perf)

- **Location:** `savedHash`/`currentHash` as module-level state in `store-core.ts` alongside `savedScene`
  ([:207](../../../apps/designer/src/renderer/state/store-core.ts#L207)); a new `setSavedHash` mutator
  paired with `setSavedScene`; a new pure `scene-hash.ts` helper.
- **Hash + canonicalization:** a fast structural hash (FNV-1a, 32- or 64-bit) is plenty. **But
  `JSON.stringify` key order is NOT stable** — scenes are spread-built (`{ ...scene, metadata: {…} }`)
  and re-parsed by Zod, so two content-equal scenes can serialize with different key order →
  unstable hash. **Therefore a canonical, recursively sorted-key serialization is required**, and it
  must **exclude `metadata.updatedAt`** (a save side effect, §1.9). `scene-hash.ts` = canonical
  serialize (sorted keys, arrays kept in order, updatedAt dropped) → FNV-1a.
- **Perf — `set()` fires every mutation (many per drag, [:232](../../../apps/designer/src/renderer/state/store-core.ts#L232)):**
  - Option (a) hash-every-`set`: simple, but O(scene) per ~16ms tick on large scenes — wasteful.
  - Option (b) hybrid: keep the **identity fast-path** for the live `dirty` (current behavior, instant),
    and recompute the **canonical hash lazily** on a history boundary (`markHistoryBoundary`/pointerup,
    [TopToolbar.tsx:199](../../../apps/designer/src/renderer/features/shell/TopToolbar.tsx#L199)) or a
    microtask after a burst; if `currentHash === savedHash`, force `dirty=false`.
- **Recommendation: (b) hybrid.** Live `dirty` stays identity-based (cheap, no per-tick hashing). The
  boundary/microtask reconciliation is what makes **edit-then-revert-to-same-content** clear (a fresh
  object whose hash matches the baseline), while **undo-to-saved** already clears via identity
  immediately. Both required behaviors hold:
  - undo back to the saved scene object → `nextScene === savedScene` → dirty=false instantly.
  - edit then revert to identical content → dirty=true until the next boundary, then hash reconcile →
    dirty=false (sub-frame; acceptable).
    `savedHash` is set on load/save next to `savedScene`. This also future-proofs auto-save: the
    debounced `save` reads the same `dirty`/hash.

### E. Tab title (and optional in-app title)

- **Current:** no `document.title` management, no in-app project-name chrome (§1.7, grep empty).
- **Recommendation:** `document.title` is the D-088 surface — `* <scene.name>` when dirty, `<scene.name>`
  when clean, `cg Designer` when no project. Set from a small effect/hook mounted in `App.tsx` (it has
  `scene` and can subscribe to `dirty`). **Optional follow-up:** a visible in-app title+asterisk in
  `TopToolbar` (left of the Home/File menu) — recommend deferring the in-app chrome unless wanted; the
  tab title satisfies the brief.

### F. Guards

- **beforeunload (tab close / refresh):** add `window.addEventListener('beforeunload', e => { if (isDirty) { e.preventDefault(); e.returnValue = ''; } })`
  mounted from `App.tsx`, armed ONLY when `isDirty`. Note: browsers show a **generic** prompt; custom
  text is ignored — document this, don't try to customize.
- **In-app (open / new / close / Home):** the existing `SaveBeforeSwitchModal` + `guardedSwitch` already
  cover these. **The Home fix (the duplicate-modal bug):** Home currently only `setView('landing')`
  ([TopToolbar.tsx:216](../../../apps/designer/src/renderer/features/shell/TopToolbar.tsx#L216)); it must
  actually **CLOSE the project** so the landing page holds no dirty project. **Exact reset:** route Home
  through the same path as `closeProject()` — `designerStore.setScene(null, null)` — which already resets
  scene=null, projectPath=null, **savedScene=null** (`setSavedScene(normalized=null)`,
  [document.ts:45](../../../apps/designer/src/renderer/state/slices/document.ts#L45)), history
  (`resetHistory`), and view='landing'. For D-088, `setScene(null,…)`/a new `closeProject` action MUST
  ALSO clear the new pieces: the in-memory **current file-handle ref** and **`savedHash`/`currentHash`**
  (set both to null/0). After that, `dirty=false` on landing and the guard cannot re-fire.

### G. Fold D-089 (save-button visual) into this change?

- **Current:** SAVE is always `variant="primary"` (blue), gated only on `scene===null`
  ([TopToolbar.tsx:385](../../../apps/designer/src/renderer/features/shell/TopToolbar.tsx#L385)). D-089
  wants SAVE not-blue by default with `border-top: 2px #ffdd40` only when unsaved.
- **Recommendation: FOLD D-089 into D-088.** Same button, same `isDirty` signal — D-088 is what makes
  `isDirty` reliable (hash-based), and D-089 is purely the visual binding of it. Wiring it once avoids a
  throwaway intermediate state and a second pass over the same component. The change is small
  (`TopToolbar.tsx` className + `TopToolbar.css.ts` border-top). Note the dependency in the proposal so
  D-089 can be marked done here.

### H. Existing-data migration

- **Current:** projects in OPFS `projects/*.cg.json` + path-keyed recent entries.
- **Options:** (1) auto-migrate on first run; (2) keep openable via Open/Recent (legacy path flow),
  upgrade lazily on next save; (3) ignore.
- **Recommendation: (2).** A silent handle migration is **impossible** — minting a `FileSystemFileHandle`
  needs a user gesture + the native dialog (no API to convert an OPFS path to a writable on-disk handle).
  So: legacy recent entries (with `path`) stay openable via the existing OPFS flow; the **next Save/Save
  As transparently upgrades** the project to a native handle + a handle-keyed recent entry. Leave OPFS
  bytes intact (non-destructive). Zero-risk, incremental.

---

## 3. File-touch list (implementation — NOT done in STEP-0)

**`@cg/storage`**

- `packages/storage/src/handle-store.ts` — add `saveFileHandle`/`loadFileHandle`/`forgetFileHandle`
  (namespaced keys); widen `ensureHandlePermission` to `FileSystemHandle`.
- `packages/storage/src/index.ts` — re-export the new helpers.
- (tests) `packages/storage/tests/handle-store.test.ts` — round-trip + permission (fake-indexeddb).

**`@cg/shared-ipc`**

- `packages/shared-ipc/src/channels/projects.ts` — extend `RecentEntrySchema` (`projectId`, `lastSavedAt`,
  `handleKey`, make `path`/`templateType` optional); extend `saveDisk`/open responses to carry
  `projectId`/`handleKey`; add an `openDisk` channel (`showOpenFilePicker`).
- `packages/shared-ipc/tests/designer-channels.test.ts` — update for the new shapes.

**Designer platform**

- `apps/designer/src/shared/designer-bridge.ts` — extend `projects.saveDisk` return (`{ ok, filename,
projectId, handleKey }`); add `projects.openDisk()` (handle-carrying open); update `recent` type.
- `apps/designer/src/platform/createDesignerBridge.ts` — `saveDisk`: persist the handle via
  `saveFileHandle(scene.id)`, return `handleKey`; replace `pickJsonFile` open with `showOpenFilePicker`
  (carry handle); record handle-keyed recent; boot: `loadFileHandle` (no prompt); keep Firefox download
  fallback. (`pickJsonFile` either upgraded to a handle picker or removed.)
- `apps/designer/src/platform/ProjectStore.ts` — keep `save(path)`/`open(path)` as fallback + E2E; move
  `recent` recording to the handle model (or a small `ProjectRegistry`); keep path-keyed legacy reads.
- `apps/designer/src/platform/workspace.ts` — likely unchanged (handle store is separate); confirm during impl.

**Store**

- NEW `apps/designer/src/renderer/state/scene-hash.ts` — canonical sorted-key serialization (excluding
  `metadata.updatedAt`) + FNV-1a.
- `apps/designer/src/renderer/state/store-core.ts` — add `savedHash`/`currentHash` + `setSavedHash`;
  hybrid reconcile (boundary/microtask) keeping the identity fast-path; extend `setScene`/add
  `closeProject` to clear handle ref + hashes; expose an `isDirty`/handle accessor.
- `apps/designer/src/renderer/state/slices/document.ts` — `setScene`: also reset hashes + handle ref;
  `markSaved`: also `setSavedHash`; add a `closeProject` action.
- `apps/designer/src/renderer/state/store.ts` — wire the new actions/selectors; (engine doc-sync:
  `state/README.md`).

**Shell / chrome**

- `apps/designer/src/renderer/features/shell/TopToolbar.tsx` — Home → close (`setScene(null,null)` +
  clear handle/hashes); `save()`/`saveAs()` thread handle/projectId + `markSaved`; `openProject` →
  `openDisk`; SAVE button driven by `isDirty` (D-089).
- `apps/designer/src/renderer/features/shell/TopToolbar.css.ts` — D-089 unsaved `border-top: 2px #ffdd40`.
- `apps/designer/src/renderer/features/shell/LandingView.tsx` — recent rows keyed by `projectId`/
  `handleKey`; `openRecent` → handle flow (gesture-time permission) + `showOpenFilePicker` fallback.
- `apps/designer/src/renderer/features/shell/SaveBeforeSwitchModal.tsx` — save via handle; call
  `markSaved` after a successful save.
- `apps/designer/src/renderer/App.tsx` — NEW `document.title` effect + `beforeunload` guard (armed on
  `isDirty`); ideally a small `useDocumentTitle` + `useUnloadGuard` hook, and a single `saveController`
  (store action/hook) both the SAVE button and a future `debounce(save, 2000)` call (auto-save-ready).

**Docs (engine doc-sync, same change):** `state/README.md` (dirty/hash + handle model);
`docs/engines/overview.md` if the persistence seam is described there.

---

## 4. Migration plan

1. **Scene/schema:** none — `schemaVersion` stays `1`; no scene-shape change.
2. **Recent KV:** `RecentEntrySchema` gains optional `projectId`/`handleKey`/`lastSavedAt`; `path`/
   `templateType` become optional. Old entries validate unchanged and open via the legacy OPFS flow;
   they upgrade to handle-keyed on next save. No destructive rewrite.
3. **OPFS bytes:** left in place. Legacy projects remain openable (Open / legacy recent). First Save/
   Save As mints a handle and a handle-keyed recent entry.
4. **Handles:** new IndexedDB keys `project-file:<projectId>` in the existing `cg-storage`/`handles`
   store — additive, no schema bump for IndexedDB (`version 1` unchanged).

---

## 5. Test + E2E plan (map each target behavior → test)

**Unit (vitest):**

- `scene-hash.ts`: equal content (different key order / spread rebuild) ⇒ equal hash; tiny field change
  ⇒ different hash; `metadata.updatedAt` change ⇒ SAME hash (excluded); deep nested (compositions/
  layers/keyframes) covered. _(target: hash stability + canonicalization, decision D)_
- `store-core` dirty: load ⇒ clean; mutate ⇒ dirty; **undo-to-saved ⇒ clean** (identity); **edit-then-
  revert-to-same-content ⇒ clean after boundary** (hash reconcile); `markSaved` ⇒ clean (savedHash
  updated). _(decision D)_
- `handle-store`: `saveFileHandle`/`loadFileHandle` round-trip with `fake-indexeddb`;
  `ensureHandlePermission` granted vs denied (mock `query`/`requestPermission`). _(decision B)_
- recent re-keying: handle-keyed record + read; legacy `path` entry still opens; stale handle ⇒
  `showOpenFilePicker` fallback (bridge-mocked). _(decision C)_
- close/Home: `setScene(null,null)`/`closeProject` clears scene + savedScene + handle ref + hashes ⇒
  `dirty=false`, no re-guard on landing. _(decision F)_
- title helper: `* name` / `name` / `cg Designer`. _(decision E)_

**E2E (Playwright) — with the native-dialog caveat:**

- The harness sets `CG_E2E` → `MemoryWorkspace` + neutralized native pickers
  ([workspace.ts:32](../../../apps/designer/src/platform/workspace.ts#L32)); **`showSaveFilePicker`/
  `showOpenFilePicker` and real `FileSystemFileHandle` permission cannot be driven by Playwright.**
  Native save/open + handle-survives-reload + permission re-acquire are therefore **unit-tested with
  fake-indexeddb + a mocked handle**, plus a documented manual checklist for the real native flow.
- E2E we CAN assert (bridge-stubbed save): edit ⇒ `document.title` shows `*`; save ⇒ `*` cleared; edit ⇒
  SAVE shows the unsaved border, save ⇒ border cleared (D-089); `SaveBeforeSwitchModal` appears on
  Home/New/Open when dirty and NOT when clean; **Home closes the project** — landing shows and clicking
  New/recent does NOT re-show the modal (the duplicate-modal fix, decision F); beforeunload handler is
  registered when dirty (assert registration/flag, not the native prompt).

---

## 6. Top risks

1. **Permission needs a gesture.** Write access cannot be silently restored on boot; Save/open-from-
   recent after reload may re-prompt. Mitigation: only `requestPermission` inside a user gesture; boot
   does load + silent `queryPermission` only.
2. **Hash perf on large scenes during drag.** Mitigation: identity fast-path for live dirty +
   boundary/microtask hash reconcile (never per-tick full hash).
3. **Canonical-serialization correctness.** Unstable key order ⇒ false dirty/clean; must sort keys
   recursively and exclude `metadata.updatedAt`. Pinned by a dedicated hash-stability test.
4. **Two-source-of-truth migration.** OPFS path-model vs handle. Keep OPFS strictly as fallback/E2E;
   legacy entries openable + lazy upgrade; avoid double-write.
5. **E2E gap on the native path.** File pickers/handles aren't automatable in Playwright; risk of an
   under-tested native flow. Mitigate with bridge-level mocks + a manual verification checklist.
6. **`structuredClone` of `FileSystemFileHandle` into IndexedDB.** Confirmed cloneable, but verify on the
   target Chromium and across OPFS-vs-real-FS handle origins.
7. **beforeunload UX.** Generic, non-customizable browser prompt; arm only when `isDirty` to avoid nagging.

---

## 7. STEP-1 implementation notes — the five clarifications (as built)

1. **Write-failure fallback (revised — observed delete-then-save = recreate).** On Chromium,
   deleting the saved file then Save does NOT throw: the browser recreates the file at the same
   handle location (acceptable/expected). The try/catch around the cached-handle write is therefore
   the ERROR path for a write that THROWS — permission revoked, disk error, or an invalid handle:
   `saveDisk` returns `{ ok: false, reason: 'write-failed' }` (catches any throw; the
   `isMissingFileError` NotFound filter was removed so a non-NotFound throw can't escape unhandled),
   and the renderer (`TopToolbar.save` and `SaveBeforeSwitchModal.save`) shows "Couldn't write to
   the file — choose where to save." and retries as Save As.
2. **No-FS-Access fallback tier.** `saveDisk` is: `showSaveFilePicker` handle → else
   `isOpfsSupported()` ⇒ `ProjectStore.save` (OPFS path-model, reopenable via Recent) → else a
   download (insecure / in-memory). This replaced the old always-download fallback.
3. **Dirty-writer contract.** `set()` sets `dirty` optimistically by scene identity
   (`nextScene !== savedScene`; non-scene patches preserve it); `reconcileDirty()` is
   authoritative (`savedHash !== currentHash`) and runs on `markHistoryBoundary` and `markSaved`.
   `setSavedBaseline(scene)` sets BOTH `savedScene` and `savedHash = currentHash` on load/save. No
   per-tick hashing during a drag (the boundary only hashes when optimistically dirty).
4. **Hash.** `state/scene-hash.ts` — FNV-1a over a recursively sorted-key canonical serialization
   of `Scene` with `metadata.updatedAt` removed. Unit-tested for key-order stability and
   updatedAt-exclusion (`tests/scene-hash.test.ts`).
5. **Test split.** E2E in MemoryWorkspace mode (`tests/e2e/desktop-save.spec.ts`) covers the
   title asterisk, SAVE enabled/disabled + the amber `border-top`, the SaveBeforeSwitch guard on
   Home, and the duplicate-modal regression. Unit covers `handle-store` round-trip + permission
   gating (`packages/storage/tests/handle-store.test.ts`, via an in-memory IndexedDB shim — see
   note below), `scene-hash`, and the dirty signal (`tests/store-dirty.test.ts`).

**Deviation from the recon:** the handle-store unit test uses a small **in-memory IndexedDB shim**
rather than `fake-indexeddb` — the latter is not a dependency and adding it (network + lockfile
churn) was avoided to keep the gate self-contained. The shim exercises the same
save/load/forget/namespacing surface; permission gating is tested against a mocked handle.

### Manual checklist — native-picker paths (NOT automatable in Playwright)

Run in a File-System-Access browser (Chromium/Edge) with a real on-disk file:

1. **Save As** a new project → choose a `.cg.json` location → file is written; title loses `*`.
2. **Save** again → writes silently to the same file (no picker); title stays clean.
3. Edit → **reload the tab** → reopen the project from **Recent** → a permission prompt may
   appear (grant) → **Save** writes back to the same file with no new picker.
4. With the project saved, **delete** the file on disk, then **Save** → the browser **recreates**
   it at the same location and writes the scene (no prompt — expected). To exercise the error path,
   make the write THROW (revoke permission, or a read-only / disconnected location) → notice
   "Couldn't write to the file — choose where to save." + Save As dialog.
5. **Recent** with a denied/removed handle → clicking it falls back to the open picker with the
   "That file is unavailable — choose it again." notice (no crash).
6. **Open…** a `.cg.json` via the picker → edit → **Save** writes back to that opened file.
7. Edit, then **close the tab / refresh** → the browser's generic unsaved-changes prompt fires.

## 8. D-093 — Remove from Recent (ships in this PR)

Completes the Recent CRUD this change reshaped and is the first caller of `forgetFileHandle`.
`ProjectStore.forgetRecent({ projectId?, handleKey?, path? })` drops the prefs entry (matched
by project id, legacy by path) and, for a handle-backed entry, calls
`forgetFileHandle(handleKey)`; `clearRecent()` empties the list and forgets every cached
handle. Both are NON-DESTRUCTIVE — the underlying file (disk or OPFS `projects/*.cg.json`) is
never touched, so a removed project re-opens normally via Open / the OPFS path. Exposed as
plain bridge methods (`projects.forgetRecent` / `projects.clearRecent`, no IPC channel).
`LandingView` renders a muted per-row "Remove from recent" (×) control — a list action, a
sibling of the open button (never a destructive file action) — plus a "Clear all recent".
Tests: `tests/project-store-recent.test.ts` (drops entry + forgets handle, OPFS file intact,
persists in the KV, clear-all) and the E2E remove case in `tests/e2e/desktop-save.spec.ts`
(reload-persistence is unit-covered — E2E `MemoryKv` resets on reload).

## 9. Edit-then-revert dirty fix (Case B — add shape → delete it)

Diagnosed empirically: after `add shape → delete it`, `dirty` stayed true because the scene
was NOT byte-identical to the saved baseline — `reconcileDirty` ran correctly, the hashes
genuinely differed. Two pre-existing `removeElement` behaviors D-088's content-hash surfaced:
(1) `addElement` auto-creates a scaffold `Layer 1` for an empty composition and `removeElement`
left it **orphaned** (empty, with a volatile `L<timestamp>` id); (2) `removeElement` materialized
empty `fields:[]` / `bindings:[]` on the composition (absent before).

Fix = delete-restores-canonical-form, two durable parts:

- **Hash normalization** (`scene-hash.ts`): the canonical serialization now drops empty arrays,
  so an absent optional array (e.g. a comp's `fields`/`bindings`) hashes identically to a
  materialized `[]`. Covers ANY code path, not just `removeElement`.
- **Scaffold prune** (`removeElement`): when a removal empties an **untouched auto-created
  scaffold** layer (`isAutoScaffoldLayer`: auto id `L<digits>`, default name/props, not locked,
  no remaining children), the layer is pruned — folded into the SAME `set()` as the removal, so
  delete+prune is ONE atomic undo step. A renamed / customized / still-populated layer is never
  pruned.

`undo()`/`redo()` now also call `reconcileDirty()` so dirty is authoritative after history
navigation (e.g. redo back to the pruned-empty state reads clean). Regression + guard tests:
`tests/store-dirty-revert.test.ts` (add→delete ⇒ clean & hash-matches & scaffold gone; renamed
layer not pruned; sibling layers intact; delete+prune is one undo step that restores shape+layer,
redo re-prunes). The spec's "Editing then reverting to byte-identical content is clean" scenario
is now satisfied by this fix.

## 10. Prompt dirty reconcile after a manual revert (indicator timing)

Follow-up to §9: the amber Save border + `*` lingered after a manual revert until the next
canvas click. `reconcileDirty` only ran at `markHistoryBoundary` (pointer-gesture end), `undo`,
or `redo` — so an edit committed without a canvas pointerup (e.g. an inspector field on
Enter/blur) stayed optimistically dirty until the _next_ interaction.

Fix (hybrid kept; option b): a scene-changing `set()` now schedules a debounced trailing
`reconcileDirty()` (`RECONCILE_SETTLE_MS = 50`) that fires once after the edit burst settles —
so a revert clears the indicator on its own, with no follow-up interaction. It's a debounce:
each scene-changing set reschedules it, so a drag (a set per frame) never reconciles
mid-gesture (no per-tick hashing); `markHistoryBoundary` (and undo/redo) cancel the pending
timer and reconcile synchronously, and `_resetCore` clears it. Skipped during undo/redo (they
reconcile immediately). Regression: `store-dirty-revert.test.ts` ("a manual revert clears dirty
after the settle debounce — no boundary / further interaction", fake timers) and the E2E
"reverting a value clears the dirty indicator without a further click".
