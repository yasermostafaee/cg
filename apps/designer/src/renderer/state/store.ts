import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type {
  AnimatableProperty,
  Composition,
  DynamicField,
  Easing,
  Element,
  ElementAnimation,
  FieldBinding,
  Keyframe,
  Layer,
  Playout,
  Scene,
} from '@cg/shared-schema';
import {
  activeRangeOf,
  playoutOf,
  migrateGlobalFieldsToCompositions,
  uniqueInstanceName,
  compositionInstancesOf,
} from '@cg/shared-schema';
import {
  _resetCore,
  current,
  getClipboard,
  getNoticeTimer,
  markHistoryBoundary,
  markSaved,
  redo,
  resetHistory,
  set,
  setClipboard,
  setNoticeTimer,
  setSavedScene,
  setSuppressHistory,
  subscribe,
  undo,
  type DesignerStoreState,
  type DesignerTool,
  type DesignerView,
  type KeyframeRef,
} from './store-core.js';
import {
  activeCompId,
  activeDocOf,
  activeFieldData,
  activeLayersOf,
  editSceneOf,
  locate,
  withActiveDoc,
  withActiveFieldData,
  withActiveLayers,
} from './scene-doc.js';

// Re-export the public types + `editSceneOf` so the `state/store` entry surface
// is byte-identical for every consumer (no import-path or symbol changes).
export type { DesignerStoreState, DesignerTool, DesignerView, KeyframeRef };
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

function freshCompositionId(): string {
  return `comp-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`;
}

/**
 * Normalise a loaded project to the composition model (no "main scene"). If it
 * already has compositions, open the first. Otherwise, if the legacy root has
 * any layers, migrate them into one composition and open it. A genuinely empty
 * project gets no compositions and opens to the empty state. Returns the
 * (possibly rewritten) scene and the composition to open.
 */
function ensureCompositions(scene: Scene): { scene: Scene; activeId: string | null } {
  const comps = scene.compositions ?? [];
  if (comps.length > 0) {
    // D-025 — distribute any legacy GLOBAL fields/bindings into the owning comps.
    const next = migrateGlobalFieldsToCompositions({ ...scene, layers: [] });
    return { scene: next, activeId: comps[0]?.id ?? null };
  }
  const rootLayers = Array.isArray(scene.layers) ? scene.layers : [];
  if (rootLayers.length > 0) {
    const comp: Composition = {
      id: freshCompositionId(),
      name: scene.name === '' ? 'comp1' : scene.name,
      resolution: scene.resolution,
      frameRange: scene.frameRange,
      ...(scene.activeRange !== undefined ? { activeRange: scene.activeRange } : {}),
      background: scene.background,
      layers: rootLayers,
      fields: [],
      bindings: [],
    };
    // Move the root's global fields/bindings into the migrated composition.
    const next = migrateGlobalFieldsToCompositions({
      ...scene,
      compositions: [comp],
      layers: [],
    });
    return { scene: next, activeId: comp.id };
  }
  return { scene: { ...scene, compositions: [], layers: [] }, activeId: null };
}

/** Collect the composition ids referenced by `composition` elements in a layer tree. */
function collectCompRefs(children: readonly Element[], out: Set<string>): void {
  for (const el of children) {
    if (el.type === 'composition') out.add(el.compositionId);
    else if (el.type === 'container') collectCompRefs(el.children, out);
  }
}

/** Direct composition references made by a given composition id (or the main scene when null). */
function directRefsOf(scene: Scene, compId: string | null): Set<string> {
  const out = new Set<string>();
  const layers =
    compId === null
      ? scene.layers
      : (scene.compositions?.find((c) => c.id === compId)?.layers ?? []);
  for (const layer of layers) collectCompRefs(layer.children, out);
  return out;
}

/**
 * Whether placing an instance of `childId` inside `parentId` (null = main
 * scene) is allowed — i.e. it would NOT create a cycle. A cycle exists if the
 * child is the parent itself, or the child can already reach the parent through
 * the composition-reference graph. (Loopic permits this and loops forever; we
 * forbid it.)
 */
function canNestComposition(scene: Scene, parentId: string | null, childId: string): boolean {
  if (childId === parentId) return false;
  if (parentId === null) return true; // the main scene is never referenced by anyone
  // BFS from the child following its references; reaching the parent = cycle.
  const seen = new Set<string>();
  const queue = [childId];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === undefined || seen.has(cur)) continue;
    seen.add(cur);
    if (cur === parentId) return false;
    for (const ref of directRefsOf(scene, cur)) queue.push(ref);
  }
  return true;
}

/**
 * Apply an immutable transform to the located element's `animation` field.
 * If the result has zero tracks, the field is removed entirely so that the
 * scene-graph doesn't carry empty `animation: { tracks: {} }` shells.
 */
function mutateAnimation(
  elementId: string,
  patch: (anim: ElementAnimation) => ElementAnimation,
): void {
  if (current.scene === null) return;
  const found = locate(current.scene, elementId);
  if (found === null) return;
  const { layer, layerIdx, elIdx } = found;
  const existing = layer.children[elIdx];
  if (existing === undefined) return;
  const base: ElementAnimation = existing.animation ?? { tracks: {} };
  const next = patch(base);
  let merged: Element;
  if (Object.keys(next.tracks).length === 0) {
    const { animation: _omit, ...rest } = existing;
    void _omit;
    merged = rest as Element;
  } else {
    merged = { ...existing, animation: next } as Element;
  }
  const nextChildren = [...layer.children];
  nextChildren[elIdx] = merged;
  const nextLayer: Layer = { ...layer, children: nextChildren };
  const nextLayers = [...activeLayersOf(current.scene)];
  nextLayers[layerIdx] = nextLayer;
  set({ scene: withActiveLayers(current.scene, nextLayers) });
}

/**
 * D-018 — high-level patch for the field backing a text element's Data key.
 * The store maps it onto the discriminated `DynamicField` union (handling the
 * text ↔ multiline ↔ number variant switch) so the inspector stays declarative.
 */
export interface ElementFieldMetaPatch {
  title?: string;
  description?: string;
  required?: boolean;
  fieldType?: 'text' | 'number';
  multiline?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: string | number;
}

/**
 * Default `maxLength` for a field created via the Data-key convenience layer —
 * a sensible cap for broadcast text that also engages the element's auto-size /
 * auto-squeeze when an operator sends an over-long value. Editable per field in
 * the inspector (set 0 to clear).
 */
const DEFAULT_DATA_FIELD_MAX_LENGTH = 100;

/** Coerce any field `default` to a string (for the text/multiline variants). */
function defaultAsString(field: DynamicField): string {
  if (field.type === 'image') return '';
  return typeof field.default === 'string' ? field.default : String(field.default);
}

/**
 * Rebuild the dynamic field backing a Data key from a high-level meta patch,
 * producing a valid variant for the selected `fieldType`/`multiline` and
 * coercing `default` to that variant. Length/pattern constraints carry forward
 * where the target variant supports them; a 0 / empty value clears them.
 */
