import type { Composition, Element, Layer, Scene } from '@cg/shared-schema';
import { compositionClosure, compositionInstancesOf, uniqueInstanceName } from '@cg/shared-schema';
import { current, set } from '../store-core.js';
import {
  activeLayersOf,
  freshCompositionId,
  freshElementId,
  reassignIdsDeep,
} from '../scene-doc.js';
import { designerStore } from '../store.js';

/**
 * Whether placing an instance of `childId` inside `parentId` (null = main
 * scene) is allowed — i.e. it would NOT create a cycle. A cycle exists if the
 * child is the parent itself, or the child can already reach the parent through
 * the composition-reference graph. (Loopic permits this and loops forever; we
 * forbid it.)
 *
 * D-086 — the reachability test reuses the shared {@link compositionClosure}, which
 * follows BOTH `composition` and `repeater` child references. The previous local
 * walker only followed `composition` edges, so a repeater-mediated cycle (A
 * instances B while B repeats A) slipped through; routing through the shared
 * collector closes that hole.
 */
function canNestComposition(scene: Scene, parentId: string | null, childId: string): boolean {
  if (childId === parentId) return false;
  if (parentId === null) return true; // the main scene is never referenced by anyone
  // The child can already reach the parent ⇒ nesting it under the parent closes a loop.
  return !compositionClosure(scene, childId).has(parentId);
}

/**
 * Composition slice — the registry of compositions and which one is open
 * (`activeCompositionId`): open / drill, create / rename / duplicate / delete,
 * and nesting one composition inside another as an instance element (cycle-
 * checked). Cross-slice: `addComposition` opens via `setActiveComposition`, and
 * `addCompositionInstance` adds the instance element via the elements slice's
 * `addElement` — both reached through `designerStore`. See `state/README.md`.
 */
export const compositionSlice = {
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
   * D-086 Phase B — open (non-null) / close (null) the Preview modal on a composition
   * snapshot. Session-only: the in-canvas preview host renders the modal off this, so
   * the left-rail action bar can trigger it without re-rendering the editor tree.
   */
  setPreviewScene(scene: Scene | null): void {
    set({ previewScene: scene });
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
} as const;
