# Desktop-style Save (D-088) + folded Save-button visual (D-089)

## Why

The Designer's persistence is split and lossy. The SAVE button writes through a native
`FileSystemFileHandle` held only **in memory** (lost on reload) and never recorded in
Recent; Open / Recent / Landing use a separate OPFS path-model. Opening a file uses a
hidden `<input type=file>` that yields a `File` with **no handle**, then re-copies it into
OPFS — so "Save" never writes back to the file the operator opened. Dirty is an identity
check that misses edit-then-revert, there is no tab-title or unsaved-changes guard, and
"Home" only switches the view without closing the project (so the picker page re-prompts).

D-088 makes the Designer a real desktop document editor (VS Code / Figma Desktop model):
one on-disk file per project reached through a handle that **survives reload**, a
content-hash dirty signal over the `Scene` only, a tab title + Save control that reflect
dirty, and unsaved-changes guards. D-089 (the Save button's unsaved visual) is folded in
because it is purely the visual binding of the same `isDirty` signal.

## What Changes

- **Native handle is the source of truth.** Save As → `showSaveFilePicker`; the chosen
  `FileSystemFileHandle` is kept for the project and **persisted in IndexedDB keyed by
  project id**. Save writes to it (`createWritable`/`write`/`close`) with no picker;
  no handle ⇒ Save behaves as Save As. After reload, opening the project re-acquires
  write permission **in the click gesture** and Save reuses the same file.
- **Open carries a handle** via `showOpenFilePicker`. The hidden-input path remains ONLY
  as the no-FS-Access fallback (a `File`, no handle → Save routes to the OPFS/download fallback).
- **Tiered fallback** (replaces today's always-download): FS-Access handle → OPFS
  path-model (reopenable via Recent) → download (insecure / in-memory).
- **Dirty = content hash of the document model.** New `scene-hash.ts` (FNV-1a over a
  canonical, recursively sorted-key serialization of `Scene` with `metadata.updatedAt`
  removed). `set()` keeps an optimistic identity dirty; history-boundary + `markSaved`
  reconcile authoritatively via `savedHash !== currentHash`. No per-tick hashing on drag.
- **Tab title + Save visual.** `document.title` = `* <name>` dirty / `<name>` clean /
  `cg Designer` when no project. The Save control is enabled only when dirty, with
  `border-top: 2px solid #ffdd40` when unsaved, and is no longer the always-blue primary
  variant (D-089).
- **Guards.** `beforeunload` prompts on tab-close/refresh when dirty (generic browser text).
  New / Open / Close / Home route through the existing SaveBeforeSwitch modal when dirty;
  **Home now CLOSES the project** (resets scene + saved baseline + handle + hashes), fixing
  the duplicate-modal bug and bringing the code into compliance with the existing
  `designer-shell` "Return to the Landing view" requirement (which already says the scene is cleared).
- **Recent is handle-keyed** — `{ projectId, name, lastSavedAt, handleKey }`. Opening from
  Recent re-acquires permission in the click; stale / denied / file-gone falls back to
  `showOpenFilePicker` with a notice (no crash). Legacy path-keyed entries still open and
  upgrade to a handle on next save.
- **Format unchanged:** `.cg.json`, JSON payload, `schemaVersion` stays `1`.

## Capabilities

### Added Capabilities

- `designer-project-persistence` — the desktop document model: native-handle Save / Save As /
  Open, handle persistence + permission re-acquisition, content-hash dirty, tab title + Save
  visual (D-089), unsaved-changes guards, and handle-keyed Recent with legacy fallback.

## Impact

- **Storage (`@cg/storage`):** `handle-store` gains `saveFileHandle` / `loadFileHandle` /
  `forgetFileHandle`; `ensureHandlePermission` widened to `FileSystemHandle`.
- **Contract (`@cg/shared-ipc`):** `RecentEntrySchema` re-keyed to the handle model (path kept
  optional for legacy). Save/Open native-handle methods stay plain bridge methods (browser
  handles in-process), not IPC channels.
- **Designer platform:** `createDesignerBridge` (handle persistence, `openDisk`, `openRecent`,
  tiered fallback, delete-then-save guard), `ProjectStore` (handle-keyed Recent + OPFS fallback).
- **Store:** new `scene-hash.ts`; `store-core` (hashes + reconcile + close reset); `document`
  slice (`closeProject`, baseline + hash reset); `store` surface.
- **Shell / chrome:** `TopToolbar` (Save visual, Home-closes, Save/Open wiring) + `TopToolbar.css`,
  `LandingView` (handle-keyed Recent), `SaveBeforeSwitchModal` (`markSaved` after save),
  `App` (`document.title` + `beforeunload`).
- **Docs:** `state/README.md` (dirty/hash + handle model).
- No `Scene` schema / store-format change (`schemaVersion` stays `1`).