function rebuildField(field: DynamicField, patch: ElementFieldMetaPatch): DynamicField {
  const label = patch.title ?? field.label;
  const required = patch.required ?? field.required;
  const description = patch.description ?? field.description;
  const base = {
    id: field.id,
    label,
    required,
    ...(field.group !== undefined ? { group: field.group } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  };

  const fieldType = patch.fieldType ?? (field.type === 'number' ? 'number' : 'text');
  const multiline = patch.multiline ?? field.type === 'multiline';

  if (fieldType === 'number') {
    const cur = field.type === 'number' ? field.default : Number(defaultAsString(field));
    const raw = patch.default !== undefined ? Number(patch.default) : cur;
    const next = Number.isFinite(raw) ? raw : 0;
    return {
      ...base,
      type: 'number',
      default: next,
      ...(field.type === 'number' && field.min !== undefined ? { min: field.min } : {}),
      ...(field.type === 'number' && field.max !== undefined ? { max: field.max } : {}),
      ...(field.type === 'number' && field.step !== undefined ? { step: field.step } : {}),
      ...(field.type === 'number' && field.unit !== undefined ? { unit: field.unit } : {}),
    };
  }

  const def = patch.default !== undefined ? String(patch.default) : defaultAsString(field);
  const curMin = field.type === 'text' || field.type === 'multiline' ? field.minLength : undefined;
  const curPattern =
    field.type === 'text' || field.type === 'multiline' ? field.pattern : undefined;
  const curMax = field.type === 'text' ? field.maxLength : undefined;
  const rawMin = patch.minLength ?? curMin;
  const minLength = rawMin !== undefined && rawMin > 0 ? Math.floor(rawMin) : undefined;
  const rawMax = patch.maxLength ?? curMax;
  const maxLength = rawMax !== undefined && rawMax > 0 ? Math.floor(rawMax) : undefined;
  const rawPattern = patch.pattern ?? curPattern;
  const pattern = rawPattern !== undefined && rawPattern.trim() !== '' ? rawPattern : undefined;

  if (multiline) {
    return {
      ...base,
      type: 'multiline',
      default: def,
      ...(field.type === 'multiline' && field.maxLines !== undefined
        ? { maxLines: field.maxLines }
        : {}),
      ...(minLength !== undefined ? { minLength } : {}),
      ...(pattern !== undefined ? { pattern } : {}),
    };
  }
  return {
    ...base,
    type: 'text',
    default: def,
    ...(minLength !== undefined ? { minLength } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...(pattern !== undefined ? { pattern } : {}),
    ...(field.type === 'text' && field.direction !== undefined
      ? { direction: field.direction }
      : {}),
  };
}

/** A stable per-keyframe id (used for React keys, drag tracking, stacking). */
function freshKeyframeId(): string {
  return `kf-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`;
}

/**
 * Ensure every keyframe carries an `id`. Scenes authored before the id field
 * (or starter templates) load without ids; assigning them on load means the
 * timeline can always track/stack points reliably. The runtime ignores ids.
 */
function normalizeKeyframeIds(scene: Scene): Scene {
  if (!Array.isArray(scene.layers)) return scene;
  function fixEl(el: Element): Element {
    let next = el;
    if (el.animation !== undefined) {
      const tracks = el.animation.tracks;
      const nextTracks: ElementAnimation['tracks'] = {};
      for (const key of Object.keys(tracks) as AnimatableProperty[]) {
        const track = tracks[key];
        if (track === undefined) continue;
        nextTracks[key] = {
          keyframes: track.keyframes.map((k) =>
            k.id === undefined ? { ...k, id: freshKeyframeId() } : k,
          ),
        };
      }
      next = { ...next, animation: { tracks: nextTracks } } as Element;
    }
    if (next.type === 'container') {
      next = { ...next, children: next.children.map(fixEl) } as Element;
    }
    return next;
  }
  return { ...scene, layers: scene.layers.map((l) => ({ ...l, children: l.children.map(fixEl) })) };
}

/** A short unique element id in the `el-…` convention used across the app. */
function freshElementId(): string {
  return `el-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`;
}

/**
 * Deep-clone an element, assigning a fresh id to it and (recursively) to
 * every nested container child, so a pasted / duplicated subtree never
 * collides with the original ids. The element's name gets a " copy" suffix.
 */
function cloneElementWithNewIds(el: Element): Element {
  const base = structuredClone(el) as Element;
  base.id = freshElementId();
  base.name = `${el.name} copy`;
  if (base.type === 'container') {
    base.children = base.children.map(reassignIdsDeep);
  }
  return base;
}

/** Like cloneElementWithNewIds but keeps the name (for nested children). */
function reassignIdsDeep(el: Element): Element {
  const next = { ...el, id: freshElementId() } as Element;
  if (next.type === 'container') {
    next.children = next.children.map(reassignIdsDeep);
  }
  return next;
}

/**
 * Insert `el` into `layerIdx` at array position `pos`, optionally making it
 * the sole selection. No-op when the scene or target layer is missing.
 */
function insertElementAt(layerIdx: number, pos: number, el: Element, select: boolean): void {
  if (current.scene === null) return;
  const layers = activeLayersOf(current.scene);
  const layer = layers[layerIdx];
  if (layer === undefined) return;
  const nextChildren = [...layer.children];
  nextChildren.splice(Math.max(0, Math.min(nextChildren.length, pos)), 0, el);
  const nextLayer: Layer = { ...layer, children: nextChildren };
  const nextLayers = [...layers];
  nextLayers[layerIdx] = nextLayer;
  set({
    scene: withActiveLayers(current.scene, nextLayers),
    ...(select ? { selection: new Set([el.id]) } : {}),
  });
}

function sameKeyframeRef(a: KeyframeRef, b: KeyframeRef): boolean {
  return a.elementId === b.elementId && a.property === b.property && a.frame === b.frame;
}

/**
 * Structural equality for two binding targets — they identify the same wire when
 * every field matches (kind, elementId, and any discriminant-specific keys like
 * `property` / `placeholder` / `layer` / `prop`). The target objects are flat and
 * hold only primitives, so a key-by-key compare is exact. Used to dedupe
 * field→target bindings (B-008).
 */
function sameBindingTarget(a: FieldBinding['target'], b: FieldBinding['target']): boolean {
  const ak = Object.keys(a) as (keyof typeof a)[];
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}

/** After a keyframe moves frame, keep the selection (primary + set) pointing at it. */
function syncSelectionAfterMove(
  elementId: string,
  property: AnimatableProperty,
  fromFrame: number,
  toFrame: number,
): void {
  const matches = (r: KeyframeRef): boolean =>
    r.elementId === elementId && r.property === property && r.frame === fromFrame;
  const sk = current.selectedKeyframe;
  if (sk === null && current.selectedKeyframes.length === 0) return;
  const moved: KeyframeRef = { elementId, property, frame: toFrame };
  set({
    selectedKeyframe: sk !== null && matches(sk) ? moved : sk,
    selectedKeyframes: current.selectedKeyframes.map((r) => (matches(r) ? moved : r)),
  });
}

export const designerStore = {
  get(): DesignerStoreState {
    return current;
  },

  setScene(scene: Scene | null, projectPath: string | null): void {
    resetHistory();
    setClipboard(null);
    setSuppressHistory(true);
    // Normalise to the composition model (migrate legacy root layers → a comp)
    // and open the first composition, if any.
    let activeId: string | null = null;
    let normalized: Scene | null = null;
    if (scene !== null) {
      const ensured = ensureCompositions(normalizeKeyframeIds(scene));
      normalized = ensured.scene;
      activeId = ensured.activeId;
    }
    // A freshly loaded/closed project starts clean — nothing to save yet.
    setSavedScene(normalized);
    try {
      set({
        scene: normalized,
        projectPath,
        activeCompositionId: activeId,
        view: scene === null ? 'landing' : 'studio',
        selection: new Set<string>(),
        selectedKeyframe: null,
        selectedKeyframes: [],
        keyframeInspectorOpen: false,
        currentFrame: 0,
        snapGuides: { x: [], y: [] },
        guides: { x: [], y: [] },
      });
    } finally {
      setSuppressHistory(false);
    }
  },

  // Undo/redo + the history boundary/save markers live in `store-core.ts` — the
  // history engine is welded to `set`'s coalescing and the `dirty` flag.
  undo,
  redo,
  markHistoryBoundary,
  markSaved,

  /** Explicitly switch top-level view (used by "back to projects"). */
  setView(view: DesignerView): void {
    if (view === current.view) return;
    set({ view });
  },

  /** Show a transient toast notice (auto-clears). Replaces any current one. */
  showNotice(message: string): void {
    const t = getNoticeTimer();
    if (t !== null) clearTimeout(t);
    set({ notice: message });
    setNoticeTimer(
      setTimeout(() => {
        setNoticeTimer(null);
        set({ notice: null });
      }, 5000) as unknown as number,
    );
  },

  /** Dismiss the current toast notice immediately. */
  dismissNotice(): void {
    const t = getNoticeTimer();
    if (t !== null) {
      clearTimeout(t);
      setNoticeTimer(null);
    }
    if (current.notice !== null) set({ notice: null });
  },

  // ── Compositions ────────────────────────────────────────────────────────

  /**
   * Open a composition for editing (null = the main scene). The canvas,
   * timeline and transport follow the active document; selection + keyframe
   * selection are cleared and the playhead resets to the doc's start.
   */
  setActiveComposition(id: string | null): void {
    if (current.scene === null) return;
    if (id === current.activeCompositionId) return;
    if (id !== null && current.scene.compositions?.some((c) => c.id === id) !== true) return;
    const doc = id === null ? current.scene : current.scene.compositions?.find((c) => c.id === id);
    set({
      activeCompositionId: id,
      selection: new Set<string>(),
      selectedKeyframe: null,
      selectedKeyframes: [],
      keyframeInspectorOpen: false,
      currentFrame: doc?.frameRange.in ?? 0,
    });
  },

  /**
   * D-024 — drill into a nested child composition AND select a shape inside it, in
   * one atomic step (double-click on a composition instance). Exactly equivalent to
   * opening `childId` from the compositions list (`setActiveComposition`) plus
   * selecting `shapeId` — navigation + selection only, no new edit semantics, no
   * per-instance overrides (editing the shape edits the shared child definition).
   * `shapeId` null leaves nothing selected (the click landed on empty child space).
   * No-op if `childId` isn't a known composition.
   */
  openCompositionAndSelect(childId: string, shapeId: string | null): void {
    if (current.scene === null) return;
    const child = current.scene.compositions?.find((c) => c.id === childId);
    if (child === undefined) return;
    set({
      activeCompositionId: childId,
      selection: shapeId !== null ? new Set<string>([shapeId]) : new Set<string>(),
      selectedKeyframe: null,
      selectedKeyframes: [],
      keyframeInspectorOpen: false,
      currentFrame: child.frameRange.in,
    });
  },

  /**
   * Create a new empty composition (inheriting the main scene's size /
   * frame-rate / duration) and open it. Returns the new composition id.
   */
  addComposition(): string | null {
    if (current.scene === null) return null;
    const existing = current.scene.compositions ?? [];
    const id = freshCompositionId();
    const n = existing.length + 1;
    const span = current.scene.frameRange.out - current.scene.frameRange.in;
    const comp: Composition = {
      id,
      name: `comp${String(n)}`,
      resolution: { ...current.scene.resolution },
      frameRange: { in: 0, out: Math.max(1, span) },
      background: 'transparent',
      layers: [],
    };
    set({ scene: { ...current.scene, compositions: [...existing, comp] } });
    designerStore.setActiveComposition(id);
    return id;
  },

  /** Rename a composition. No-op for an unknown id. */
  renameComposition(id: string, name: string): void {
    if (current.scene === null) return;
    const comps = current.scene.compositions ?? [];
    if (!comps.some((c) => c.id === id)) return;
    set({
      scene: {
        ...current.scene,
        compositions: comps.map((c) => (c.id === id ? { ...c, name } : c)),
      },
    });
  },

  /**
   * Duplicate a composition (deep clone with fresh composition + element ids).
   * The copy is appended to the registry but not opened.
   */
  duplicateComposition(id: string): string | null {
    if (current.scene === null) return null;
    const comps = current.scene.compositions ?? [];
    const src = comps.find((c) => c.id === id);
    if (src === undefined) return null;
    const newId = freshCompositionId();
    const clone: Composition = {
      ...structuredClone(src),
      id: newId,
      name: `${src.name} copy`,
      layers: src.layers.map((l) => ({
        ...structuredClone(l),
        id: `L${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`,
        children: l.children.map(reassignIdsDeep),
      })),
    };
    set({ scene: { ...current.scene, compositions: [...comps, clone] } });
    return newId;
  },

  /**
   * Delete a composition and strip any `composition` elements that referenced
   * it (across the main scene and every other composition). If the deleted
   * composition was open, fall back to the main scene.
   */
  deleteComposition(id: string): void {
    if (current.scene === null) return;
    const comps = current.scene.compositions ?? [];
    if (!comps.some((c) => c.id === id)) return;
    const stripRefs = (children: readonly Element[]): Element[] => {
      const out: Element[] = [];
      for (const el of children) {
        if (el.type === 'composition' && el.compositionId === id) continue;
        if (el.type === 'container') out.push({ ...el, children: stripRefs(el.children) });
        else out.push(el);
      }
      return out;
    };
    const cleanLayers = (layers: readonly Layer[]): Layer[] =>
      layers.map((l) => ({ ...l, children: stripRefs(l.children) }));
    const nextComps = comps
      .filter((c) => c.id !== id)
      .map((c) => ({ ...c, layers: cleanLayers(c.layers) }));
    const goMain = current.activeCompositionId === id;
    set({
      scene: {
        ...current.scene,
        layers: cleanLayers(current.scene.layers),
        compositions: nextComps,
      },
      ...(goMain
        ? {
            activeCompositionId: null,
            selection: new Set<string>(),
            selectedKeyframe: null,
            selectedKeyframes: [],
            keyframeInspectorOpen: false,
          }
        : {}),
    });
  },

  /** Whether an instance of `childId` may be placed in the active document. */
  canNestCompositionInActive(childId: string): boolean {
    if (current.scene === null) return false;
    return canNestComposition(current.scene, current.activeCompositionId, childId);
  },

  /**
   * Place an instance of composition `childId` into the active document as a
   * new layer element (a reference — the child's own layers are NOT copied).
   * Refuses (returns false) if it would create a cycle. `at` is the optional
   * scene-space drop point for the instance's top-left.
   */
  addCompositionInstance(childId: string, at?: { x: number; y: number }): boolean {
    if (current.scene === null) return false;
    const child = current.scene.compositions?.find((c) => c.id === childId);
    if (child === undefined) return false;
    if (!canNestComposition(current.scene, current.activeCompositionId, childId)) return false;
    // D-025 — the instance name is the field namespace, so it must be unique among
    // the active doc's instances (default to the child name, then "name 2", …).
    const takenNames = compositionInstancesOf({ layers: activeLayersOf(current.scene) }).map(
      (i) => i.name,
    );
    const el: Element = {
      id: freshElementId(),
      name: uniqueInstanceName(child.name, takenNames),
      type: 'composition',
      compositionId: childId,
      transform: {
        position: { x: at?.x ?? 0, y: at?.y ?? 0 },
        size: { w: child.resolution.width, h: child.resolution.height },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0, y: 0 },
      },
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
    };
    designerStore.addElement(el);
    return true;
  },

  /**
   * Merge a shallow patch onto the active scene (background, name,
   * frameRange, etc.). The scene reference is replaced so React /
   * preview subscribers re-render through the existing pipeline.
   */
  updateScene(patch: Partial<Scene>): void {
    if (current.scene === null) return;
    // When the main scene is active, a plain shallow merge. When a composition
    // is active, doc-level keys (size / duration / background / name / layers)
    // target the composition; project-level keys (fields, bindings, fonts,
    // compositions, metadata) stay on the scene root.
    if (activeCompId() === null) {
      set({ scene: { ...current.scene, ...patch } });
      return;
    }
    // D-026 — `frameRate` is project-level: it is intentionally NOT a doc key, so
    // an fps patch routes to the scene root (shared by every composition).
    const docKeys = new Set([
      'resolution',
      'frameRange',
      'activeRange',
      'lifecycle',
      'playout',
      'background',
      'name',
      'layers',
    ]);
    const docPatch: Record<string, unknown> = {};
    const rootPatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      (docKeys.has(k) ? docPatch : rootPatch)[k] = v;
    }
    let scene = current.scene;
    if (Object.keys(docPatch).length > 0) {
      scene = {
        ...scene,
        compositions: (scene.compositions ?? []).map((c) =>
          c.id === current.activeCompositionId ? { ...c, ...docPatch } : c,
        ),
      };
    }
    if (Object.keys(rootPatch).length > 0) scene = { ...scene, ...rootPatch };
    set({ scene });
  },

  /**
   * Set the scene's **total** duration in frames. Updates `frameRange.out`
   * to `frameRange.in + frames` and clamps the authoring `currentFrame` so
   * the playhead can't sit past the new end. When an `activeRange` exists it
   * is clamped to stay within the new total (a shorter total pulls the active
   * out-point in; a longer total leaves the active region untouched).
   * Existing keyframes are preserved — widening again restores their effect.
   */
  setSceneDurationFrames(frames: number): void {
    if (current.scene === null) return;
    const doc = activeDocOf(current.scene);
    const safe = Math.max(1, Math.floor(frames));
    const inFrame = doc.frameRange.in;
    const out = inFrame + safe;
    const nextFrame = Math.min(out, Math.max(inFrame, current.currentFrame));
    const prevActive = doc.activeRange;
    let activeRange = prevActive;
    if (prevActive !== undefined) {
      const aOut = Math.min(prevActive.out, out);
      const aIn = Math.max(inFrame, Math.min(prevActive.in, aOut - 1));
      activeRange = { in: aIn, out: aOut };
    }
    set({
      scene: withActiveDoc(current.scene, { frameRange: { in: inFrame, out }, activeRange }),
      currentFrame: nextFrame,
    });
  },

  /**
   * Resize the **active region** (the scene / main-layer bar) by setting its
   * out-point, clamped to `[activeRange.in + 1, frameRange.out]`. This never
   * touches `frameRange`, so the total frame count — and therefore the ruler
   * and the trailing frames — stay put. Playback and export use this window.
   */
  setSceneActiveOut(outFrames: number): void {
    if (current.scene === null) return;
    const doc = activeDocOf(current.scene);
    const { in: total0, out: total1 } = doc.frameRange;
    const inFrame = doc.activeRange?.in ?? total0;
    const out = Math.max(inFrame + 1, Math.min(total1, Math.round(outFrames)));
    const prev = doc.activeRange;
    if (prev !== undefined && prev.in === inFrame && prev.out === out) return;
    set({ scene: withActiveDoc(current.scene, { activeRange: { in: inFrame, out } }) });
  },

  /**
   * D-020 — set the active composition's lifecycle `outPoint` marker. Clamps to
   * the active region so the schema invariant `activeRange.in ≤ outPoint ≤
   * activeRange.out` always holds. Pass `null` to clear the lifecycle (back to no
   * distinct phases).
   */
  setLifecycle(marker: { outPoint: number } | null): void {
    if (current.scene === null) return;
    if (marker === null) {
      set({ scene: withActiveDoc(current.scene, { lifecycle: undefined }) });
      return;
    }
    const active = activeRangeOf(activeDocOf(current.scene));
    const out = Math.max(active.in, Math.min(active.out, Math.round(marker.outPoint)));
    const prev = activeDocOf(current.scene).lifecycle;
    if (prev !== undefined && prev.outPoint === out) return;
    set({
      scene: withActiveDoc(current.scene, { lifecycle: { outPoint: out } }),
    });
  },

  /** D-020 — merge a patch onto the active composition's playout timing config. */
  setPlayout(patch: Partial<Playout>): void {
    if (current.scene === null) return;
    const next: Playout = { ...playoutOf(activeDocOf(current.scene)), ...patch };
    set({ scene: withActiveDoc(current.scene, { playout: next }) });
  },

  setTool(tool: DesignerTool): void {
    set({ tool });
  },

  /** Replace selection. Pass `[]` to deselect. */
  setSelection(ids: readonly string[]): void {
    const nextSel = new Set(ids);
    const keepKey =
      current.selectedKeyframe !== null && nextSel.has(current.selectedKeyframe.elementId);
    set({
      selection: nextSel,
      editingTextId: null,
      selectedKeyframe: keepKey ? current.selectedKeyframe : null,
      selectedKeyframes: keepKey ? current.selectedKeyframes : [],
      keyframeInspectorOpen: keepKey ? current.keyframeInspectorOpen : false,
    });
  },

  /** Enter inline edit mode for a text element. Pass null to exit. */
  setEditingText(elementId: string | null): void {
    set({ editingTextId: elementId });
  },

  /** Enter bind-from-canvas mode for a field. Pass null to cancel. */
  setBindMode(fieldId: string | null): void {
    set({ bindModeFieldId: fieldId });
  },

  /** Append a dynamic field to the ACTIVE composition's fields (D-025). */
  addField(field: DynamicField): void {
    if (current.scene === null) return;
    const fields = [...activeFieldData(current.scene).fields, field];
    set({ scene: withActiveFieldData(current.scene, { fields }) });
  },

  /**
   * D-011 — idempotently add a scene-level font (e.g. when a font asset
   * is imported). No-op if a font with the same `family` already exists
   * so the panel can call this on every mount without duplicating.
   */
  addSceneFont(font: { family: string; displayName?: string; assetId?: string }): void {
    if (current.scene === null) return;
    if (current.scene.fonts.some((f) => f.family === font.family)) return;
    const next = [
      ...current.scene.fonts,
      {
        family: font.family,
        weights: [400],
        styles: ['normal' as const],
        source: 'bundled' as const,
        // We reuse `bundledPath` to round-trip the original filename
        // / display name so the inspector dropdown can show something
        // friendlier than the family slug.
        ...(font.displayName !== undefined ? { bundledPath: font.displayName } : {}),
      },
    ];
    set({ scene: { ...current.scene, fonts: next } });
  },

  /** Patch a field's editable properties (label/required/default/etc.). */
  updateField(fieldId: string, patch: Partial<DynamicField>): void {
    if (current.scene === null) return;
    const fields = activeFieldData(current.scene).fields.map((f) =>
      f.id === fieldId ? ({ ...f, ...patch } as DynamicField) : f,
    );
    set({ scene: withActiveFieldData(current.scene, { fields }) });
  },

  /** Remove a field and any bindings that reference it (active composition). */
  removeField(fieldId: string): void {
    if (current.scene === null) return;
    const doc = activeFieldData(current.scene);
    const fields = doc.fields.filter((f) => f.id !== fieldId);
    const bindings = doc.bindings.filter((b) => b.fieldId !== fieldId);
    set({ scene: withActiveFieldData(current.scene, { fields, bindings }) });
  },

  /** Append a binding (no dedup — same target appearing twice is allowed). */
  /**
   * Append a field→target binding, **idempotently**: if an identical
   * field→target pair already exists it's a no-op (B-008). This guards the
   * "Bind from canvas" flow (one activation = one bind, and re-activating +
   * re-clicking the same element must not stack duplicates) at the single
   * source, so every caller is protected. Binding a field to a DIFFERENT target
   * (other element / property) is still allowed — only exact duplicates are
   * dropped. The optional `transform` is not part of identity.
   */
  addBinding(binding: FieldBinding): void {
    if (current.scene === null) return;
    const doc = activeFieldData(current.scene);
    const duplicate = doc.bindings.some(
      (b) => b.fieldId === binding.fieldId && sameBindingTarget(b.target, binding.target),
    );
    if (duplicate) return;
    const bindings = [...doc.bindings, binding];
    set({ scene: withActiveFieldData(current.scene, { bindings }) });
  },

  /**
   * Remove a binding identified by its array index (into the active composition's
   * bindings). Index-based removal is unambiguous when two share a field/target.
   */
  removeBindingAt(index: number): void {
    if (current.scene === null) return;
    const doc = activeFieldData(current.scene);
    if (index < 0 || index >= doc.bindings.length) return;
    const bindings = doc.bindings.filter((_, i) => i !== index);
    set({ scene: withActiveFieldData(current.scene, { bindings }) });
  },

  /**
   * D-018 convenience layer — make a text element dynamic by giving it a **Data
   * key**. The key auto-syncs a scene-level field (`id = key`) and a full-text
   * `text` binding, so `fields[]`/`bindings[]` remain the single source of truth
   * (fields are project-global — see `editSceneOf`). Setting it the first time
   * creates the field+binding (seeding the field default from the element's
   * current text); changing it renames the field id and every binding that
   * referenced it; clearing it removes the field and its bindings.
   *
   * Returns `false` (and changes nothing) only when `key` is already *owned by
   * another element* via a full-text binding (a real conflict). A field that
   * exists but is **orphaned** — e.g. its binding was removed via the Bindings
   * `×`, leaving the field behind — is **re-adopted** rather than rejected, so
   * re-typing the same key reconnects it. Only the convenience binding
   * (full-text, no placeholder) is touched; `{{placeholder}}` bindings are left
   * alone. The inspector warns live with the same ownership rule.
   */
  setElementDataKey(elementId: string, key: string): boolean {
    if (current.scene === null) return false;
    const trimmed = key.trim();
    const doc = activeFieldData(current.scene);
    const bindings = doc.bindings;
    const convIdx = bindings.findIndex(
      (b) =>
        b.target.kind === 'text' &&
        b.target.elementId === elementId &&
        b.target.placeholder === undefined,
    );
    const currentKey = convIdx === -1 ? null : (bindings[convIdx]?.fieldId ?? null);

    // Cleared → element becomes static again.
    if (trimmed === '') {
      if (currentKey !== null) designerStore.removeField(currentKey);
      return true;
    }
    if (trimmed === currentKey) return true; // unchanged

    // Reject only when *another* element already owns this key via a full-text
    // binding. An existing-but-orphaned field (no such binding) is re-adopted.
    const ownedElsewhere = bindings.some(
      (b) =>
        b.fieldId === trimmed &&
        b.target.kind === 'text' &&
        b.target.placeholder === undefined &&
        b.target.elementId !== elementId,
    );
    if (ownedElsewhere) return false;

    const existing = doc.fields.find((f) => f.id === trimmed);

    if (currentKey === null) {
      const binding: FieldBinding = { fieldId: trimmed, target: { kind: 'text', elementId } };
      // Re-adopt an orphaned field (keep its config); otherwise create a fresh
      // one seeded from the element's current text.
      if (existing !== undefined) {
        set({ scene: withActiveFieldData(current.scene, { bindings: [...bindings, binding] }) });
        return true;
      }
      const found = locate(current.scene, elementId);
      const el = found === null ? undefined : found.layer.children[found.elIdx];
      const seed = el !== undefined && el.type === 'text' ? el.text : '';
      const field: DynamicField = {
        id: trimmed,
        type: 'text',
        label: trimmed,
        required: false,
        default: seed,
        maxLength: DEFAULT_DATA_FIELD_MAX_LENGTH,
      };
      set({
        scene: withActiveFieldData(current.scene, {
          fields: [...doc.fields, field],
          bindings: [...bindings, binding],
        }),
      });
      return true;
    }

    // Rename. If an (orphaned) field already owns the new id, don't fork the id
    // space — reject and let the operator clear then re-set.
    if (existing !== undefined) return false;
    const fields = doc.fields.map((f) =>
      f.id === currentKey ? ({ ...f, id: trimmed } as DynamicField) : f,
    );
    const nextBindings = bindings.map((b) =>
      b.fieldId === currentKey ? { ...b, fieldId: trimmed } : b,
    );
    set({ scene: withActiveFieldData(current.scene, { fields, bindings: nextBindings }) });
    return true;
  },

  /**
   * D-018 — patch the field backing a text element's Data key (title,
   * description, required, field type, multiline, min/max length, pattern,
   * default). No-op when the element has no Data key yet. Variant switches
   * (text ↔ multiline ↔ number) are handled in `rebuildField`.
   */
  setElementFieldMeta(elementId: string, patch: ElementFieldMetaPatch): void {
    if (current.scene === null) return;
    const doc = activeFieldData(current.scene);
    const conv = doc.bindings.find(
      (b) =>
        b.target.kind === 'text' &&
        b.target.elementId === elementId &&
        b.target.placeholder === undefined,
    );
    if (conv === undefined) return;
    const oldField = doc.fields.find((f) => f.id === conv.fieldId);
    if (oldField === undefined) return;
    const newField = rebuildField(oldField, patch);
    const fields = doc.fields.map((f) => (f.id === conv.fieldId ? newField : f));
    set({ scene: withActiveFieldData(current.scene, { fields }) });

    // Keep the element's authoring text in lockstep with the field default
    // whenever the default changed (editing "Default" here, or a field-type
    // switch that coerced it), so the inline editor opens with the same value
    // the canvas shows rather than a stale one.
    const newDefault = 'default' in newField ? String(newField.default) : undefined;
    if (newDefault !== undefined) {
      const found = locate(current.scene, elementId);
      const el = found === null ? undefined : found.layer.children[found.elIdx];
      if (el !== undefined && el.type === 'text' && el.text !== newDefault) {
        designerStore.updateElement(elementId, { text: newDefault } as Partial<Element>);
      }
    }
  },

  /**
   * D-018 — commit a text element's content (the on-canvas inline editor).
   * Updates `element.text` and, when the element has a Data key, keeps the
   * backing field's `default` in sync. The authoring canvas renders the field
   * default until a live value arrives, so without this sync an edit to a bound
   * element would snap back to the old default and appear not to change.
   */
  setElementText(elementId: string, text: string): void {
    designerStore.updateElement(elementId, { text } as Partial<Element>);
    designerStore.setElementFieldMeta(elementId, { default: text }); // no-op if no Data key
  },

  /** Add one element to the first layer (creates a layer if none exist). */
  addElement(element: Element): void {
    if (current.scene === null) return;
    const layers = activeLayersOf(current.scene);
    let nextLayers: Layer[];
    if (layers.length === 0) {
      nextLayers = [
        {
          id: `L${String(Date.now())}`,
          name: 'Layer 1',
          visible: true,
          locked: false,
          children: [element],
          blendMode: 'normal',
        },
      ];
    } else {
      nextLayers = layers.map((l, i) =>
        i === 0 ? { ...l, children: [...l.children, element] } : l,
      );
    }
    set({ scene: withActiveLayers(current.scene, nextLayers), selection: new Set([element.id]) });
  },

  /** Set the timeline horizontal zoom, clamped to [1, 20]. */
  setTimelineZoom(z: number): void {
    const clamped = Math.max(1, Math.min(20, z));
    if (clamped === current.timelineZoom) return;
    set({ timelineZoom: clamped });
  },

  /** View menu — toggle the canvas pixel rulers. */
  toggleRuler(): void {
    set({ rulerVisible: !current.rulerVisible });
  },

  /** View menu — enable/disable canvas snapping. Clears any live guides. */
  toggleSnapping(): void {
    set({ snappingEnabled: !current.snappingEnabled, snapGuides: { x: [], y: [] } });
  },

  /** Set the live snap guide lines (scene coords) shown during a snapped drag. */
  setSnapGuides(guides: { x: readonly number[]; y: readonly number[] }): void {
    const cur = current.snapGuides;
    if (
      cur.x.length === 0 &&
      cur.y.length === 0 &&
      guides.x.length === 0 &&
      guides.y.length === 0
    ) {
      return;
    }
    set({ snapGuides: guides });
  },

  /** Add a ruler guide (vertical for axis 'x', horizontal for 'y'). Returns its index. */
  addGuide(axis: 'x' | 'y', pos: number): number {
    const next = [...current.guides[axis], pos];
    set({ guides: { ...current.guides, [axis]: next } });
    return next.length - 1;
  },

  /** Reposition the guide at `index` on `axis`. */
  setGuidePos(axis: 'x' | 'y', index: number, pos: number): void {
    const arr = current.guides[axis];
    if (index < 0 || index >= arr.length) return;
    const next = arr.map((p, i) => (i === index ? pos : p));
    set({ guides: { ...current.guides, [axis]: next } });
  },

  /** Remove the guide at `index` on `axis` (e.g. dropped back on the ruler). */
  removeGuide(axis: 'x' | 'y', index: number): void {
    const arr = current.guides[axis];
    if (index < 0 || index >= arr.length) return;
    set({ guides: { ...current.guides, [axis]: arr.filter((_, i) => i !== index) } });
  },

  /** Move the authoring cursor frame, clamped to the scene's frame range. */
  setCurrentFrame(frame: number): void {
    if (current.scene === null) return;
    const { in: lo, out: hi } = activeDocOf(current.scene).frameRange;
    const clamped = Math.max(lo, Math.min(hi, Math.round(frame)));
    if (clamped === current.currentFrame) return;
    set({ currentFrame: clamped });
  },

  /**
   * Insert (or replace, on frame collision) a keyframe on the given
   * property's track. Auto-creates `animation.tracks[property]` when the
   * track doesn't yet exist. Easing defaults to `linear`.
   */
  upsertKeyframe(
    elementId: string,
    property: AnimatableProperty,
    frame: number,
    value: number | string,
    easing: Easing = 'linear',
  ): void {
    mutateAnimation(elementId, (anim) => {
      const existing = anim.tracks[property];
      const next: Keyframe = { id: freshKeyframeId(), frame, value, easing };
      if (existing === undefined) {
        return { ...anim, tracks: { ...anim.tracks, [property]: { keyframes: [next] } } };
      }
      const filtered = existing.keyframes.filter((k) => k.frame !== frame);
      const inserted = [...filtered, next].sort((a, b) => a.frame - b.frame);
      return { ...anim, tracks: { ...anim.tracks, [property]: { keyframes: inserted } } };
    });
  },

  /**
   * Move an existing keyframe to a new frame. If a keyframe already sits at
   * `toFrame`, the moved one wins and the displaced one is dropped. No-op if
   * `fromFrame` has no keyframe on this property.
   */
  moveKeyframe(
    elementId: string,
    property: AnimatableProperty,
    fromFrame: number,
    toFrame: number,
  ): void {
    if (fromFrame === toFrame) return;
    let actuallyMoved = false;
    mutateAnimation(elementId, (anim) => {
      const existing = anim.tracks[property];
      if (existing === undefined) return anim;
      const target = existing.keyframes.find((k) => k.frame === fromFrame);
      if (target === undefined) return anim;
      const without = existing.keyframes.filter(
        (k) => k.frame !== fromFrame && k.frame !== toFrame,
      );
      const moved: Keyframe = { ...target, frame: toFrame };
      const next = [...without, moved].sort((a, b) => a.frame - b.frame);
      actuallyMoved = true;
      return { ...anim, tracks: { ...anim.tracks, [property]: { keyframes: next } } };
    });
    if (actuallyMoved) syncSelectionAfterMove(elementId, property, fromFrame, toFrame);
  },

  /**
   * Move a specific keyframe (by id) to a new frame WITHOUT displacing any
   * keyframe already sitting there — so dragging a point onto another keeps
   * both, and you can stack several on one frame (an instant step). Used by
   * the timeline drag; the frame-based `moveKeyframe` (overwrite-on-collision)
   * stays for the Keyframe Inspector's frame field.
   */
  moveKeyframeById(
    elementId: string,
    property: AnimatableProperty,
    keyframeId: string,
    toFrame: number,
  ): void {
    let oldFrame: number | null = null;
    mutateAnimation(elementId, (anim) => {
      const existing = anim.tracks[property];
      if (existing === undefined) return anim;
      const target = existing.keyframes.find((k) => k.id === keyframeId);
      if (target === undefined || target.frame === toFrame) return anim;
      oldFrame = target.frame;
      // Stable sort keeps relative order of same-frame points, so the step
      // direction stays defined.
      const next = existing.keyframes
        .map((k) => (k.id === keyframeId ? { ...k, frame: toFrame } : k))
        .sort((a, b) => a.frame - b.frame);
      return { ...anim, tracks: { ...anim.tracks, [property]: { keyframes: next } } };
    });
    // Frame-based selection follows the dragged point.
    if (oldFrame !== null) syncSelectionAfterMove(elementId, property, oldFrame, toFrame);
  },

  /**
   * Remove a keyframe by frame index. If it was the last keyframe in its
   * track, the track entry is dropped (the schema requires `min(1)`); if it
   * was the last track in the element's animation, the `animation` field is
   * removed entirely.
   */
  removeKeyframe(elementId: string, property: AnimatableProperty, frame: number): void {
    mutateAnimation(elementId, (anim) => {
      const existing = anim.tracks[property];
      if (existing === undefined) return anim;
      const filtered = existing.keyframes.filter((k) => k.frame !== frame);
      const tracks: ElementAnimation['tracks'] = { ...anim.tracks };
      if (filtered.length === 0) {
        delete tracks[property];
      } else {
        tracks[property] = { keyframes: filtered };
      }
      return { ...anim, tracks };
    });
    // Drop any selection refs that pointed at the removed keyframe.
    const removed: KeyframeRef = { elementId, property, frame };
    const nextList = current.selectedKeyframes.filter((r) => !sameKeyframeRef(r, removed));
    if (nextList.length !== current.selectedKeyframes.length || current.selectedKeyframe !== null) {
      const primaryGone =
        current.selectedKeyframe !== null && sameKeyframeRef(current.selectedKeyframe, removed);
      set({
        selectedKeyframes: nextList,
        selectedKeyframe: primaryGone
          ? (nextList[nextList.length - 1] ?? null)
          : current.selectedKeyframe,
        keyframeInspectorOpen: nextList.length > 0 ? current.keyframeInspectorOpen : false,
      });
    }
  },

  /**
   * Commit a value for an animatable numeric property. The "track-aware"
   * routing rule (D-006):
   *
   *   - If a track already exists for this property on this element
   *     (i.e. the operator has set at least one keyframe for it), the
   *     edit lands as a keyframe at `currentFrame` — replacing the
   *     existing keyframe on that frame, or inserting a new one when
   *     the playhead is off any existing keyframe. This is what builds
   *     the animation when the operator e.g. drags the shape after
   *     adding a position.x keyframe.
   *   - Otherwise the property has never been animated, so the edit
   *     flows to the element's static value as before.
   */
  commitAnimatable(elementId: string, property: AnimatableProperty, value: number | string): void {
    if (current.scene === null) return;
    const found = locate(current.scene, elementId);
    if (found === null) return;
    const el = found.layer.children[found.elIdx];
    if (el === undefined) return;
    const track = el.animation?.tracks[property];
    const hasTrack = (track?.keyframes.length ?? 0) > 0;
    if (hasTrack) {
      designerStore.upsertKeyframe(elementId, property, current.currentFrame, value);
      return;
    }
    designerStore.writeStaticAnimatable(elementId, property, value);
  },

  /**
   * Set the keyframe selection (the yellow-diamond highlight). Closes
   * the dedicated Keyframe Inspector if it was open for a different
   * point, so that single-clicking a new diamond doesn't keep showing
   * a stale detail view.
   */
  setSelectedKeyframe(key: KeyframeRef | null): void {
    const cur = current.selectedKeyframe;
    const keepOpen =
      current.keyframeInspectorOpen && key !== null && cur !== null && sameKeyframeRef(cur, key);
    set({
      selectedKeyframe: key,
      selectedKeyframes: key === null ? [] : [key],
      keyframeInspectorOpen: keepOpen,
    });
  },

  /** Open the right-side Keyframe Inspector for a single point (single-click). */
  openKeyframeInspector(key: KeyframeRef): void {
    set({ selectedKeyframe: key, selectedKeyframes: [key], keyframeInspectorOpen: true });
  },

  /**
   * Toggle a keyframe in the multi-selection (shift / ctrl-click) and keep the
   * Keyframe Inspector open. Multiple selected points share batch easing edits.
   */
  addKeyframeToSelection(key: KeyframeRef): void {
    const exists = current.selectedKeyframes.some((r) => sameKeyframeRef(r, key));
    const nextList = exists
      ? current.selectedKeyframes.filter((r) => !sameKeyframeRef(r, key))
      : [...current.selectedKeyframes, key];
    set({
      selectedKeyframes: nextList,
      selectedKeyframe: exists ? (nextList[nextList.length - 1] ?? null) : key,
      keyframeInspectorOpen: nextList.length > 0,
    });
  },

  /** Close the right-side Keyframe Inspector (selection is preserved). */
  closeKeyframeInspector(): void {
    if (!current.keyframeInspectorOpen) return;
    set({ keyframeInspectorOpen: false });
  },

  /** Update an existing keyframe's value in place (no frame change). */
  setKeyframeValue(
    elementId: string,
    property: AnimatableProperty,
    frame: number,
    value: number | string,
  ): void {
    mutateAnimation(elementId, (anim) => {
      const existing = anim.tracks[property];
      if (existing === undefined) return anim;
      const updated = existing.keyframes.map((k) => (k.frame === frame ? { ...k, value } : k));
      return { ...anim, tracks: { ...anim.tracks, [property]: { keyframes: updated } } };
    });
  },

  /** Update an existing keyframe's easing. */
  setKeyframeEasing(
    elementId: string,
    property: AnimatableProperty,
    frame: number,
    easing: Easing,
  ): void {
    mutateAnimation(elementId, (anim) => {
      const existing = anim.tracks[property];
      if (existing === undefined) return anim;
      const updated = existing.keyframes.map((k) => (k.frame === frame ? { ...k, easing } : k));
      return { ...anim, tracks: { ...anim.tracks, [property]: { keyframes: updated } } };
    });
  },

  /**
   * Set (or clear) an existing keyframe's custom cubic-bézier easing. Passing a
   * tuple makes the runtime ease through that curve; passing null reverts to
   * the named `easing`. The two time components are clamped to [0, 1].
   */
  setKeyframeBezier(
    elementId: string,
    property: AnimatableProperty,
    frame: number,
    bezier: readonly [number, number, number, number] | null,
  ): void {
    const clamped: [number, number, number, number] | null =
      bezier === null
        ? null
        : [
            Math.max(0, Math.min(1, bezier[0])),
            bezier[1],
            Math.max(0, Math.min(1, bezier[2])),
            bezier[3],
          ];
    mutateAnimation(elementId, (anim) => {
      const existing = anim.tracks[property];
      if (existing === undefined) return anim;
      const updated = existing.keyframes.map((k) => {
        if (k.frame !== frame) return k;
        if (clamped === null) {
          const next = { ...k };
          delete next.bezier;
          return next;
        }
        return { ...k, bezier: clamped };
      });
      return { ...anim, tracks: { ...anim.tracks, [property]: { keyframes: updated } } };
    });
  },

  /**
   * Write the static value for an animatable property, bypassing the
   * keyframe branch. Used by `commitAnimatable` and by tests; the timeline's
   * "read current value" helper also pairs with this.
   */
  writeStaticAnimatable(
    elementId: string,
    property: AnimatableProperty,
    value: number | string,
  ): void {
    if (current.scene === null) return;
    const found = locate(current.scene, elementId);
    if (found === null) return;
    const el = found.layer.children[found.elIdx];
    if (el === undefined) return;
    const tx = el.transform;
    // The whole transform / numeric branch only handles numbers — the
    // color cases at the bottom of this switch handle strings.
    const numeric = typeof value === 'number' ? value : 0;
    switch (property) {
      case 'position.x':
        designerStore.updateTransform(elementId, { position: { ...tx.position, x: numeric } });
        return;
      case 'position.y':
        designerStore.updateTransform(elementId, { position: { ...tx.position, y: numeric } });
        return;
      case 'size.w':
        designerStore.updateTransform(elementId, { size: { ...tx.size, w: numeric } });
        return;
      case 'size.h':
        designerStore.updateTransform(elementId, { size: { ...tx.size, h: numeric } });
        return;
      case 'scale.x':
        designerStore.updateTransform(elementId, { scale: { ...tx.scale, x: numeric } });
        return;
      case 'scale.y':
        designerStore.updateTransform(elementId, { scale: { ...tx.scale, y: numeric } });
        return;
      case 'rotation':
        designerStore.updateTransform(elementId, { rotation: numeric });
        return;
      case 'opacity':
        designerStore.updateElement(elementId, { opacity: numeric } as Partial<Element>);
        return;
      // D-010 — numeric style properties.
      case 'cornerRadius':
        designerStore.updateElement(elementId, {
          cornerRadius: numeric,
        } as unknown as Partial<Element>);
        return;
      case 'stroke.width': {
        if (el.type !== 'shape') return;
        const stroke = { ...(el.stroke ?? { color: '#000000', width: 0 }), width: numeric };
        designerStore.updateElement(elementId, { stroke } as unknown as Partial<Element>);
        return;
      }
      case 'stroke.dash': {
        if (el.type !== 'shape') return;
        const base = el.stroke ?? { color: '#000000', width: 0 };
        const stroke = { ...base, dash: numeric > 0 ? [numeric] : [] };
        designerStore.updateElement(elementId, { stroke } as unknown as Partial<Element>);
        return;
      }
      case 'shadow.offsetX':
      case 'shadow.offsetY':
      case 'shadow.blur': {
        const field =
          property === 'shadow.offsetX'
            ? 'offsetX'
            : property === 'shadow.offsetY'
              ? 'offsetY'
              : 'blur';
        if (el.type === 'shape') {
          const base = el.shadow ?? { offsetX: 0, offsetY: 0, blur: 0, color: '#000000' };
          const shadow = { ...base, [field]: numeric };
          designerStore.updateElement(elementId, { shadow } as unknown as Partial<Element>);
        } else if (el.type === 'text') {
          const base = el.textShadow ?? { offsetX: 0, offsetY: 0, blur: 0, color: '#000000' };
          const textShadow = { ...base, [field]: numeric };
          designerStore.updateElement(elementId, { textShadow } as unknown as Partial<Element>);
        }
        return;
      }
      case 'filter.blur':
      case 'filter.brightness':
      case 'filter.contrast':
      case 'filter.grayscale':
      case 'filter.hueRotate':
      case 'filter.invert':
      case 'filter.opacity':
      case 'filter.saturate':
      case 'filter.sepia': {
        const key = property.slice('filter.'.length);
        const base = el.filter ?? {};
        const filter = { ...base, [key]: numeric };
        designerStore.updateElement(elementId, { filter } as unknown as Partial<Element>);
        return;
      }
      case 'font.size':
      case 'font.lineHeight':
      case 'font.letterSpacing': {
        if (el.type !== 'text') return;
        const key = property.slice('font.'.length);
        const font = { ...el.font, [key]: numeric };
        designerStore.updateElement(elementId, { font } as unknown as Partial<Element>);
        return;
      }
      case 'padding.top':
      case 'padding.right':
      case 'padding.bottom':
      case 'padding.left': {
        if (el.type !== 'text') return;
        const key = property.slice('padding.'.length);
        const base = el.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
        const padding = { ...base, [key]: numeric };
        designerStore.updateElement(elementId, { padding } as unknown as Partial<Element>);
        return;
      }
      // D-010 colour properties (value is a hex string).
      case 'fill.color': {
        if (el.type !== 'shape' || typeof value !== 'string') return;
        designerStore.updateElement(elementId, {
          fill: { kind: 'solid', color: value },
        } as Partial<Element>);
        return;
      }
      case 'stroke.color': {
        if (el.type !== 'shape' || typeof value !== 'string') return;
        const base = el.stroke ?? { width: 0, color: '#000000' };
        const stroke = { ...base, color: value };
        designerStore.updateElement(elementId, { stroke } as unknown as Partial<Element>);
        return;
      }
      case 'shadow.color': {
        if (typeof value !== 'string') return;
        if (el.type === 'shape') {
          const base = el.shadow ?? { offsetX: 0, offsetY: 0, blur: 0, color: '#000000' };
          designerStore.updateElement(elementId, {
            shadow: { ...base, color: value },
          } as unknown as Partial<Element>);
        } else if (el.type === 'text') {
          const base = el.textShadow ?? { offsetX: 0, offsetY: 0, blur: 0, color: '#000000' };
          designerStore.updateElement(elementId, {
            textShadow: { ...base, color: value },
          } as unknown as Partial<Element>);
        }
        return;
      }
      case 'text.color': {
        if (el.type !== 'text' || typeof value !== 'string') return;
        designerStore.updateElement(elementId, { color: value } as Partial<Element>);
        return;
      }
      case 'backgroundColor': {
        if (el.type !== 'text' || typeof value !== 'string') return;
        designerStore.updateElement(elementId, {
          backgroundColor: value,
        } as unknown as Partial<Element>);
        return;
      }
      default:
        return;
    }
  },

  /** Apply a shallow patch to an element. */
  updateElement(elementId: string, patch: Partial<Element>): void {
    if (current.scene === null) return;
    const found = locate(current.scene, elementId);
    if (found === null) return;
    const { layer, layerIdx, elIdx } = found;
    const existing = layer.children[elIdx];
    if (existing === undefined) return;
    let effectivePatch = patch;
    // D-025 — a composition instance's name is its field namespace, so renaming it
    // must stay unique among the active doc's instances. Uniquify on collision.
    if (existing.type === 'composition' && typeof patch.name === 'string') {
      const taken = compositionInstancesOf({ layers: activeLayersOf(current.scene) })
        .filter((i) => i.id !== elementId)
        .map((i) => i.name);
      const unique = uniqueInstanceName(
        patch.name.trim() === '' ? existing.name : patch.name,
        taken,
      );
      if (unique !== patch.name) effectivePatch = { ...patch, name: unique };
    }
    const merged = { ...existing, ...effectivePatch } as Element;
    const nextChildren = [...layer.children];
    nextChildren[elIdx] = merged;
    const nextLayer: Layer = { ...layer, children: nextChildren };
    const nextLayers = [...activeLayersOf(current.scene)];
    nextLayers[layerIdx] = nextLayer;
    set({ scene: withActiveLayers(current.scene, nextLayers) });
  },

  /** Update an element's transform (preserves the rest of the element). */
  updateTransform(elementId: string, patch: Partial<Element['transform']>): void {
    if (current.scene === null) return;
    const found = locate(current.scene, elementId);
    if (found === null) return;
    const { layer, layerIdx, elIdx } = found;
    const existing = layer.children[elIdx];
    if (existing === undefined) return;
    const merged = {
      ...existing,
      transform: { ...existing.transform, ...patch },
    } as Element;
    const nextChildren = [...layer.children];
    nextChildren[elIdx] = merged;
    const nextLayer: Layer = { ...layer, children: nextChildren };
    const nextLayers = [...activeLayersOf(current.scene)];
    nextLayers[layerIdx] = nextLayer;
    set({ scene: withActiveLayers(current.scene, nextLayers) });
  },

  /**
   * Cascade-delete an asset's references from the scene. Used by the
   * Project Assets right-click → Delete flow:
   *
   *   - Text elements whose `font.family === asset-${assetId}` revert to
   *     the default family (`Inter`), so they keep rendering with a sane
   *     fallback instead of an unresolved face.
   *   - Image elements whose `assetId === assetId` are removed entirely
   *     (selection + selected-keyframe are cleaned up alongside).
   *   - The matching `FontReference` entry (family `asset-${assetId}`) is
   *     dropped from `scene.fonts` so the Text inspector dropdown stops
   *     listing the deleted face.
   *
   * Containers are recursed, so a nested image / nested text using the
   * asset gets cleaned up too.
   */
  removeAssetFromScene(assetId: string): void {
    if (current.scene === null) return;
    const family = `asset-${assetId}`;

    function visit(children: readonly Element[]): Element[] {
      const out: Element[] = [];
      for (const child of children) {
        if (child.type === 'image' && child.assetId === assetId) continue;
        if (child.type === 'text' && child.font.family === family) {
          out.push({ ...child, font: { ...child.font, family: 'Inter' } });
          continue;
        }
        if (child.type === 'container') {
          out.push({ ...child, children: visit(child.children) });
          continue;
        }
        out.push(child);
      }
      return out;
    }

    const removedImageIds = new Set<string>();
    function collectRemoved(children: readonly Element[]): void {
      for (const child of children) {
        if (child.type === 'image' && child.assetId === assetId) {
          removedImageIds.add(child.id);
        } else if (child.type === 'container') {
          collectRemoved(child.children);
        }
      }
    }
    const cleanLayers = (layers: readonly Layer[]): Layer[] =>
      layers.map((l) => ({ ...l, children: visit(l.children) }));
    for (const layer of current.scene.layers) collectRemoved(layer.children);
    for (const comp of current.scene.compositions ?? []) {
      for (const layer of comp.layers) collectRemoved(layer.children);
    }

    const nextLayers = cleanLayers(current.scene.layers);
    const nextComps = current.scene.compositions?.map((c) => ({
      ...c,
      layers: cleanLayers(c.layers),
    }));
    const nextFonts = current.scene.fonts.filter((f) => f.family !== family);

    const nextSelection = new Set(current.selection);
    for (const id of removedImageIds) nextSelection.delete(id);
    const sk = current.selectedKeyframe;
    const keepKey = sk !== null && !removedImageIds.has(sk.elementId);

    set({
      scene: {
        ...current.scene,
        layers: nextLayers,
        fonts: nextFonts,
        ...(nextComps !== undefined ? { compositions: nextComps } : {}),
      },
      selection: nextSelection,
      selectedKeyframe: keepKey ? sk : null,
      selectedKeyframes: keepKey ? current.selectedKeyframes : [],
      keyframeInspectorOpen: keepKey ? current.keyframeInspectorOpen : false,
    });
  },

  /**
   * Update the per-element lifespan (timeline lane bar). Passing
   * `null` removes the lifespan so the element reverts to the
   * scene's frameRange. The store clamps both ends to
   * `[scene.frameRange.in, scene.frameRange.out]` and rejects
   * inverted ranges so callers don't need to.
   */
  updateElementLifespan(elementId: string, lifespan: { in: number; out: number } | null): void {
    if (current.scene === null) return;
    const found = locate(current.scene, elementId);
    if (found === null) return;
    const { layer, layerIdx, elIdx } = found;
    const existing = layer.children[elIdx];
    if (existing === undefined) return;
    let next: Element;
    if (lifespan === null) {
      const { lifespan: _omit, ...rest } = existing;
      void _omit;
      next = rest as Element;
    } else {
      const { in: sIn, out: sOut } = activeDocOf(current.scene).frameRange;
      const lo = Math.max(sIn, Math.min(sOut, Math.round(lifespan.in)));
      const hi = Math.max(sIn, Math.min(sOut, Math.round(lifespan.out)));
      if (hi < lo) return;
      next = { ...existing, lifespan: { in: lo, out: hi } } as Element;
    }
    const nextChildren = [...layer.children];
    nextChildren[elIdx] = next;
    const nextLayer: Layer = { ...layer, children: nextChildren };
    const nextLayers = [...activeLayersOf(current.scene)];
    nextLayers[layerIdx] = nextLayer;
    set({ scene: withActiveLayers(current.scene, nextLayers) });
  },

  /** Remove an element by id. Cleans up the selection set if needed. */
  removeElement(elementId: string): void {
    if (current.scene === null) return;
    const found = locate(current.scene, elementId);
    if (found === null) return;
    const { layer, layerIdx, elIdx } = found;
    const nextChildren = layer.children.filter((_, i) => i !== elIdx);
    const nextLayer: Layer = { ...layer, children: nextChildren };
    const nextLayers = [...activeLayersOf(current.scene)];
    nextLayers[layerIdx] = nextLayer;
    const nextSelection = new Set(current.selection);
    nextSelection.delete(elementId);
    const keepKey =
      current.selectedKeyframe !== null && current.selectedKeyframe.elementId !== elementId;

    // Cascade-clean the dynamic-field wiring (in the active composition): drop
    // every binding that targets the deleted element, then drop any field bound to
    // this element and now referenced by no binding. Fields still used elsewhere
    // stay. Scoped to the active doc's own fields/bindings (D-025).
    const doc = activeFieldData(current.scene);
    const boundToEl = new Set(
      doc.bindings
        .filter((b) => b.target.kind !== 'scene-background' && b.target.elementId === elementId)
        .map((b) => b.fieldId),
    );
    const nextBindings = doc.bindings.filter(
      (b) => b.target.kind === 'scene-background' || b.target.elementId !== elementId,
    );
    const stillBound = new Set(nextBindings.map((b) => b.fieldId));
    const nextFields = doc.fields.filter((f) => !(boundToEl.has(f.id) && !stillBound.has(f.id)));

    const withLayers = withActiveLayers(current.scene, nextLayers);
    set({
      scene: withActiveFieldData({ ...withLayers }, { fields: nextFields, bindings: nextBindings }),
      selection: nextSelection,
      selectedKeyframe: keepKey ? current.selectedKeyframe : null,
      selectedKeyframes: keepKey ? current.selectedKeyframes : [],
      keyframeInspectorOpen: keepKey ? current.keyframeInspectorOpen : false,
    });
  },

  /**
   * Delete whatever is selected, for the keyboard Delete/Backspace gesture.
   *
   * PRECEDENCE: clicking a keyframe selects both the keyframe and its parent
   * element, so if ANY keyframe is selected this deletes ALL selected keyframes
   * and leaves the element(s) alone; only when NO keyframe is selected does it
   * delete ALL selected elements (layers/shapes). No-op when nothing is selected.
   *
   * Each underlying `removeKeyframe`/`removeElement` is a `set()`; because history
   * coalesces a synchronous burst (see `set`/`COALESCE_MS`), the whole delete is a
   * single undo step. The selection lists are snapshotted first since each removal
   * mutates them.
   */
  deleteSelection(): void {
    if (current.scene === null) return;
    const keyframes = [...current.selectedKeyframes];
    if (keyframes.length > 0) {
      for (const kf of keyframes) designerStore.removeKeyframe(kf.elementId, kf.property, kf.frame);
      return;
    }
    const ids = [...current.selection];
    for (const id of ids) designerStore.removeElement(id);
  },

  /**
   * Set the timeline lifespan-bar colour for an element (layer right-click →
   * Color). The colour persists on the element as `timelineColor`.
   */
  setElementTimelineColor(elementId: string, color: string): void {
    designerStore.updateElement(elementId, { timelineColor: color } as Partial<Element>);
  },

  /**
   * "Fit workspace" — set the element's lifespan to span the scene's active
   * region (the resized play window), so the layer bar fills the played area.
   */
  fitElementLifespanToActiveRange(elementId: string): void {
    if (current.scene === null) return;
    const r = activeRangeOf(activeDocOf(current.scene));
    designerStore.updateElementLifespan(elementId, { in: r.in, out: r.out });
  },

  /** Copy an element into the in-memory clipboard (for Paste). */
  copyElement(elementId: string): void {
    if (current.scene === null) return;
    const found = locate(current.scene, elementId);
    if (found === null) return;
    const el = found.layer.children[found.elIdx];
    if (el === undefined) return;
    setClipboard(structuredClone(el));
  },

  /** Copy an element to the clipboard, then remove it from the scene. */
  cutElement(elementId: string): void {
    designerStore.copyElement(elementId);
    designerStore.removeElement(elementId);
  },

  /** True when there is a clipboard element available to paste. */
  hasClipboardElement(): boolean {
    return getClipboard() !== null;
  },

  /**
   * Duplicate an element in place — a deep clone with fresh ids inserted
   * directly after the original in the same layer, then selected.
   */
  duplicateElement(elementId: string): void {
    if (current.scene === null) return;
    const found = locate(current.scene, elementId);
    if (found === null) return;
    const el = found.layer.children[found.elIdx];
    if (el === undefined) return;
    insertElementAt(found.layerIdx, found.elIdx + 1, cloneElementWithNewIds(el), true);
  },

  /**
   * Paste the clipboard element as a fresh clone. It lands just after the
   * currently selected element (same layer) when there is a selection,
   * otherwise it is appended to the first layer. No-op with an empty clipboard.
   */
  pasteElement(): void {
    const clip = getClipboard();
    if (current.scene === null || clip === null) return;
    const clone = cloneElementWithNewIds(clip);
    const layers = activeLayersOf(current.scene);
    if (layers.length === 0) {
      designerStore.addElement(clone);
      return;
    }
    const selId = [...current.selection][0];
    const sel = selId === undefined ? null : locate(current.scene, selId);
    const layerIdx = sel?.layerIdx ?? 0;
    const layer = layers[layerIdx];
    const pos = sel !== null ? sel.elIdx + 1 : (layer?.children.length ?? 0);
    insertElementAt(layerIdx, pos, clone, true);
  },

  /** All elements across all layers, top-of-stack first (last layer index = topmost). */
  allElements(): readonly Element[] {
    if (current.scene === null) return [];
    const out: Element[] = [];
    for (const layer of activeLayersOf(current.scene)) {
      for (const el of layer.children) out.push(el);
    }
    return out;
  },

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
