import { fieldOperatorEditable, type ListItemField } from '@cg/shared-schema';
import { designerStore, useDesignerStore } from '../../state/store.js';
import * as s from './SequencePageDataPanel.css.js';

/** Per-column CG Control authority for a direct or Sequence-owned Repeater. */
export function OperatorColumnLocks({
  compositionId,
  fields,
}: {
  compositionId: string;
  fields: readonly ListItemField[];
}): JSX.Element | null {
  const scene = useDesignerStore().scene;
  const composition = scene?.compositions?.find((candidate) => candidate.id === compositionId);
  const liveFields = fields.map(
    (field) =>
      composition?.fields?.find(
        (candidate): candidate is ListItemField =>
          candidate.id === field.id && candidate.type !== 'list',
      ) ?? field,
  );
  if (fields.length === 0) return null;
  return (
    <div className={s.operatorColumns} aria-label="CG Control editable columns">
      <span className={s.operatorColumnsTitle}>
        Editable in CG Control · locking a column also fixes row count and order
      </span>
      {liveFields.map((field) => (
        <label key={field.id} className={s.operatorChoice} title={field.id}>
          <input
            type="checkbox"
            aria-label={`${field.label || field.id} editable in CG Control`}
            checked={fieldOperatorEditable(field)}
            onChange={(event) =>
              designerStore.setCompositionFieldOperatorEditable(
                compositionId,
                field.id,
                event.target.checked,
              )
            }
          />
          {field.label || field.id}
        </label>
      ))}
    </div>
  );
}
