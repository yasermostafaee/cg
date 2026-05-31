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
};

type Listener = (state: DesignerStoreState) => void;
const listeners = new Set<Listener>();
let current = initialState;

function set(patch: Partial<DesignerStoreState>): void {
  current = { ...current, ...patch };
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

export const designerStore = {
  get(): DesignerStoreState {
    return current;
  },

  setScene(scene: Scene | null, projectPath: string | null): void {
    set({
      scene,
      projectPath,
      view: scene === null ? 'landing' : 'studio',
      selection: new Set<string>(),
      selectedKeyframe: null,
      keyframeInspectorOpen: false,
      currentFrame: 0,
    });
  },

  /** Explicitly switch top-level view (used by "back to projects"). */
  setView(view: DesignerView): void {
    if (view === current.view) return;
    set({ view });
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
      const next: Keyframe = { frame, value, easing };
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
  commitAnimatable(elementId: string, property: AnimatableProperty, value: number): void {
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
  writeStaticAnimatable(elementId: string, property: AnimatableProperty, value: number): void {
    if (current.scene === null) return;
    const found = locate(current.scene, elementId);
    if (found === null) return;
    const el = found.layer.children[found.elIdx];
    if (el === undefined) return;
    const tx = el.transform;
    switch (property) {
      case 'position.x':
        designerStore.updateTransform(elementId, { position: { ...tx.position, x: value } });
        return;
      case 'position.y':
        designerStore.updateTransform(elementId, { position: { ...tx.position, y: value } });
        return;
      case 'size.w':
        designerStore.updateTransform(elementId, { size: { ...tx.size, w: value } });
        return;
      case 'size.h':
        designerStore.updateTransform(elementId, { size: { ...tx.size, h: value } });
        return;
      case 'scale.x':
        designerStore.updateTransform(elementId, { scale: { ...tx.scale, x: value } });
        return;
      case 'scale.y':
        designerStore.updateTransform(elementId, { scale: { ...tx.scale, y: value } });
        return;
      case 'rotation':
        designerStore.updateTransform(elementId, { rotation: value });
        return;
      case 'opacity':
        designerStore.updateElement(elementId, { opacity: value } as Partial<Element>);
        return;
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
