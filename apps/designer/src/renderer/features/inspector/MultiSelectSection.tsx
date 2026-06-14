import type { AnimatableProperty, Element, Fill } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { CollapseSection } from './CollapseSection.js';
import { ColorField, NumberField } from './controls.js';
import { FillField } from './FillPopover.js';
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
 * D-053 commit model: each number field is the SAME primitive as single
 * selection — drag-scrub + live (onChange) updates. Live values fan out through
 * `applySharedPropertyLive` (keyframe-free, NO per-tick history boundary, so the
 * burst time-coalesces); `onCommitBoundary` calls `markHistoryBoundary` once at
 * the gesture endpoint (drag release / Enter / blur), so the whole edit is ONE
 * undo entry across the selection. Discrete commits (colour pick / gradient) keep
 * the boundary-wrapped `applySharedProperty`. No per-keyframe diamonds (D-054).
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
  // D-053 — number fields apply LIVE during the gesture (drag-scrub / typing)
  // with no per-tick boundary, then set ONE history boundary at the commit
  // endpoint so the whole edit is one undo entry across the selection.
  const applyNumLive =
    (prop: AnimatableProperty) =>
    (v: number): void =>
      designerStore.applySharedPropertyLive(ids, prop, v);
  const commitBoundary = (): void => designerStore.markHistoryBoundary();

  // Transform field props (icon-based Seg/SingleField; display via TRANSFORM_FIELD_META),
  // live-apply + boundary-on-commit + mixed-aware — the SAME primitive as single.
  const tf = (prop: AnimatableProperty) => ({
    ...transformFieldProps(prop, numOf(prop), applyNumLive(prop)),
    mixed: isMixed(prop),
    onCommitBoundary: commitBoundary,
  });

  const inSection = (section: SharedSection): SharedProperty[] =>
    shared.filter((sp) => sp.descriptor.section === section);

  // Solid fill fans out keyframe-free like the number fields; a gradient applies
  // the whole Fill to every selected shape as one undo entry.
  const applyFill = (f: Fill): void => {
    if (f.kind === 'solid') {
      designerStore.applySharedProperty(ids, 'fill.color', f.color);
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
      return <FillField key={d.key} label={d.label} value={fillValue} onChange={applyFill} />;
    }
    if (d.kind === 'color') {
      return (
        <ColorField
          key={d.key}
          label={d.label}
          value={typeof sp.value === 'string' ? sp.value : '#000000'}
          mixed={sp.mixed}
          onCommit={(hex) => designerStore.applySharedProperty(ids, d.prop, hex)}
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
