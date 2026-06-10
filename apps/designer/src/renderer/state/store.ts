import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type {
  AnimatableProperty,
  Easing,
  Element,
  ElementAnimation,
  Keyframe,
  Layer,
} from '@cg/shared-schema';
import { activeRangeOf, uniqueInstanceName, compositionInstancesOf } from '@cg/shared-schema';
import {
  _resetCore,
  current,
  getClipboard,
  markHistoryBoundary,
  markSaved,
  redo,
  set,
  setClipboard,
  subscribe,
  undo,
  type DesignerStoreState,
  type DesignerTool,
  type DesignerView,
  type KeyframeRef,
} from './store-core.js';
import {
  activeDocOf,
  activeFieldData,
  activeLayersOf,
  editSceneOf,
  freshElementId,
  freshKeyframeId,
  locate,
  reassignIdsDeep,
  withActiveFieldData,
  withActiveLayers,
} from './scene-doc.js';
import { compositionSlice } from './slices/composition.js';
import { documentSlice } from './slices/document.js';
import { fieldsSlice, type ElementFieldMetaPatch } from './slices/fields.js';
import { selectionSlice } from './slices/selection.js';
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

  // Document lifecycle (setScene/setView/notice) + active-doc scene props
  // (duration / active region / lifecycle / playout).
  ...documentSlice,

  // Undo/redo + the history boundary/save markers live in `store-core.ts` — the
  // history engine is welded to `set`'s coalescing and the `dirty` flag.
  undo,
  redo,
  markHistoryBoundary,
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
