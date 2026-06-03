import { useEffect, useState } from 'react';
import type {
  AnimatableProperty,
  DynamicField,
  Easing,
  Element,
  ElementAnimation,
  FieldBinding,
  Keyframe,
  Layer,
  Scene,
} from '@cg/shared-schema';
import { activeRangeOf } from '@cg/shared-schema';

/**
 * Designer renderer state — small pub-sub store with a JSON-patch-ish
 * scene mutation surface. Full undo/redo arrives in M7 alongside the
 * timeline; for M6 every mutation is immediate.
 *
 * Selection is a `Set<elementId>` — multi-select lands by shift-clicking
 * (M6.5's Inspector cares; canvas hit-test in M6.4 only sets single).
 */

export type DesignerTool = 'cursor' | 'text' | 'shape' | 'ellipse' | 'image' | 'hand';

export type DesignerView = 'landing' | 'studio';

export interface DesignerStoreState {
  scene: Scene | null;
  projectPath: string | null;
  /**
   * Top-level routing: the Designer starts at the Landing screen
   * (starter picker / recent / new) and flips to the Studio whenever
   * a scene becomes active. Clearing the scene flips it back.
   */
  view: DesignerView;
  tool: DesignerTool;
  /** Element IDs currently selected. */
  selection: ReadonlySet<string>;
  /** When set, the canvas shows an inline TextEditor for this element. */
  editingTextId: string | null;
  /**
   * When set, the next canvas click binds this field to the clicked
   * element instead of selecting it. Set by the Fields panel's
   * "Bind from canvas" button; cleared after the binding is created
   * or the operator presses Escape.
   */
  bindModeFieldId: string | null;
  /**
   * The "authoring cursor" frame the timeline dock sits at. Adding a
   * keyframe lands at this frame; editing a property's value through
   * the Inspector updates the keyframe (if any) on that frame for that
   * property instead of the static value. Clamped to the scene's
   * frameRange at write time.
   */
  currentFrame: number;
  /**
   * Currently-selected keyframe in the timeline. Drives the yellow
   * highlight on the diamond glyph (in the timeline lane, the track
   * row's left label, and the Inspector's per-row indicator). A bare
   * single-click on a timeline diamond sets only this — the Inspector
   * stays on the Element view.
   */
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
  /**
   * Whether the right-side Inspector is showing the dedicated Keyframe
   * Inspector (frame / value / easing editor) for `selectedKeyframe`.
   * Toggled true only by an explicit double-click on a keyframe diamond
   * (or by the "edit point" action). Single-click leaves it false so
   * the Inspector keeps showing the Element view with diamond indicators
   * lit up for the selected point.
   */
  keyframeInspectorOpen: boolean;
  /**
   * Horizontal zoom of the timeline lane: 1 = full scene span fits, 2 =
   * see half the frames at twice the width, etc. Controlled by the
   * status-bar slider; the dock derives a view window from this and the
   * playhead frame and pans automatically as the operator scrubs.
   */
  timelineZoom: number;
  /** Whether the past stack has at least one entry. */
  canUndo: boolean;
  /** Whether the future stack has at least one entry. */
  canRedo: boolean;
}

const initialState: DesignerStoreState = {
  scene: null,
  projectPath: null,
  view: 'landing',
  tool: 'cursor',
  selection: new Set<string>(),
  editingTextId: null,
  bindModeFieldId: null,
  currentFrame: 0,
  selectedKeyframe: null,
  keyframeInspectorOpen: false,
  timelineZoom: 1,
  canUndo: false,
  canRedo: false,
};

type Listener = (state: DesignerStoreState) => void;
const listeners = new Set<Listener>();
let current = initialState;

/**
 * Basic undo/redo: every time `set` writes a *different* Scene object
 * we push the prior one onto `past` and drop the redo stack. The
 * snapshot is the immutable scene reference itself (mutations always
 * produce a fresh object), so memory cost is one pointer per entry.
 *
 * `setScene` (project load / close) resets both stacks so the operator
 * can't undo across a project switch. Calls coming from `undo` /
 * `redo` set `suppressHistory` to avoid re-pushing the same value.
 *
 * Granularity is per-mutation — a long drag generates many history
 * entries. Coalescing intermediate frames into a single transaction
 * is a polish item for later.
 */
