import type { AnimatableProperty, Element } from '@cg/shared-schema';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { KeyframeIndicator } from '../timeline/KeyframeIndicator.js';
import {
  TIMELINE_ROWS,
  effectiveAnimatableValue,
  effectiveOpacityAt,
  effectivePathLocalRect,
  hasKeyframeAt,
  keyframeVariantFor,
} from '../timeline/keyframe-helpers.js';
import { descriptorFor, isKeyframeable, withheldReason } from './field-registry.js';
import { Seg, SingleField, transformFieldProps } from './transform-fields.js';
import * as s from './TransformSection.css.js';
import { renderedTransformAt } from '../../state/slices/arrangements.js';

interface Props {
  element: Element;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}

/**
 * Compact Loopic-style transform inspector. Each row is one or two cells styled
 * like a chip — single-letter / arrow / glyph "icon" labels (X, Y, W, H, ↔, ↕,
 * ↻, ◑) — followed by a small KeyframeIndicator diamond. The field primitives +
 * per-property display metadata (icon / unit / stored↔shown conversion) live in
 * `transform-fields.tsx` and are SHARED with the multi-selection editor (D-049).
 * The 8 animatable properties commit through `commitAnimatable` so an edit at
 * any frame on an animated property lands as a keyframe at the current frame.
 */
