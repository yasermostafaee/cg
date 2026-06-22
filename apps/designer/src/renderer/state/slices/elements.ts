import type { AnimatableProperty, Element, Layer } from '@cg/shared-schema';
import { activeRangeOf, compositionInstancesOf, uniqueInstanceName } from '@cg/shared-schema';
import { current, getClipboard, set, setClipboard } from '../store-core.js';
import {
  activeDocOf,
  activeFieldData,
  activeLayersOf,
  freshElementId,
  locate,
  reassignIdsDeep,
  withActiveFieldData,
  withActiveLayers,
} from '../scene-doc.js';
import { designerStore } from '../store.js';
import { collectGroupMoveTargets } from '../../features/canvas/group-move.js';

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
 * D-047 — flatten the layers' children into one list in the SAME order the
 * timeline names column derives its rows from (walk each layer, recursing into
 * container children). The timeline shows `[...this].reverse()` (top row =
 * front-most), so the reorder maps a displayed top→bottom index back onto this.
 */
function flattenLayerChildren(layers: readonly Layer[]): Element[] {
  const out: Element[] = [];
  const walk = (children: readonly Element[]): void => {
    for (const el of children) {
      out.push(el);
      if (el.type === 'container') walk(el.children);
    }
  };
  for (const layer of layers) walk(layer.children);
  return out;
}

/**
 * D-088 — is `layer` the UNTOUCHED scaffold that {@link addElement} auto-creates when a
 * composition has none? (Auto id `L<digits>`, the default name/props, not locked.) Used by
 * `removeElement` to prune the orphaned empty layer when its last child is deleted, so
 * add→delete returns the document to its pre-add form. A layer the operator customized
 * (renamed / blend mode / locked) or that still has children is NEVER a scaffold.
 */
