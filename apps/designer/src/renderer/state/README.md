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

| File                             | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`store-core.ts`](store-core.ts) | **The engine.** Owns the single state object (`current`), the lone writer `set`, the undo/redo history (welded to `set`'s coalescing + the `dirty` flag), `subscribe`, the element **clipboard**, and the toast-notice timer. Exports `current` as a **live binding** + small mutators.                                                                                                                                                                                                                                                        |
| [`scene-doc.ts`](scene-doc.ts)   | **Shared scene helpers** used by many slices: the active-document accessors (`activeLayersOf`/`withActiveLayers`/`activeDocOf`/`withActiveDoc`/`activeFieldData`/`withActiveFieldData`), `locate`, `editSceneOf`, the id generators (`freshCompositionId`/`freshKeyframeId`/`freshElementId`), and the load-time transforms (`ensureCompositions`, `normalizeKeyframeIds`, `reassignIdsDeep`). Pure (except `activeCompId`, which reads `current`).                                                                                            |
| [`off-frame.ts`](off-frame.ts)   | **D-071 export filter (Phase A).** `dropFullyOffFrameForExport` + `isFullyOffFrame` — the EXPORT-ONLY pass `scopeSceneToComposition` runs AFTER the D-086 closure scope: drops fully-off-frame STATIC elements (conservative — animated / under-animated-container / repeater-template / partially-on / edge-touching are KEPT) so off-frame staging shapes don't bloat `.vcg`/HTML/preview. The rendered output is unchanged (they were already clipped invisible). `editSceneOf` (canvas) + Save keep everything, so staging shapes persist. |
| [`store.ts`](store.ts)           | **The composition root.** Imports the engine + scene helpers + every slice, assembles `designerStore` (a `get` + the slice spreads + the history refs + `subscribe`/`_reset`), re-exports the public surface, and defines the React hooks.                                                                                                                                                                                                                                                                                                     |
| [`slices/*.ts`](slices)          | One object per domain (below), each `export const xSlice = { … } as const`, spread into `designerStore`.                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Slice ownership

| Slice                                       | State it owns                                                                  | Actions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`view`](slices/view.ts)                    | `tool`, `rulerVisible`, `snappingEnabled`, `snapGuides`, `guides`              | `setTool`, `toggleRuler`, `toggleSnapping`, `setSnapGuides`, `addGuide`, `setGuidePos`, `removeGuide`                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [`selection`](slices/selection.ts)          | `selection`, `editingTextId`                                                   | `setSelection`, `toggleInSelection`, `setEditingText`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [`document`](slices/document.ts)            | `scene`, `projectPath`, `view`, `notice`                                       | `setScene`, `setView`, `showNotice`, `dismissNotice`, `updateScene`, `setSceneDurationFrames`, `setSceneActiveOut`, `setLifecycle`, `setPlayout`                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [`composition`](slices/composition.ts)      | `activeCompositionId`                                                          | `setActiveComposition`, `openCompositionAndSelect`, `addComposition`, `renameComposition`, `duplicateComposition`, `deleteComposition`, `canNestCompositionInActive`, `addCompositionInstance`                                                                                                                                                                                                                                                                                                                                                                      |
| [`fields`](slices/fields.ts)                | `bindModeFieldId`                                                              | `setBindMode`, `addField`, `addSceneFont`, `updateField`, `removeField`, `addBinding`, `removeBindingAt`, `setElementDataKey`, `setElementFieldMeta` (owns the public `ElementFieldMetaPatch`)                                                                                                                                                                                                                                                                                                                                                                      |
| [`timeline`](slices/timeline.ts)            | `currentFrame`, `timelineZoom`, `selectedKeyframe(s)`, `keyframeInspectorOpen` | `setCurrentFrame`, `setTimelineZoom`, `upsert/move/moveById/removeKeyframe`, `clearKeyframeTrack` (drop a whole track — B-014: a fill/colour mode change that makes a property non-keyframe-able removes its orphaned track), `copyKeyframeTrack` (deep-clone a whole track to another property with fresh keyframe ids — B-015: the border-radius uniform↔per-corner migration), `commitAnimatable`, `writeStaticAnimatable`, `setSelectedKeyframe`, `openKeyframeInspector`, `addKeyframeToSelection`, `closeKeyframeInspector`, `setKeyframeValue/Easing/Bezier` |
| [`elements`](slices/elements.ts)            | (the layer tree, via `scene`; clipboard lives in core)                         | `setElementText`, `addElement`, `updateElement`, `updateTransform`, `updateElementLifespan`, `removeElement`, `deleteSelection`, `applySharedProperty`, `setElementTimelineColor`, `fitElementLifespanToActiveRange`, `removeAssetFromScene`, `copy/cut/paste/duplicateElement`, `hasClipboardElement`, `allElements`                                                                                                                                                                                                                                               |
| _engine_ ([`store-core.ts`](store-core.ts)) | history stacks, clipboard, notice timer, `current`                             | `undo`, `redo`, `markHistoryBoundary`, `runAsSingleHistoryEntry`, `markSaved`, `subscribe`, `_reset`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

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
  `resetHistory` / `setSuppressHistory` / `setSavedBaseline` (used by `setScene`),
  `getClipboard` / `setClipboard`, `getNoticeTimer` / `setNoticeTimer`.

