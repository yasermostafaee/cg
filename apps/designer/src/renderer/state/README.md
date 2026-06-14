# Designer store — engine + domain slices

The Designer's renderer state is a **hand-rolled pub/sub singleton** (no Zustand).
It was one ~2.3k-line file; it's now an **engine** plus **per-domain slices**,
composed back into the same public object. The split is **behaviour-preserving** —
method bodies moved unchanged; only the file they live in differs.

> **Public API is unchanged.** Everything is still imported from
> [`state/store.ts`](store.ts): `designerStore`, `useDesignerSelector`,
> `useDesignerStore`, `editSceneOf`, `shallowEqual`, the types
> (`DesignerStoreState`, `DesignerTool`, `DesignerView`, `KeyframeRef`,
> `ElementFieldMetaPatch`), the `_reset` test hook, and the DEV global
> `__cgDesignerStore`. No component imports changed.

## Files

| File                             | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`store-core.ts`](store-core.ts) | **The engine.** Owns the single state object (`current`), the lone writer `set`, the undo/redo history (welded to `set`'s coalescing + the `dirty` flag), `subscribe`, the element **clipboard**, and the toast-notice timer. Exports `current` as a **live binding** + small mutators.                                                                                                                                                             |
| [`scene-doc.ts`](scene-doc.ts)   | **Shared scene helpers** used by many slices: the active-document accessors (`activeLayersOf`/`withActiveLayers`/`activeDocOf`/`withActiveDoc`/`activeFieldData`/`withActiveFieldData`), `locate`, `editSceneOf`, the id generators (`freshCompositionId`/`freshKeyframeId`/`freshElementId`), and the load-time transforms (`ensureCompositions`, `normalizeKeyframeIds`, `reassignIdsDeep`). Pure (except `activeCompId`, which reads `current`). |
| [`store.ts`](store.ts)           | **The composition root.** Imports the engine + scene helpers + every slice, assembles `designerStore` (a `get` + the slice spreads + the history refs + `subscribe`/`_reset`), re-exports the public surface, and defines the React hooks.                                                                                                                                                                                                          |
| [`slices/*.ts`](slices)          | One object per domain (below), each `export const xSlice = { … } as const`, spread into `designerStore`.                                                                                                                                                                                                                                                                                                                                            |

## Slice ownership

| Slice                                       | State it owns                                                                  | Actions                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`view`](slices/view.ts)                    | `tool`, `rulerVisible`, `snappingEnabled`, `snapGuides`, `guides`              | `setTool`, `toggleRuler`, `toggleSnapping`, `setSnapGuides`, `addGuide`, `setGuidePos`, `removeGuide`                                                                                                                                                                                                                                                                                                           |
| [`selection`](slices/selection.ts)          | `selection`, `editingTextId`                                                   | `setSelection`, `toggleInSelection`, `setEditingText`                                                                                                                                                                                                                                                                                                                                                           |
| [`document`](slices/document.ts)            | `scene`, `projectPath`, `view`, `notice`                                       | `setScene`, `setView`, `showNotice`, `dismissNotice`, `updateScene`, `setSceneDurationFrames`, `setSceneActiveOut`, `setLifecycle`, `setPlayout`                                                                                                                                                                                                                                                                |
| [`composition`](slices/composition.ts)      | `activeCompositionId`                                                          | `setActiveComposition`, `openCompositionAndSelect`, `addComposition`, `renameComposition`, `duplicateComposition`, `deleteComposition`, `canNestCompositionInActive`, `addCompositionInstance`                                                                                                                                                                                                                  |
| [`fields`](slices/fields.ts)                | `bindModeFieldId`                                                              | `setBindMode`, `addField`, `addSceneFont`, `updateField`, `removeField`, `addBinding`, `removeBindingAt`, `setElementDataKey`, `setElementFieldMeta` (owns the public `ElementFieldMetaPatch`)                                                                                                                                                                                                                  |
| [`timeline`](slices/timeline.ts)            | `currentFrame`, `timelineZoom`, `selectedKeyframe(s)`, `keyframeInspectorOpen` | `setCurrentFrame`, `setTimelineZoom`, `upsert/move/moveById/removeKeyframe`, `clearKeyframeTrack` (drop a whole track — B-014: a fill/colour mode change that makes a property non-keyframe-able removes its orphaned track), `commitAnimatable`, `writeStaticAnimatable`, `setSelectedKeyframe`, `openKeyframeInspector`, `addKeyframeToSelection`, `closeKeyframeInspector`, `setKeyframeValue/Easing/Bezier` |
| [`elements`](slices/elements.ts)            | (the layer tree, via `scene`; clipboard lives in core)                         | `setElementText`, `addElement`, `updateElement`, `updateTransform`, `updateElementLifespan`, `removeElement`, `deleteSelection`, `applySharedProperty`, `setElementTimelineColor`, `fitElementLifespanToActiveRange`, `removeAssetFromScene`, `copy/cut/paste/duplicateElement`, `hasClipboardElement`, `allElements`                                                                                           |
| _engine_ ([`store-core.ts`](store-core.ts)) | history stacks, clipboard, notice timer, `current`                             | `undo`, `redo`, `markHistoryBoundary`, `runAsSingleHistoryEntry`, `markSaved`, `subscribe`, `_reset`                                                                                                                                                                                                                                                                                                            |