const MAX_HISTORY = 100;
/**
 * Coalescing window. Mutations that arrive within this many ms of the
 * last history push do not generate a new entry — they just update the
 * present. This is what lets a drag (or a live colour picker dragging
 * across hues) collapse to a single undo step that restores the
 * pre-burst state, instead of stepping back one ~16 ms tick per Ctrl+Z.
 * `markHistoryBoundary` lets explicit gestures (pointerup, key release)
 * close the burst early so the *next* mutation snapshots immediately.
 */
const COALESCE_MS = 300;
let past: Scene[] = [];
let future: Scene[] = [];
let suppressHistory = false;
let lastSnapshotAt = -Infinity;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function set(patch: Partial<DesignerStoreState>): void {
  if (
    patch.scene !== undefined &&
    patch.scene !== current.scene &&
    !suppressHistory &&
    current.scene !== null
  ) {
    const t = now();
    if (t - lastSnapshotAt > COALESCE_MS) {
      past.push(current.scene);
      if (past.length > MAX_HISTORY) past.shift();
      future = [];
    }
    lastSnapshotAt = t;
  }
  current = {
    ...current,
    ...patch,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
  for (const l of listeners) l(current);
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
  const nextLayers = [...current.scene.layers];
  nextLayers[layerIdx] = nextLayer;
  set({ scene: { ...current.scene, layers: nextLayers } });
}

/** Find the layer + index of an element. Used by every mutation. */
function locate(
  scene: Scene,
  elementId: string,
): { layer: Layer; layerIdx: number; elIdx: number } | null {
  for (let li = 0; li < scene.layers.length; li++) {
    const layer = scene.layers[li];
    if (layer === undefined) continue;
    const elIdx = layer.children.findIndex((e) => e.id === elementId);
    if (elIdx !== -1) return { layer, layerIdx: li, elIdx };
  }
  return null;
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

/**
 * In-memory element clipboard for the layer right-click Copy / Cut / Paste
 * actions. Module-level (not part of the scene or undo history) — the menu
 * reads `hasClipboardElement()` when it opens to enable/disable Paste.
 */
let clipboardElement: Element | null = null;

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
  const layer = current.scene.layers[layerIdx];
  if (layer === undefined) return;
  const nextChildren = [...layer.children];
  nextChildren.splice(Math.max(0, Math.min(nextChildren.length, pos)), 0, el);
  const nextLayer: Layer = { ...layer, children: nextChildren };
  const nextLayers = [...current.scene.layers];
  nextLayers[layerIdx] = nextLayer;
  set({
    scene: { ...current.scene, layers: nextLayers },
    ...(select ? { selection: new Set([el.id]) } : {}),
  });
}

export const designerStore = {
  get(): DesignerStoreState {
    return current;
  },

  setScene(scene: Scene | null, projectPath: string | null): void {
    past = [];
    future = [];
    clipboardElement = null;
    suppressHistory = true;
    try {
      set({
        scene: scene === null ? null : normalizeKeyframeIds(scene),
        projectPath,
        view: scene === null ? 'landing' : 'studio',
        selection: new Set<string>(),
        selectedKeyframe: null,
        keyframeInspectorOpen: false,
        currentFrame: 0,
      });
    } finally {
      suppressHistory = false;
    }
  },

  /**
   * Step backward in the per-scene undo history. No-op when the past
   * stack is empty. The redo stack receives the *current* scene so
   * `redo()` returns to it.
   */
  undo(): void {
    const prev = past[past.length - 1];
    if (prev === undefined) return;
    past = past.slice(0, -1);
    if (current.scene !== null) future.push(current.scene);
    suppressHistory = true;
    try {
      set({
        scene: prev,
        selection: new Set<string>(),
        selectedKeyframe: null,
        keyframeInspectorOpen: false,
      });
    } finally {
      suppressHistory = false;
    }
  },

  /**
   * Step forward through the redo stack. No-op when the future stack
   * is empty (i.e. there's nothing the operator has undone).
   */
  redo(): void {
    const next = future[future.length - 1];
    if (next === undefined) return;
    future = future.slice(0, -1);
    if (current.scene !== null) past.push(current.scene);
    suppressHistory = true;
    try {
      set({
        scene: next,
        selection: new Set<string>(),
        selectedKeyframe: null,
        keyframeInspectorOpen: false,
      });
    } finally {
      suppressHistory = false;
    }
  },

  /**
   * Force the next scene mutation to start a fresh history entry, even
   * if it lands within the coalescing window. Call this from gesture
   * endpoints (e.g. pointerup after a drag) so an immediately-following
   * unrelated edit doesn't fold into the drag's undo group.
   */
  markHistoryBoundary(): void {
    lastSnapshotAt = -Infinity;
  },

  /** Explicitly switch top-level view (used by "back to projects"). */
  setView(view: DesignerView): void {
    if (view === current.view) return;
    set({ view });
  },

  /**
   * Merge a shallow patch onto the active scene (background, name,
   * frameRange, etc.). The scene reference is replaced so React /
   * preview subscribers re-render through the existing pipeline.
   */
  updateScene(patch: Partial<Scene>): void {
    if (current.scene === null) return;
    set({ scene: { ...current.scene, ...patch } });
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
    const safe = Math.max(1, Math.floor(frames));
    const inFrame = current.scene.frameRange.in;
    const out = inFrame + safe;
    const nextFrame = Math.min(out, Math.max(inFrame, current.currentFrame));
    const prevActive = current.scene.activeRange;
    let activeRange = prevActive;
    if (prevActive !== undefined) {
      const aOut = Math.min(prevActive.out, out);
      const aIn = Math.max(inFrame, Math.min(prevActive.in, aOut - 1));
      activeRange = { in: aIn, out: aOut };
    }
    set({
      scene: { ...current.scene, frameRange: { in: inFrame, out }, activeRange },
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
    const { in: total0, out: total1 } = current.scene.frameRange;
    const inFrame = current.scene.activeRange?.in ?? total0;
    const out = Math.max(inFrame + 1, Math.min(total1, Math.round(outFrames)));
    const prev = current.scene.activeRange;
    if (prev !== undefined && prev.in === inFrame && prev.out === out) return;
    set({ scene: { ...current.scene, activeRange: { in: inFrame, out } } });
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

  /** Append a dynamic field to scene.fields. */
  addField(field: DynamicField): void {
    if (current.scene === null) return;
    const fields = [...current.scene.fields, field];
    set({ scene: { ...current.scene, fields } });
  },

  /**
   * D-011 — idempotently add a scene-level font (e.g. when a font asset
   * is imported). No-op if a font with the same `family` already exists
   * so the panel can call this on every mount without duplicating.
   */
  addSceneFont(font: {
    family: string;
    displayName?: string;
    assetId?: string;
  }): void {
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
    const fields = current.scene.fields.map((f) =>
      f.id === fieldId ? ({ ...f, ...patch } as DynamicField) : f,
    );
    set({ scene: { ...current.scene, fields } });
  },

  /** Remove a field and any bindings that reference it. */
  removeField(fieldId: string): void {
    if (current.scene === null) return;
    const fields = current.scene.fields.filter((f) => f.id !== fieldId);
    const bindings = current.scene.bindings.filter((b) => b.fieldId !== fieldId);
    set({ scene: { ...current.scene, fields, bindings } });
  },

  /** Append a binding (no dedup — same target appearing twice is allowed). */
  addBinding(binding: FieldBinding): void {
    if (current.scene === null) return;
    const bindings = [...current.scene.bindings, binding];
    set({ scene: { ...current.scene, bindings } });
  },

  /**
   * Remove a binding identified by its array index. Index-based removal
   * is unambiguous when two bindings share the same field/target.
   */
  removeBindingAt(index: number): void {
    if (current.scene === null) return;
    if (index < 0 || index >= current.scene.bindings.length) return;
    const bindings = current.scene.bindings.filter((_, i) => i !== index);
    set({ scene: { ...current.scene, bindings } });
  },

  /** Add one element to the first layer (creates a layer if none exist). */
  addElement(element: Element): void {
    if (current.scene === null) return;
    let scene = current.scene;
    if (scene.layers.length === 0) {
      const layer: Layer = {
        id: `L${String(Date.now())}`,
        name: 'Layer 1',
        visible: true,
        locked: false,
        children: [element],
        blendMode: 'normal',
      };
      scene = { ...scene, layers: [layer] };
    } else {
      const layers = scene.layers.map((l, i) =>
        i === 0 ? { ...l, children: [...l.children, element] } : l,
      );
      scene = { ...scene, layers };
    }
    set({ scene, selection: new Set([element.id]) });
  },

  /** Set the timeline horizontal zoom, clamped to [1, 20]. */
  setTimelineZoom(z: number): void {
    const clamped = Math.max(1, Math.min(20, z));
    if (clamped === current.timelineZoom) return;
    set({ timelineZoom: clamped });
  },

  /** Move the authoring cursor frame, clamped to the scene's frame range. */
  setCurrentFrame(frame: number): void {
    if (current.scene === null) return;
    const { in: lo, out: hi } = current.scene.frameRange;
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
      const without = existing.keyframes.filter((k) => k.frame !== fromFrame && k.frame !== toFrame);
      const moved: Keyframe = { ...target, frame: toFrame };
      const next = [...without, moved].sort((a, b) => a.frame - b.frame);
      actuallyMoved = true;
      return { ...anim, tracks: { ...anim.tracks, [property]: { keyframes: next } } };
    });
    if (
      actuallyMoved &&
      current.selectedKeyframe !== null &&
      current.selectedKeyframe.elementId === elementId &&
      current.selectedKeyframe.property === property &&
      current.selectedKeyframe.frame === fromFrame
    ) {
      set({ selectedKeyframe: { elementId, property, frame: toFrame } });
    }
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
    if (
      oldFrame !== null &&
      current.selectedKeyframe !== null &&
      current.selectedKeyframe.elementId === elementId &&
      current.selectedKeyframe.property === property &&
      current.selectedKeyframe.frame === oldFrame
    ) {
      set({ selectedKeyframe: { elementId, property, frame: toFrame } });
    }
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
    if (
      current.selectedKeyframe !== null &&
      current.selectedKeyframe.elementId === elementId &&
      current.selectedKeyframe.property === property &&
      current.selectedKeyframe.frame === frame
    ) {
      set({ selectedKeyframe: null, keyframeInspectorOpen: false });
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
  commitAnimatable(
    elementId: string,
    property: AnimatableProperty,
    value: number | string,
  ): void {
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
  setSelectedKeyframe(
    key: { elementId: string; property: AnimatableProperty; frame: number } | null,
  ): void {
    const cur = current.selectedKeyframe;
    const keepOpen =
      current.keyframeInspectorOpen &&
      key !== null &&
      cur !== null &&
      cur.elementId === key.elementId &&
      cur.property === key.property &&
      cur.frame === key.frame;
    set({ selectedKeyframe: key, keyframeInspectorOpen: keepOpen });
  },

  /** Open the right-side Keyframe Inspector for a specific point. */
  openKeyframeInspector(key: {
    elementId: string;
    property: AnimatableProperty;
    frame: number;
  }): void {
    set({ selectedKeyframe: key, keyframeInspectorOpen: true });
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
        designerStore.updateElement(elementId, { cornerRadius: numeric } as unknown as Partial<Element>);
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
    const merged = { ...existing, ...patch } as Element;
    const nextChildren = [...layer.children];
    nextChildren[elIdx] = merged;
    const nextLayer: Layer = { ...layer, children: nextChildren };
    const nextLayers = [...current.scene.layers];
    nextLayers[layerIdx] = nextLayer;
    set({ scene: { ...current.scene, layers: nextLayers } });
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
    const nextLayers = [...current.scene.layers];
    nextLayers[layerIdx] = nextLayer;
    set({ scene: { ...current.scene, layers: nextLayers } });
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
    for (const layer of current.scene.layers) collectRemoved(layer.children);

    const nextLayers = current.scene.layers.map((l) => ({ ...l, children: visit(l.children) }));
    const nextFonts = current.scene.fonts.filter((f) => f.family !== family);

    const nextSelection = new Set(current.selection);
    for (const id of removedImageIds) nextSelection.delete(id);
    const sk = current.selectedKeyframe;
    const keepKey = sk !== null && !removedImageIds.has(sk.elementId);

    set({
      scene: { ...current.scene, layers: nextLayers, fonts: nextFonts },
      selection: nextSelection,
      selectedKeyframe: keepKey ? sk : null,
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
  updateElementLifespan(
    elementId: string,
    lifespan: { in: number; out: number } | null,
  ): void {
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
      const { in: sIn, out: sOut } = current.scene.frameRange;
      const lo = Math.max(sIn, Math.min(sOut, Math.round(lifespan.in)));
      const hi = Math.max(sIn, Math.min(sOut, Math.round(lifespan.out)));
      if (hi < lo) return;
      next = { ...existing, lifespan: { in: lo, out: hi } } as Element;
    }
    const nextChildren = [...layer.children];
    nextChildren[elIdx] = next;
    const nextLayer: Layer = { ...layer, children: nextChildren };
    const nextLayers = [...current.scene.layers];
    nextLayers[layerIdx] = nextLayer;
    set({ scene: { ...current.scene, layers: nextLayers } });
  },

  /** Remove an element by id. Cleans up the selection set if needed. */
  removeElement(elementId: string): void {
    if (current.scene === null) return;
    const found = locate(current.scene, elementId);
    if (found === null) return;
    const { layer, layerIdx, elIdx } = found;
    const nextChildren = layer.children.filter((_, i) => i !== elIdx);
    const nextLayer: Layer = { ...layer, children: nextChildren };
    const nextLayers = [...current.scene.layers];
    nextLayers[layerIdx] = nextLayer;
    const nextSelection = new Set(current.selection);
    nextSelection.delete(elementId);
    const keepKey =
      current.selectedKeyframe !== null && current.selectedKeyframe.elementId !== elementId;
    set({
      scene: { ...current.scene, layers: nextLayers },
      selection: nextSelection,
      selectedKeyframe: keepKey ? current.selectedKeyframe : null,
      keyframeInspectorOpen: keepKey ? current.keyframeInspectorOpen : false,
    });
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
    const r = activeRangeOf(current.scene);
    designerStore.updateElementLifespan(elementId, { in: r.in, out: r.out });
  },

  /** Copy an element into the in-memory clipboard (for Paste). */
  copyElement(elementId: string): void {
    if (current.scene === null) return;
    const found = locate(current.scene, elementId);
    if (found === null) return;
    const el = found.layer.children[found.elIdx];
    if (el === undefined) return;
    clipboardElement = structuredClone(el);
  },

  /** Copy an element to the clipboard, then remove it from the scene. */
  cutElement(elementId: string): void {
    designerStore.copyElement(elementId);
    designerStore.removeElement(elementId);
  },

  /** True when there is a clipboard element available to paste. */
  hasClipboardElement(): boolean {
    return clipboardElement !== null;
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
    if (current.scene === null || clipboardElement === null) return;
    const clone = cloneElementWithNewIds(clipboardElement);
    if (current.scene.layers.length === 0) {
      designerStore.addElement(clone);
      return;
    }
    const selId = [...current.selection][0];
    const sel = selId === undefined ? null : locate(current.scene, selId);
    const layerIdx = sel?.layerIdx ?? 0;
    const layer = current.scene.layers[layerIdx];
    const pos = sel !== null ? sel.elIdx + 1 : (layer?.children.length ?? 0);
    insertElementAt(layerIdx, pos, clone, true);
  },

  /** All elements across all layers, top-of-stack first (last layer index = topmost). */
  allElements(): readonly Element[] {
    if (current.scene === null) return [];
    const out: Element[] = [];
    for (const layer of current.scene.layers) {
      for (const el of layer.children) out.push(el);
    }
    return out;
  },

  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  /** Reset for tests. */
  _reset(): void {
    past = [];
    future = [];
    clipboardElement = null;
    suppressHistory = false;
    lastSnapshotAt = -Infinity;
    current = {
      ...initialState,
      selection: new Set<string>(),
      editingTextId: null,
      bindModeFieldId: null,
      currentFrame: 0,
      selectedKeyframe: null,
      keyframeInspectorOpen: false,
      view: 'landing',
    };
    listeners.clear();
  },
} as const;

/** React hook for the whole store. Re-renders on any change. */
export function useDesignerStore(): DesignerStoreState {
  const [state, setState] = useState(current);
  useEffect(() => designerStore.subscribe(setState), []);
  return state;
}
