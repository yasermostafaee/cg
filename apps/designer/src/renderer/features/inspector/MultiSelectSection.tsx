import type { AnimatableProperty, Element, Fill } from '@cg/shared-schema';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { CollapseSection } from './CollapseSection.js';
import { ColorField, NumberField } from './controls.js';
import { FillField } from './FillPopover.js';
import { MultiKeyframeDot } from './keyframe-diamond.js';
import { Seg, SingleField, transformFieldProps } from './transform-fields.js';
import {
  sharedEditableProperties,
  type SharedProperty,
  type SharedSection,
} from './shared-properties.js';
import { clearOrphanColourTrack } from './fill-commit.js';
import * as s from './InspectorPanel.css.js';
import * as tx from './TransformSection.css.js';

/** Non-transform sections, in the single-inspector order (Transform is rendered first, explicitly). */
const SECTION_ORDER: readonly SharedSection[] = [
  'Path Style',
  'Border Radius',
  'Drop Shadow',
  'Filter',
];

/**
 * Multi-selection inspector (D-041 / D-049 / D-050). Shown when more than one
 * element is selected; renders ALL properties COMMON to the selected kinds (the
 * intersection from `sharedEditableProperties`) using the SAME primitives and
 * section grouping as the single inspector — the horizontal-drag number field
 * under Transform, plus Path Style / Border Radius / Drop Shadow / Filter via
 * `NumberField` / `ColorField` / `FillField`. A field whose selected elements
 * DIFFER shows the neutral "mixed" state through the same primitive.
 *
 * Commit model (D-053 + D-054): each field is the SAME primitive as single
 * selection — drag-scrub + live (onChange) updates — and now KEYFRAME-AWARE
 * (Option B). Number-field live values fan out through
 * `applySharedPropertyLiveKeyframed` (loops `commitAnimatable`: a member with a
 * track keyframes at the playhead, others write static; NO per-tick boundary so the
 * burst coalesces), with `onCommitBoundary` → `markHistoryBoundary` once at the
 * gesture endpoint = ONE undo. Discrete colour / solid-fill commits use
 * `applySharedPropertyKeyframed` (one undo). Each shared keyframe-able property
 * shows an aggregate `MultiKeyframeDot` (empty / at-frame / partial) whose click
 * toggles keyframes across the selection in one undo (D-054).
 */
