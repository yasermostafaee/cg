# Rename the open project — inline edit on the TopToolbar name (D-127)

## Why

The project name is visible in the global top bar but is not editable after creation, so a mistaken
or default name (typed once into the New Project modal) is stuck for the life of the project. The
only escape today is Save As — which changes the FILE name, not the document's display name. Renaming
an open document is a basic editor affordance (Figma, VS Code) that the Designer simply lacks.

## What Changes

- **The centered project name in the TopToolbar becomes editable on DOUBLE-CLICK** — it swaps in
  place to a focused text input, seeded with the current name and with the text SELECTED, so typing
  replaces it. Commit on **Enter** or **blur**; cancel on **Escape** (previous name restored, no
  store write).
- **A File → "Rename Project…" entry** triggers the EXACT SAME inline edit on the TopToolbar name
  (one affordance, two entry points — they share a single `renaming` flag). The entry is disabled
  when no project is open.
- **A new `renameProject(name)` action on the document slice** writes the SCENE-ROOT `name`. It does
  NOT go through `updateScene({ name })`: `'name'` is one of `updateScene`'s `docKeys`, so with a
  composition active that patch is routed to the ACTIVE COMPOSITION and renames _that_, not the
  project. `renameProject` targets the scene root unconditionally, through the normal `set()` path,
  so undo and the dirty flag work exactly as for any other edit.
- **The in-progress text is held in LOCAL component state** and written to the store ONCE on commit
  — one undo entry per rename (a per-keystroke write would push several history entries through
  `set()`'s 300 ms coalescing window).
- **Empty / whitespace-only input is rejected** on commit: the previous name is kept, no store write,
  no undo entry.

Rename changes ONLY the internal display name (`scene.name`). It does **not** rename the on-disk file
— the D-088 `FileSystemFileHandle` is untouched; Save As remains the way to get a different filename.

## Impact

- **UI-only, export-neutral.** No schema change (`scene.name` already exists), no runtime change, no
  exporter change — `scene.name` is display metadata.
- The browser tab title follows for free: it is keyed off `scene?.name` in `App.tsx`.
- The document correctly becomes dirty: `hashScene()` hashes the whole scene minus
  `metadata.updatedAt`, so the top-level `name` is in the content hash and SAVE enables.
- Affected specs: `designer-shell` (TopToolbar + File menu).
- Affected code: `apps/designer/src/renderer/state/slices/document.ts`,
  `apps/designer/src/renderer/features/shell/TopToolbar.tsx` (+ `TopToolbar.css.ts`).
