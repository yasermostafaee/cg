import type { Element } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { ColorPicker } from './ColorPopover.js';
import { sharedEditableProperties, type SharedProperty } from './shared-properties.js';
import * as s from './InspectorPanel.css.js';

/**
 * Multi-selection inspector (D-041). Shown when more than one element is
 * selected; renders ONLY the properties COMMON to the selected kinds (the
 * intersection from `sharedEditableProperties`). A field whose selected
 * elements AGREE shows the value; one that DIFFERS shows a neutral "mixed"
 * placeholder and does not coerce until edited. Editing fans the value out to
 * every selected element as ONE undo step (`applySharedProperty`). No
 * per-keyframe diamonds — group editing sets static values only in v1.
 */
export function MultiSelectSection({ elements }: { elements: readonly Element[] }): JSX.Element {
  const shared = sharedEditableProperties(elements);
  const ids = elements.map((e) => e.id);
  return (
    <aside className={s.panel} aria-label="Inspector" data-testid="multi-select-inspector">
      <h2 className={s.headingFirst}>{elements.length} ELEMENTS SELECTED</h2>
      <p className={s.empty}>Shared properties — edits apply to all selected.</p>
      {shared.length === 0 ? (
        <p className={s.empty}>No shared editable properties for this mix.</p>
      ) : (
        shared.map((sp) => <MultiField key={sp.descriptor.key} sp={sp} ids={ids} />)
      )}
    </aside>
  );
}

function MultiField({ sp, ids }: { sp: SharedProperty; ids: readonly string[] }): JSX.Element {
  const { descriptor, value, mixed } = sp;
  const apply = (v: number | string): void =>
    designerStore.applySharedProperty(ids, descriptor.prop, v);
  const labelText = mixed ? `${descriptor.label} (mixed)` : descriptor.label;
  return (
    <div className={s.row}>
      <span className={s.label}>{labelText}</span>
      {descriptor.kind === 'color' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <ColorPicker
            value={typeof value === 'string' ? value : '#000000'}
            ariaLabel={labelText}
            onChange={(hex) => apply(hex)}
          />
          {mixed && <span className={s.empty}>mixed</span>}
        </div>
      ) : (
        <input
          // Commit on blur/Enter (not per keystroke) so a multi-element edit is
          // one undo step, not one per keystroke; re-key on the agreed value so
          // the field re-initialises when the selection or value changes.
          key={`${descriptor.key}-${mixed ? 'mixed' : String(value)}`}
          className={s.docNum}
          style={{ width: '100%' }}
          type="number"
          step={descriptor.step}
          min={descriptor.min}
          max={descriptor.max}
          placeholder={mixed ? 'mixed' : undefined}
          defaultValue={mixed || typeof value !== 'number' ? '' : String(value)}
          aria-label={labelText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          onBlur={(e) => {
            const raw = e.target.value;
            if (raw === '') return;
            const n = Number(raw);
            if (Number.isFinite(n)) apply(n);
          }}
        />
      )}
    </div>
  );
}
