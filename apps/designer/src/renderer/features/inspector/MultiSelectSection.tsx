import type { AnimatableProperty, Element, Fill } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { CollapseSection } from './CollapseSection.js';
import { FillField } from './FillPopover.js';
import { Seg, SingleField, transformFieldProps } from './transform-fields.js';
import { sharedEditableProperties } from './shared-properties.js';
import * as s from './InspectorPanel.css.js';
import * as tx from './TransformSection.css.js';

/**
 * Multi-selection inspector (D-041 + D-049). Shown when more than one element is
 * selected; renders ONLY the properties COMMON to the selected kinds (the
 * intersection from `sharedEditableProperties`) using the SAME primitives and
 * section grouping as the single-element inspector — the horizontal-drag number
 * field (`Seg`/`SingleField` + `TRANSFORM_FIELD_META` units) under a Transform
 * section, and `FillField` under Path Style — instead of a bespoke flat list. A
 * field whose selected elements DIFFER shows the neutral "mixed" state through
 * the same primitive (no coercion). Editing fans out to every selected element
 * as ONE undo step (`applySharedProperty`, keyframe-free). No per-keyframe
 * diamonds — group editing sets static values only.
 */
export function MultiSelectSection({ elements }: { elements: readonly Element[] }): JSX.Element {
  const shared = sharedEditableProperties(elements);
  const ids = elements.map((e) => e.id);
  const byKey = new Map(shared.map((sp) => [sp.descriptor.key, sp]));

  const has = (key: string): boolean => byKey.has(key);
  const isMixed = (key: string): boolean => byKey.get(key)?.mixed === true;
  const storedOf = (key: string): number => {
    const v = byKey.get(key)?.value;
    return typeof v === 'number' ? v : 0;
  };
  // Field props for a shared transform property — same display metadata (icon,
  // unit, conversion) as the single inspector; commit fans out to all selected.
  const tfp = (prop: AnimatableProperty) =>
    transformFieldProps(prop, storedOf(prop), (v) =>
      designerStore.applySharedProperty(ids, prop, v),
    );

  const fillSp = byKey.get('fill.color');
  const fillValue: Fill | undefined =
    fillSp === undefined || fillSp.mixed || typeof fillSp.value !== 'string'
      ? undefined
      : { kind: 'solid', color: fillSp.value };
  // Solid edits fan out via the same keyframe-free path as the number fields; a
  // gradient (or other non-solid) edit applies the whole Fill to every selected
  // shape as one undo entry (still keyframe-free).
  const applyFill = (f: Fill): void => {
    if (f.kind === 'solid') {
      designerStore.applySharedProperty(ids, 'fill.color', f.color);
    } else {
      designerStore.runAsSingleHistoryEntry(() => {
        for (const el of elements) {
          if (el.type === 'shape')
            designerStore.updateElement(el.id, { fill: f } as Partial<Element>);
        }
      });
    }
  };

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
                  {has('position.x') && (
                    <Seg {...tfp('position.x')} mixed={isMixed('position.x')} />
                  )}
                  {has('position.y') && (
                    <Seg {...tfp('position.y')} mixed={isMixed('position.y')} />
                  )}
                </div>
              )}
              {(has('size.w') || has('size.h')) && (
                <div className="cg-input-group">
                  {has('size.w') && <Seg {...tfp('size.w')} mixed={isMixed('size.w')} />}
                  {has('size.h') && <Seg {...tfp('size.h')} mixed={isMixed('size.h')} />}
                </div>
              )}
              {has('rotation') && <SingleField {...tfp('rotation')} mixed={isMixed('rotation')} />}
              {has('opacity') && <SingleField {...tfp('opacity')} mixed={isMixed('opacity')} />}
            </div>
          </CollapseSection>
          {has('fill.color') && (
            <CollapseSection title="Path Style" pinned>
              <FillField label="fill" value={fillValue} onChange={applyFill} />
              {isMixed('fill.color') && <p className={s.empty}>mixed</p>}
            </CollapseSection>
          )}
        </>
      )}
    </aside>
  );
}
