import type { DynamicField, FieldBinding, Scene } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { cx } from '../../cx.js';
import * as s from './FieldsPanel.css.js';
import { TextField } from '../inspector/controls.js';
import { describeBinding, elementNameResolver } from './bind-resolver.js';

interface Props {
  scene: Scene;
  bindModeFieldId: string | null;
}

/**
 * Scene-level fields editor. Lives in the Inspector's SceneInspector
 * region (shown when no element is selected). Fields are the operator's
 * runtime payload contract; bindings wire them to elements.
 *
 * The "Bind from canvas" workflow:
 *   1. operator clicks Bind on a field → store.bindModeFieldId = fieldId
 *   2. canvas overlay (CanvasOverlay) picks up the next pointerdown
 *      and calls bind-resolver to produce a FieldBinding
 *   3. store.addBinding + store.setBindMode(null)
 *
 * Escape clears bind mode globally (handled in CanvasArea).
 */
export function FieldsPanel({ scene, bindModeFieldId }: Props): JSX.Element {
  const nameOf = elementNameResolver(scene);
  return (
    <div className={s.block}>
      {scene.fields.length === 0 ? (
        <p className={s.empty}>No fields.</p>
      ) : (
        <div className={s.list}>
          {scene.fields.map((f) => (
            <FieldCard
              key={f.id}
              field={f}
              bindings={scene.bindings}
              bindModeFieldId={bindModeFieldId}
              nameOf={nameOf}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldCard({
  field,
  bindings,
  bindModeFieldId,
  nameOf,
}: {
  field: DynamicField;
  bindings: readonly FieldBinding[];
  bindModeFieldId: string | null;
  nameOf: (id: string) => string;
}): JSX.Element {
  const ownBindings = bindings
    .map((b, idx) => ({ b, idx }))
    .filter(({ b }) => b.fieldId === field.id);
  const bindActive = bindModeFieldId === field.id;
  return (
    <div className={s.fieldCard}>
      <div className={s.cardHeader}>
        <span className={s.cardId}>{field.id}</span>
        <span className={s.cardType}>{field.type}</span>
      </div>
      <TextField
        label="label"
        value={field.label}
        onCommit={(label) =>
          designerStore.updateField(field.id, { label } as Partial<DynamicField>)
        }
      />
      <div className={s.cardActions}>
        <button
          className={cx(s.smallButton, bindActive && s.smallButtonActive)}
          onClick={() => designerStore.setBindMode(bindActive ? null : field.id)}
        >
          {bindActive ? 'Click a canvas element…' : 'Bind from canvas'}
        </button>
        <button
          className={s.smallButton}
          title="Delete this field and all its bindings"
          onClick={() => designerStore.removeField(field.id)}
        >
          delete field
        </button>
      </div>
      <BindingList bindings={ownBindings} nameOf={nameOf} />
    </div>
  );
}

function BindingList({
  bindings,
  nameOf,
}: {
  bindings: readonly { b: FieldBinding; idx: number }[];
  nameOf: (id: string) => string;
}): JSX.Element {
  if (bindings.length === 0) {
    return <p className={s.bindEmpty}>no bindings yet</p>;
  }
  return (
    <div className={s.bindList}>
      {bindings.map(({ b, idx }) => (
        <div key={idx} className={s.bindRow}>
          <span>→ {describeBinding(b, nameOf)}</span>
          <button
            className={s.smallButton}
            title="Unbind (keeps the field)"
            aria-label="Unbind"
            onClick={() => designerStore.removeBindingAt(idx)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
