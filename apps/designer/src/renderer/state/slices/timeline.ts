import type {
  AnimatableProperty,
  Easing,
  Element,
  ElementAnimation,
  Keyframe,
  Layer,
} from '@cg/shared-schema';
import { current, set, type KeyframeRef } from '../store-core.js';
import {
  activeDocOf,
  activeLayersOf,
  freshKeyframeId,
  locate,
  withActiveLayers,
} from '../scene-doc.js';
import { designerStore } from '../store.js';

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

/**
 * Timeline / keyframes slice — the authoring playhead (`currentFrame`) + lane
 * zoom, the per-property keyframe CRUD (upsert / move / move-by-id / remove),
 * the keyframe selection + inspector toggles, per-keyframe value/easing/bézier
 * edits, and the track-aware `commitAnimatable` routing (keyframe when the
 * property is animated, else the element's static value via
 * `writeStaticAnimatable`). Cross-slice: the static-write + commit routing reach
 * the elements slice's `updateElement`/`updateTransform` through `designerStore`.
 * See `state/README.md`.
 */
export const timelineSlice = {
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
   * Remove an element's ENTIRE keyframe track for a property (every keyframe),
   * pruning the `animation` field when no tracks remain. Used when a fill/colour
   * mode change makes the property non-keyframe-able (B-014) — the orphaned track
   * must not keep animating once the diamond is gone. No-op when there is no track.
   * Clears any selection refs that pointed at the removed track so the keyframe
   * inspector doesn't dangle. Wrap in `runAsSingleHistoryEntry` with the mode change
   * for one-undo recovery.
   */
  clearKeyframeTrack(elementId: string, property: AnimatableProperty): void {
    let hadTrack = false;
    mutateAnimation(elementId, (anim) => {
      if (anim.tracks[property] === undefined) return anim;
      hadTrack = true;
      const tracks: ElementAnimation['tracks'] = { ...anim.tracks };
      delete tracks[property];
      return { ...anim, tracks };
    });
    if (!hadTrack) return;
    // Drop selection refs that pointed at ANY keyframe of the removed track.
    const refsTrack = (r: KeyframeRef): boolean =>
      r.elementId === elementId && r.property === property;
    const nextList = current.selectedKeyframes.filter((r) => !refsTrack(r));
    const primaryGone = current.selectedKeyframe !== null && refsTrack(current.selectedKeyframe);
    if (nextList.length !== current.selectedKeyframes.length || primaryGone) {
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
    // D-042 — the background-capable kinds that carry the shared box style
    // (stroke + border radius). Static stroke is editable on all of them; stroke
    // ANIMATION stays shape-only (Option A — the applier is gated, not this write).
    const boxKind =
      el.type === 'shape' ||
      el.type === 'text' ||
      el.type === 'ticker' ||
      el.type === 'clock' ||
      el.type === 'sequence';
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
      // D-010 / D-042 — border radius. `cornerRadius` is the uniform value; the
      // per-corner sub-props each write one corner of the [tl,tr,br,bl] tuple.
      case 'cornerRadius':
        designerStore.updateElement(elementId, {
          cornerRadius: numeric,
        } as unknown as Partial<Element>);
        return;
      case 'cornerRadius.tl':
      case 'cornerRadius.tr':
      case 'cornerRadius.br':
      case 'cornerRadius.bl': {
        const cur = (el as { cornerRadius?: number | [number, number, number, number] })
          .cornerRadius;
        const tuple: [number, number, number, number] = Array.isArray(cur)
          ? [cur[0], cur[1], cur[2], cur[3]]
          : typeof cur === 'number'
            ? [cur, cur, cur, cur]
            : [0, 0, 0, 0];
        const idx =
          property === 'cornerRadius.tl'
            ? 0
            : property === 'cornerRadius.tr'
              ? 1
              : property === 'cornerRadius.br'
                ? 2
                : 3;
        tuple[idx] = numeric;
        designerStore.updateElement(elementId, {
          cornerRadius: tuple,
        } as unknown as Partial<Element>);
        return;
      }
      case 'stroke.width': {
        if (!boxKind) return;
        const stroke = {
          ...((el as { stroke?: { color: string; width: number } }).stroke ?? {
            color: '#000000',
            width: 0,
          }),
          width: numeric,
        };
        designerStore.updateElement(elementId, { stroke } as unknown as Partial<Element>);
        return;
      }
      case 'stroke.dash': {
        if (!boxKind) return;
        const base = (el as { stroke?: { color: string; width: number } }).stroke ?? {
          color: '#000000',
          width: 0,
        };
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
        if (!boxKind || typeof value !== 'string') return;
        const base = (el as { stroke?: { color: string; width: number } }).stroke ?? {
          width: 0,
          color: '#000000',
        };
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
} as const;