export function TransformSection({ element, selectedKeyframe }: Props): JSX.Element {
  // Self-subscribe to the frame so only this value-bearing section re-renders
  // during playback, not the whole inspector.
  const currentFrame = useDesignerSelector((s) => s.currentFrame);
  // Show the *effective* values at the current frame so editing a keyframe (or
  // scrubbing) updates these fields in lock-step with the canvas, not the
  // element's frozen static transform.
  // 🔴 D-154, option (a) — with an arrangement active this panel SHOWS and EDITS the cell.
  // Option (b) (keep the authored numbers, mark them overridden) was refused: it leaves two
  // number sets on screen claiming to be the same thing, which is the shape this repo keeps
  // paying for. The write side needs nothing here — `commitAnimatable` routes to the cell.
  // B-175 — through the ONE read side, so this panel's numbers and the canvas gestures are
  // the same value by construction rather than by two call sites spelling it the same way.
  const t = renderedTransformAt(element, currentFrame);
  const opacity = effectiveOpacityAt(element, currentFrame);
  const id = element.id;

  /**
   * The diamond for `property`, or `undefined` when this element's kind cannot
   * keyframe it.
   *
   * `isKeyframeable` is THE rule the timeline-left obeys too, so a kind that
   * declares a property static (D-137's Live Source: the rect is composed once at
   * import and sent as a static `MIXER FILL`) loses the diamond on BOTH surfaces
   * from one edit. `point` is already optional — the multi-select editor omits it —
   * so an absent diamond leaves no gap in the row.
   */
  function indicatorFor(property: AnimatableProperty): JSX.Element | undefined {
    if (!isKeyframeable(element, property)) return undefined;
    const variant = keyframeVariantFor(element, property, currentFrame, selectedKeyframe);
    return (
      <KeyframeIndicator
        variant={variant}
        onClick={() => togglePropertyKeyframe(element, property, currentFrame)}
        ariaLabel={`Toggle keyframe for ${property} at frame ${String(currentFrame)}`}
      />
    );
  }

  // D-137 — a kind may declare a transform property UNMANAGED. A Live Source drops
  // `rotation` (`MIXER FILL` is axis-aligned, so a rotated plate declares its bounding box
  // and the picture shows outside the frame the author drew) and `opacity` (the plate
  // paints nothing on air; the picture is drawn by CasparCG above the page, out of reach of
  // anything the page could fade). A control that cannot change what airs is a control
  // that lies.
  //
  // ⭐ `DESIGNER-FIX-0905` — an unmanaged property is WITHHELD, not hidden: the field
  // stays, disabled, with the registry's reason as its tooltip. It used to vanish, and a
  // paragraph elsewhere explained the absence; the absence taught nothing on its own. The
  // decision (`descriptorFor`) and the reason (`withheldReason`) come from the ONE registry.
  const rotationWithheld =
    descriptorFor(element, 'rotation') === undefined
      ? (withheldReason(element, 'rotation') ?? 'Not available for this element')
      : undefined;
  const opacityWithheld =
    descriptorFor(element, 'opacity') === undefined
      ? (withheldReason(element, 'opacity') ?? 'Not available for this element')
      : undefined;

  // Commit a property's STORED value (the shared field props convert the
  // displayed value — e.g. opacity %, scale % — back to stored units).
  const commit =
    (property: AnimatableProperty) =>
    (v: number): void =>
      designerStore.commitAnimatable(id, property, v);

  // B-059/B-062 — a STATIC path needs no special-casing: `transform.size` IS the
  // visual curve-aware bbox under the owner model. D-110 (owner decision
  // 2026-07-11) — a KEYFRAMED path's W/H are LIVE: they display the morphed
  // outline's extents at the playhead, and a typed value scales the shape so the
  // LIVE extent matches it (committed as the equivalent base size — the uniform
  // static+snapshot bake / size keyframe then scales the live extent by exactly
  // that ratio). `null` for every other kind — behavior unchanged.
  const liveRect = effectivePathLocalRect(element, currentFrame);
  const sizeW = liveRect?.w ?? t.size.w;
  const sizeH = liveRect?.h ?? t.size.h;
  const commitW = (v: number): void =>
    commit('size.w')(liveRect === null ? v : t.size.w * (v / Math.max(liveRect.w, 1e-6)));
  const commitH = (v: number): void =>
    commit('size.h')(liveRect === null ? v : t.size.h * (v / Math.max(liveRect.h, 1e-6)));

  return (
    <div className={s.col}>
      {/* Position X/Y — one combined field, each axis editable separately. */}
      <div className="cg-input-group">
        <Seg
          {...transformFieldProps('position.x', t.position.x, commit('position.x'))}
          point={indicatorFor('position.x')}
        />
        <Seg
          {...transformFieldProps('position.y', t.position.y, commit('position.y'))}
          point={indicatorFor('position.y')}
        />
      </div>
      {/* Size W/H — live morph extents for a keyframed path (D-110). */}
      <div className="cg-input-group">
        <Seg {...transformFieldProps('size.w', sizeW, commitW)} point={indicatorFor('size.w')} />
        <Seg {...transformFieldProps('size.h', sizeH, commitH)} point={indicatorFor('size.h')} />
      </div>
      {/* Scale X/Y (percent) */}
      <div className="cg-input-group">
        <Seg
          {...transformFieldProps('scale.x', t.scale.x, commit('scale.x'))}
          point={indicatorFor('scale.x')}
        />
        <Seg
          {...transformFieldProps('scale.y', t.scale.y, commit('scale.y'))}
          point={indicatorFor('scale.y')}
        />
      </div>
      {/* Rotation (degrees) — single field, diamond outside the border. Withheld (disabled,
          reason as tooltip) for a kind whose registry drops it. */}
      <SingleField
        {...transformFieldProps('rotation', t.rotation, commit('rotation'))}
        point={indicatorFor('rotation')}
        withheld={rotationWithheld}
      />
      {/* Opacity (percent) — single field, diamond outside the border. */}
      <SingleField
        {...transformFieldProps('opacity', opacity, commit('opacity'))}
        point={indicatorFor('opacity')}
        withheld={opacityWithheld}
      />
    </div>
  );
}

/**
 * Toggle a keyframe for `property` at `frame` from a diamond click. Exported for
 * regression coverage (B-005): the added keyframe must capture the EVALUATED value
 * at the playhead, not the element's static base.
 */
export function togglePropertyKeyframe(
  element: Element,
  property: AnimatableProperty,
  frame: number,
): void {
  if (hasKeyframeAt(element, property, frame)) {
    designerStore.removeKeyframe(element.id, property, frame);
    return;
  }
  const row = TIMELINE_ROWS.find((r) => r.property === property);
  if (row === undefined) return;
  // Capture the EVALUATED value at the playhead (what the field shows and the
  // canvas renders) — not the element's static base — so adding a keyframe past
  // an existing one holds the animated value instead of reverting it (B-005).
  const value = effectiveAnimatableValue(element, property, frame, row.read(element));
  designerStore.upsertKeyframe(element.id, property, frame, value);
}