### Note: dirty is a content hash (D-088)

`dirty` answers "does the document model differ from the last save?" — over the
`Scene` only (UI/transient state lives outside `scene`, so it's excluded by
construction), and excluding `metadata.updatedAt` (bumped by saving, not editing).

- **Hash** — [`scene-hash.ts`](scene-hash.ts): FNV-1a over a canonical (recursively
  sorted-key) serialization of `Scene` with `metadata.updatedAt` removed (raw
  `JSON.stringify` key order isn't stable for spread-built / re-parsed scenes).
- **Baseline** — `setSavedBaseline(scene)` records BOTH `savedScene` (identity) and
  `savedHash`/`currentHash`; called on load (`setScene`) and save (`markSaved`).
- **Two-tier signal** — `set()` is OPTIMISTIC: a scene edit toggles `dirty` by
  identity (so undo back to the saved object clears it instantly), a non-scene patch
  preserves it. `reconcileDirty()` is AUTHORITATIVE (`savedHash !== currentHash`) and
  runs on `markHistoryBoundary` (gesture/edit boundary) and `markSaved`. That's what
  clears dirty after **edit-then-revert to identical content** (a fresh object whose
  hash matches the baseline) — without hashing per mutation during a drag.

The on-disk **file handle** is NOT in the store: it lives in the platform bridge
(`createDesignerBridge`) keyed by project id, persisted in IndexedDB (`@cg/storage`
`handle-store`). `closeProject` (Home / Close) resets scene + baseline + hashes via
`setScene(null, null)`; the persisted handle is kept so the project reopens from Recent.

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
A group edit fans out KEYFRAME-AWARE (D-054 — multi == single selection, fanned
out) over the SAME `commitAnimatable` helper the single-element drag uses: a
selected member WITH a track on the property keyframes at the playhead, one WITHOUT
writes its static base. Two callers wrap it:

- **Live gestures** on a number field (drag-scrub / typing) use
  `applySharedPropertyLiveKeyframed(ids, prop, value)` — the fan-out with NO history
  boundary, so live writes time-coalesce into one entry; the field sets ONE boundary
  at the gesture endpoint via an `onCommitBoundary` callback (`markHistoryBoundary`
  on drag release / Enter / blur). The multi number field is the SAME primitive as
  single selection (drag-scrub + live `onChange`, D-053).
- **Discrete commits** (colour pick, solid fill) use
  `applySharedPropertyKeyframed(ids, prop, value)` — the same fan-out wrapped in
  `runAsSingleHistoryEntry` (one undo). A gradient fill (not keyframe-able) writes
  the whole `Fill` via `updateElement`.

The keyframe-FREE primitives `applySharedProperty` (D-041) and
`applySharedPropertyLive` (D-053) are RETAINED as tested store primitives (the
D-054 regression backbone) but the UI now routes through the keyframe-aware pair;
group MOVE on canvas (`beginGroupDrag`) likewise calls `commitAnimatable` per
member. Each shared keyframe-able property (per the D-051 registry `isKeyframeable`
for EVERY selected kind) shows an aggregate keyframe diamond — `empty` / `at-frame`
/ `partial` (the D-054 third `KeyframeIndicator` variant) — whose click toggles
keyframes across the selection in one `runAsSingleHistoryEntry` (`MultiKeyframeDot` /
`toggleGroupKeyframe` in `features/inspector/keyframe-diamond.tsx`).

There is no transaction object — history grouping is the `set`/`COALESCE_MS`
time-coalescing a drag relies on. The single-selection path, `commitAnimatable`,
`togglePropertyKeyframe`, and `upsertKeyframe` are UNCHANGED — D-054 only added
callers. Group move/delete reuse the existing per-element drag/`deleteSelection`
paths.

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