## How it holds together (mechanism: live ES-module bindings)

The whole split rests on one ES-module property: **an imported `let` is a live
binding.** `store-core.ts` does `export let current`, and only the engine ever
reassigns it (inside `set` / `_resetCore`). Every slice does
`import { current, set } from '../store-core.js'`, so it always **reads the latest
state** and **writes through the single `set`** — exactly as when it all lived in
one file. That's why the method bodies are byte-for-byte unchanged.

- **Reads** → the live `current` binding.
- **Writes** → the one `set` in core (history-coalescing + `dirty` + notify, unchanged).
- **Sibling calls** (cross-slice, e.g. `deleteSelection` → `removeKeyframe`,
  `commitAnimatable` → `updateTransform`, `addComposition` → `setActiveComposition`)
  → resolved through the assembled `designerStore`, which each slice imports from
  [`store.ts`](store.ts). This is a deliberate **`store.ts` ↔ slice import cycle**:
  it's legal in ESM because the reference is only used at **call time** (never at
  module-eval time), and Vite/Vitest handle it. If it ever bites (a TDZ error at
  load), the per-slice unit gate + E2E catch it immediately.
- **Singleton reassignment from a slice** (which an imported binding can't do —
  you can only reassign in the owning module) goes through core mutators:
  `resetHistory` / `setSuppressHistory` / `setSavedScene` (used by `setScene`),
  `getClipboard` / `setClipboard`, `getNoticeTimer` / `setNoticeTimer`.

### Note: clipboard lives in the engine

The element **clipboard** (`copy`/`cut`/`paste`) is logically an _elements_-domain
concern, but it lives in `store-core.ts` for simplicity: it's a transient
module-level cache (not part of the scene or undo history), and the `_reset` test
hook clears it alongside the history in one place. The elements slice reaches it
through `getClipboard` / `setClipboard`. (Same story for the toast-notice timer,
used by the document slice.)

### Note: the selection set drives multi-select (D-041)

`selection` is a `ReadonlySet<string>` — multi-select is the renderer **consuming
the whole set** instead of collapsing to `size === 1`. `setSelection(ids[])`
replaces; `toggleInSelection(id)` adds/removes one (shift/ctrl-click on the canvas
and the timeline rows share this single path, so both surfaces reflect one set).
The inspector branches on `selection.size` (0 scene / 1 `StyleSection` / >1 the
`MultiSelectSection`); the **shared-property intersection** seam is a pure helper
([`features/inspector/shared-properties.ts`](../features/inspector/shared-properties.ts))
that intersects each selected kind's editable-descriptor set and flags
agree-vs-mixed. Those descriptors are now **generated from the central field
registry** ([`features/inspector/field-registry.ts`](../features/inspector/field-registry.ts),
D-051) — the single source of keyframe-ability + inspector-field presence that the
single inspector and the timeline also read, so the old "mirror `StyleSection.tsx`
by hand / keep both in sync" tech debt is gone.
A group edit fans out over one of two **keyframe-free** base-write paths
(`writeStaticAnimatable`, NOT `commitAnimatable` which would keyframe a tracked
property):

- **Discrete commits** (colour pick, gradient apply) use
  `applySharedProperty(ids, prop, value)` — the fan-out wrapped in
  `runAsSingleHistoryEntry` (a leading+trailing `markHistoryBoundary`) so the
  whole one-shot is ONE undo entry.
- **Continuous gestures** on a number field (drag-scrub / typing) use
  `applySharedPropertyLive(ids, prop, value)` (D-053) — the SAME fan-out but with
  NO history boundary, so consecutive live writes time-coalesce into one entry
  exactly like the single-element drag. The multi number field is now the SAME
  primitive as single selection (drag-scrub + live `onChange`); it sets ONE
  boundary at the gesture endpoint via an `onCommitBoundary` callback
  (`markHistoryBoundary` on drag release / Enter / blur), so the whole burst is one
  undo entry isolated from the next edit. This supersedes D-050's deferred
  commit-on-blur (`RealtimeNumberInput commitMode='blur'`, drag removed), which
  spawned one entry per keystroke when wired through the boundary-wrapped path.

There is no transaction object — history grouping is the `set`/`COALESCE_MS`
time-coalescing a drag relies on. Group editing stays keyframe-free (diamonds +
keyframe-aware group move are D-054). Group move/delete reuse the existing
per-element drag/`deleteSelection` paths.

## Adding to the store

- **A new action on an existing domain** → add the method to that slice's object.
  Read `current`, write via `set`; call siblings via `designerStore`.
- **New state** → add the field to `DesignerStoreState` + `initialState` in
  [`store-core.ts`](store-core.ts), then the actions that drive it to the owning slice.
- **A whole new domain** → add `slices/<domain>.ts` exporting `xSlice`, import it in
  [`store.ts`](store.ts), and spread it into `designerStore`.
- **A shared scene helper** used by more than one slice → put it in
  [`scene-doc.ts`](scene-doc.ts), not in a slice (avoids slice→slice imports).

Keep the public surface in [`store.ts`](store.ts) byte-identical (re-export new
public types there), and grow the store-\* unit tests + the Playwright E2E with any
behaviour change (the store touches everything, so the E2E suite is the real net).