export function MultiSelectSection({ elements }: { elements: readonly Element[] }): JSX.Element {
  const shared = sharedEditableProperties(elements);
  const ids = elements.map((e) => e.id);
  const byKey = new Map(shared.map((sp) => [sp.descriptor.key, sp]));

  const has = (key: string): boolean => byKey.has(key);
  const isMixed = (key: string): boolean => byKey.get(key)?.mixed === true;
  const numOf = (key: string): number => {
    const v = byKey.get(key)?.value;
    return typeof v === 'number' ? v : 0;
  };
  // D-054 — the playhead drives keyframe-vs-static per member (via commitAnimatable),
  // and the aggregate diamond's state; subscribe so it tracks playback.
  const currentFrame = useDesignerSelector((st) => st.currentFrame);
  // Number fields apply LIVE during the gesture (drag-scrub / typing) with no
  // per-tick boundary, KEYFRAME-AWARE (Option B — a member with a track keyframes at
  // the playhead, others write static), then set ONE history boundary at the commit
  // endpoint so the whole edit is one undo entry across the selection.
  const applyNumLive =
    (prop: AnimatableProperty) =>
    (v: number): void =>
      designerStore.applySharedPropertyLiveKeyframed(ids, prop, v);
  const commitBoundary = (): void => designerStore.markHistoryBoundary();
  // The aggregate keyframe diamond for a shared property — undefined (no glyph) when
  // it isn't keyframe-able for every selected kind (D-051 registry gate).
  const dot = (prop: AnimatableProperty): JSX.Element | undefined =>
    MultiKeyframeDot(elements, prop, currentFrame);

  // Transform field props (icon-based Seg/SingleField; display via TRANSFORM_FIELD_META),
  // live keyframe-aware apply + boundary-on-commit + the aggregate diamond — the SAME
  // primitive (and now the same keyframe behaviour) as single selection.
  const tf = (prop: AnimatableProperty) => ({
    ...transformFieldProps(prop, numOf(prop), applyNumLive(prop)),
    mixed: isMixed(prop),
    onCommitBoundary: commitBoundary,
    point: dot(prop),
  });

  const inSection = (section: SharedSection): SharedProperty[] =>
    shared.filter((sp) => sp.descriptor.section === section);

  // Solid fill fans out keyframe-AWARE like the number fields (D-054 — a member with
  // a fill.color track keyframes at the playhead, others write static); a gradient
  // (not keyframe-able) applies the whole Fill to every selected shape as one undo.
  const applyFill = (f: Fill): void => {
    if (f.kind === 'solid') {
      designerStore.applySharedPropertyKeyframed(ids, 'fill.color', f.color);
    } else {
      designerStore.runAsSingleHistoryEntry(() => {
        for (const el of elements) {
          if (el.type === 'shape') {
            designerStore.updateElement(el.id, { fill: f } as Partial<Element>);
            // B-014 — the gradient makes fill.color non-keyframe-able; drop the
            // orphaned colour track (same undo step as the fan-out).
            clearOrphanColourTrack({ ...el, fill: f } as Element, 'fill.color');
          }
        }
      });
    }
  };

  function renderField(sp: SharedProperty): JSX.Element {
    const d = sp.descriptor;
    if (d.kind === 'fill') {
      const fillValue: Fill | undefined =
        sp.mixed || typeof sp.value !== 'string' ? undefined : { kind: 'solid', color: sp.value };
      return (
        <FillField
          key={d.key}
          label={d.label}
          value={fillValue}
          onChange={applyFill}
          trailing={dot('fill.color')}
        />
      );
    }
    if (d.kind === 'color') {
      return (
        <ColorField
          key={d.key}
          label={d.label}
          value={typeof sp.value === 'string' ? sp.value : '#000000'}
          mixed={sp.mixed}
          onCommit={(hex) => designerStore.applySharedPropertyKeyframed(ids, d.prop, hex)}
          trailing={dot(d.prop)}
        />
      );
    }
    return (
      <NumberField
        key={d.key}
        label={d.label}
        value={numOf(d.key)}
        step={d.step}
        min={d.min}
        max={d.max}
        suffix={d.suffix}
        mixed={sp.mixed}
        onCommit={applyNumLive(d.prop)}
        onCommitBoundary={commitBoundary}
        trailing={dot(d.prop)}
      />
    );
  }

  return (
    <aside className={s.panel} aria-label="Inspector" data-testid="multi-select-inspector">
      <h2 className={s.headingFirst}>{elements.length} ELEMENTS SELECTED</h2>
      {shared.length === 0 ? (
        <p className={s.empty}>No shared editable properties for this mix.</p>
      ) : (
        <>
          <CollapseSection title="Transform" pinned>
            <div className={tx.col}>
              {(has('position.x') || has('position.y')) && (
                <div className="cg-input-group">
                  {has('position.x') && <Seg {...tf('position.x')} />}
                  {has('position.y') && <Seg {...tf('position.y')} />}
                </div>
              )}
              {(has('size.w') || has('size.h')) && (
                <div className="cg-input-group">
                  {has('size.w') && <Seg {...tf('size.w')} />}
                  {has('size.h') && <Seg {...tf('size.h')} />}
                </div>
              )}
              {(has('scale.x') || has('scale.y')) && (
                <div className="cg-input-group">
                  {has('scale.x') && <Seg {...tf('scale.x')} />}
                  {has('scale.y') && <Seg {...tf('scale.y')} />}
                </div>
              )}
              {has('rotation') && <SingleField {...tf('rotation')} />}
              {has('opacity') && <SingleField {...tf('opacity')} />}
            </div>
          </CollapseSection>
          {SECTION_ORDER.map((section) => {
            const descs = inSection(section);
            if (descs.length === 0) return null;
            return (
              <CollapseSection key={section} title={section} pinned={section === 'Path Style'}>
                {descs.map(renderField)}
              </CollapseSection>
            );
          })}
        </>
      )}
    </aside>
  );
}
