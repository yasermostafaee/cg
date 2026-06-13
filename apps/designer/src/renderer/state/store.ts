import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  _resetCore,
  current,
  markHistoryBoundary,
  markSaved,
  redo,
  runAsSingleHistoryEntry,
  subscribe,
  undo,
  type DesignerStoreState,
  type DesignerTool,
  type DesignerView,
  type KeyframeRef,
} from './store-core.js';
import { editSceneOf } from './scene-doc.js';
import { compositionSlice } from './slices/composition.js';
import { documentSlice } from './slices/document.js';
import { elementsSlice } from './slices/elements.js';
import { fieldsSlice, type ElementFieldMetaPatch } from './slices/fields.js';
import { selectionSlice } from './slices/selection.js';
import { timelineSlice } from './slices/timeline.js';
import { viewSlice } from './slices/view.js';

// Re-export the public types + `editSceneOf` so the `state/store` entry surface
// is byte-identical for every consumer (no import-path or symbol changes).
export type { DesignerStoreState, DesignerTool, DesignerView, ElementFieldMetaPatch, KeyframeRef };
export { editSceneOf };

/**
 * Designer renderer state — small pub-sub store with a JSON-patch-ish
 * scene mutation surface. Full undo/redo arrives in M7 alongside the
 * timeline; for M6 every mutation is immediate.
 *
 * Selection is a `Set<elementId>` — multi-select lands by shift-clicking
 * (M6.5's Inspector cares; canvas hit-test in M6.4 only sets single).
 *
 * This entry composes the engine (`store-core.ts`) + shared scene helpers
 * (`scene-doc.ts`) + the domain slices; see `state/README.md`.
 */

export const designerStore = {
  get(): DesignerStoreState {
    return current;
  },

  // Document lifecycle (setScene/setView/notice) + active-doc scene props
  // (duration / active region / lifecycle / playout).
  ...documentSlice,

  // Undo/redo + the history boundary/save markers live in `store-core.ts` — the
  // history engine is welded to `set`'s coalescing and the `dirty` flag.
  undo,
  redo,
  markHistoryBoundary,
  runAsSingleHistoryEntry,
  markSaved,

  // ── Compositions ────────────────────────────────────────────────────────
  // Open/drill, create/rename/duplicate/delete, and cycle-checked nesting.
  ...compositionSlice,

  // View / canvas-aids actions (tool, ruler/snapping, snap + ruler guides).
  ...viewSlice,

  // Element selection + inline-text-edit target.
  ...selectionSlice,

  // Fields & bindings (active-composition fields, scene fonts, the D-018 Data-key
  // convenience layer).
  ...fieldsSlice,

  // Element CRUD (add/patch/transform/lifespan/remove), clipboard ops,
  // deleteSelection, asset cleanup, read helpers.
  ...elementsSlice,

  // Timeline / keyframes (playhead + zoom, keyframe CRUD, keyframe selection +
  // inspector, per-keyframe value/easing/bezier, track-aware commitAnimatable).
  ...timelineSlice,

  // Subscription + the test reset live in `store-core.ts` (they own the listener
  // set + the private singletons).
  subscribe,
  _reset: _resetCore,
} as const;

/**
 * React hook for the whole store. Re-renders on ANY change — including the
 * per-frame `currentFrame` tick during playback. Prefer `useDesignerSelector`
 * so a component only re-renders when the slice it reads actually changes;
 * this whole-store hook is kept for the few places that genuinely need it.
 */
export function useDesignerStore(): DesignerStoreState {
  const [state, setState] = useState(current);
  useEffect(() => designerStore.subscribe(setState), []);
  return state;
}

/**
 * Selector-based subscription. A component re-renders only when its selected
 * slice changes (per `isEqual`, default `Object.is`). This is what keeps
 * playback cheap: panels that don't read `currentFrame` (compositions list,
 * toolbar, status bar, …) stay still while the playhead advances, instead of
 * the whole tree re-rendering on every `set()`.
 *
 * The selected value is cached so `getSnapshot` returns a stable reference
 * when the slice is unchanged — required by `useSyncExternalStore`, and what
 * lets a selector return a fresh object literal (paired with `shallowEqual`)
 * without looping.
 */
export function useDesignerSelector<T>(
  selector: (s: DesignerStoreState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const cache = useRef<{ value: T } | null>(null);
  const getSnapshot = (): T => {
    const next = selector(current);
    const prev = cache.current;
    if (prev !== null && isEqual(prev.value, next)) return prev.value;
    cache.current = { value: next };
    return next;
  };
  return useSyncExternalStore(designerStore.subscribe, getSnapshot, getSnapshot);
}

/** Shallow object equality — compares own enumerable keys with `Object.is`. */
export function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  const ka = Object.keys(a) as (keyof T)[];
  const kb = Object.keys(b) as (keyof T)[];
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.is(a[k], b[k])) return false;
  }
  return true;
}

// Dev-only: expose the store on the global object for tooling (the starter
// preview-capture script and future end-to-end harnesses drive the editor
// through it). Guarded by Vite's DEV flag so it is never present in a
// production build.
if (import.meta.env.DEV) {
  (globalThis as { __cgDesignerStore?: typeof designerStore }).__cgDesignerStore = designerStore;
}