function isAutoScaffoldLayer(layer: Layer): boolean {
  return (
    /^L\d+$/.test(layer.id) &&
    layer.name === 'Layer 1' &&
    layer.visible === true &&
    layer.locked === false &&
    layer.blendMode === 'normal'
  );
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

/**
 * Elements slice — the layer-tree element CRUD: add / patch / transform /
 * lifespan / remove, the clipboard ops (copy / cut / paste / duplicate), the
 * selection-driven `deleteSelection` (keyframes first, else elements), asset
 * cascade-cleanup, and read helpers. Cross-slice: `deleteSelection` dispatches
 * to the timeline slice's `removeKeyframe`, `setElementText` syncs the Data-key
 * default via the fields slice, and several actions call sibling element methods
 * — all through `designerStore`. See `state/README.md`.
 */
export const elementsSlice = {
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

  /**
   * D-047 — reorder an element within its sibling set by dragging its timeline
   * row. `targetVisualIndex` is the destination in the timeline's displayed
   * top→bottom order (`[...flatten].reverse()`, so top = front-most). The element
   * moves only within its OWN parent layer's direct children — never across layers
   * or into/out of a container — and that sibling set's `zIndex` is renumbered so
   * the displayed top→bottom order maps to DESCENDING `zIndex` (top = highest =
   * front-most). Renumbering by array index makes the runtime's ascending-`zIndex`
   * paint order match the new order and fixes the all-zero default. Wrapped as ONE
   * undo entry. No-op when the target equals the origin, or when the id is not a
   * direct layer child (e.g. a nested container child — out of this scope).
   */
  reorderElement(elementId: string, targetVisualIndex: number): void {
    const scene = current.scene;
    if (scene === null) return;
    const found = locate(scene, elementId);
    if (found === null) return; // unknown / nested container child — out of scope
    // Visual order = timeline rows, front→back (top row first).
    const visual = flattenLayerChildren(activeLayersOf(scene)).reverse();
    const origin = visual.findIndex((e) => e.id === elementId);
    if (origin === -1) return;
    const target = Math.max(0, Math.min(visual.length - 1, Math.round(targetVisualIndex)));
    if (target === origin) return; // dropped at the origin — nothing changes
    // Move in visual (front→back) space, then restrict to the element's own
    // siblings so a cross-parent drop clamps back into the sibling set.
    const movedVisual = [...visual];
    const [item] = movedVisual.splice(origin, 1);
    if (item === undefined) return;
    movedVisual.splice(target, 0, item);
    const siblingIds = new Set(found.layer.children.map((e) => e.id));
    const newFrontToBack = movedVisual.filter((e) => siblingIds.has(e.id));
    // Array/paint order is back→front (the reverse of front→back); renumber zIndex
    // by array index so paint order (ascending) == array order == the new stack.
    const newChildren = newFrontToBack.reverse().map((el, i) => ({ ...el, zIndex: i }) as Element);
    const nextLayer: Layer = { ...found.layer, children: newChildren };
    const nextLayers = [...activeLayersOf(scene)];
    nextLayers[found.layerIdx] = nextLayer;
    designerStore.runAsSingleHistoryEntry(() => {
      set({ scene: withActiveLayers(scene, nextLayers) });
    });
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
    const nextLayers = [...activeLayersOf(current.scene)];
    // D-088 — if this removal empties an UNTOUCHED auto-created scaffold layer, prune it so
    // add→delete undoes `addElement`'s layer side-effect (no orphaned empty "Layer 1"). A
    // customized or still-populated layer is kept.
    if (nextChildren.length === 0 && isAutoScaffoldLayer(layer)) {
      nextLayers.splice(layerIdx, 1);
    } else {
      nextLayers[layerIdx] = { ...layer, children: nextChildren };
    }
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
   * D-041 — apply ONE animatable property value to every id in a
   * multi-selection as a SINGLE undo step. Routes through the keyframe-free
   * base write (`writeStaticAnimatable`) — group editing in v1 never
   * creates/alters keyframes (`commitAnimatable` WOULD keyframe an element that
   * already has a track for the property) — and wraps the fan-out in
   * `runAsSingleHistoryEntry` so N elements collapse to ONE history entry, not N.
   * Each per-element write that doesn't apply to that kind is a no-op in
   * `writeStaticAnimatable`, so a shared property is only ever offered when the
   * intersection guarantees every selected kind accepts it.
   */
  applySharedProperty(
    ids: readonly string[],
    property: AnimatableProperty,
    value: number | string,
  ): void {
    designerStore.runAsSingleHistoryEntry(() => {
      for (const id of ids) designerStore.writeStaticAnimatable(id, property, value);
    });
  },

  /**
   * D-053 — the LIVE multi-apply path for a continuous gesture (drag-scrub /
   * typing) on a multi-selection number field. Fans the same keyframe-free base
   * write (`writeStaticAnimatable`) over the selected ids but WITHOUT a history
   * boundary, so consecutive live calls time-coalesce in `store-core.set`'s
   * COALESCE window into ONE undo entry — exactly like the single-element drag's
   * per-tick `commitAnimatable`. The caller sets ONE `markHistoryBoundary()` at
   * the gesture endpoint (drag release / Enter / blur) to close the burst and
   * isolate the next edit. Use `applySharedProperty` (boundary-wrapped) instead
   * for discrete one-shot commits (colour pick / gradient) that are each one entry.
   */
  applySharedPropertyLive(
    ids: readonly string[],
    property: AnimatableProperty,
    value: number | string,
  ): void {
    for (const id of ids) designerStore.writeStaticAnimatable(id, property, value);
  },

  /**
   * D-054 (Option B) — the LIVE keyframe-AWARE multi-apply path. Identical to
   * `applySharedPropertyLive` but loops the shared `commitAnimatable` instead of
   * `writeStaticAnimatable`: a selected member WITH a track on the property gets a
   * keyframe at the current frame (the upsert at a fixed frame coalesces across
   * ticks exactly like the static write), a member WITHOUT one writes its static
   * base — the SAME rule single-element drag uses. No per-tick history boundary;
   * the caller sets ONE at the gesture endpoint. `commitAnimatable` itself is NOT
   * modified — this only adds a new caller (the recon's reuse-not-rewrite seam).
   */
  applySharedPropertyLiveKeyframed(
    ids: readonly string[],
    property: AnimatableProperty,
    value: number | string,
  ): void {
    for (const id of ids) designerStore.commitAnimatable(id, property, value);
  },

  /**
   * D-054 (Option B) — the DISCRETE keyframe-AWARE group commit (colour pick /
   * solid fill). Like `applySharedProperty` but loops `commitAnimatable`, so an
   * edited member with a track keyframes at the playhead and others write static —
   * one undo entry. Without this, editing a colour that HAS a track would write a
   * static base the runtime ignores (the edit would be invisible at a keyframed
   * frame) — the same class D-054 fixes for numbers.
   */
  applySharedPropertyKeyframed(
    ids: readonly string[],
    property: AnimatableProperty,
    value: number | string,
  ): void {
    designerStore.runAsSingleHistoryEntry(() => {
      for (const id of ids) designerStore.commitAnimatable(id, property, value);
    });
  },

  /**
   * D-073 — move the current selection by `(dx, dy)` scene px (arrow-key nudge). MIRRORS
   * the `beginGroupDrag` move path: resolve the MOVABLE members (selected, visible,
   * unlocked, evaluated at the playhead) via `collectGroupMoveTargets`, then loop the SAME
   * keyframe-aware `commitAnimatable('position.x'/'position.y', start + delta)` — a member
   * with a track on the axis keyframes at the playhead (B-005-safe), others write static.
   * No snapping (anchor/snap targets are unused). Like `applySharedPropertyLiveKeyframed`
   * it sets NO history boundary: the caller (the App.tsx keydown) sets ONE per key-run so a
   * held key (auto-repeat) coalesces into one undo step.
   */
  nudgeSelection(dx: number, dy: number): void {
    if (current.scene === null) return;
    const selection = current.selection;
    if (selection.size === 0) return;
    const { resolution } = activeDocOf(current.scene);
    const layers = activeLayersOf(current.scene);
    const anchorId = [...selection][0]!; // movers don't depend on the anchor — any selected id
    const { movers } = collectGroupMoveTargets(
      layers,
      selection,
      anchorId,
      current.currentFrame,
      resolution,
    );
    for (const m of movers) {
      designerStore.commitAnimatable(m.id, 'position.x', m.x + dx);
      designerStore.commitAnimatable(m.id, 'position.y', m.y + dy);
    }
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
} as const;
