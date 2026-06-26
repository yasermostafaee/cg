import {
  aggregateCompositionFields,
  type CompositionFieldGroup,
  type DynamicField,
  type FieldBinding,
  type Scene,
} from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { cx } from '../../cx.js';
import { Button } from '../../ui/Button.js';
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
/**
 * Whether "Bind from canvas" is allowed for a field: only while the field has NO
 * binding yet (one binding per field). Removing the existing binding re-enables
 * it. Exported for regression coverage. Relax this if a field should be bindable
 * to several different targets at once.
 */
export function canBindFromCanvas(fieldId: string, bindings: readonly FieldBinding[]): boolean {
  return !bindings.some((b) => b.fieldId === fieldId);
}

export function FieldsPanel({ scene, bindModeFieldId }: Props): JSX.Element {
  const nameOf = elementNameResolver(scene);
  // D-025 — this composition's OWN fields (editable here) plus its nested child
  // instances' fields, shown grouped/namespaced (edited by opening the child).
  const aggregate = aggregateCompositionFields(scene, scene);
  const empty = aggregate.fields.length === 0 && aggregate.groups.length === 0;
  return (
    <div className={s.block}>
      {empty ? (
        <p className={s.empty}>No fields.</p>
      ) : (
        <div className={s.list}>
          {aggregate.fields.map((f) => (
            <FieldCard
              key={f.id}
              field={f}
              bindings={scene.bindings}
              bindModeFieldId={bindModeFieldId}
              nameOf={nameOf}
            />
          ))}
          {aggregate.groups.map((g) => (
            <NamespaceGroup key={g.instanceId} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * D-025 — a nested child instance's fields, shown under its namespace (read-only
 * here; they're authored by opening the child composition). Recurses for deeper
 * nesting.
 */
function NamespaceGroup({ group }: { group: CompositionFieldGroup }): JSX.Element {
  const { fields, groups } = group.aggregate;
  return (
    <div className={s.nsGroup}>
      <div className={s.nsTitle}>{group.label ?? group.name}</div>
      {fields.map((f) => (
        <div key={f.id} className={s.nsItem}>
          {f.label || f.id} <span className={s.nsType}>{f.type}</span>
        </div>
      ))}
      {groups.map((g) => (
        <NamespaceGroup key={g.instanceId} group={g} />
      ))}
      {fields.length === 0 && groups.length === 0 && <div className={s.nsItem}>(no fields)</div>}
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
  // One binding per field: "Bind from canvas" is enabled only while the field has
  // no binding yet. To bind a different target the operator removes the existing
  // binding (×) first, which re-enables it. (If we later want a field bound to
  // several elements, relax this — see canBindFromCanvas.)
  const canBind = canBindFromCanvas(field.id, bindings);
  return (
    <div className={s.fieldCard} data-testid={`field-card-${field.id}`}>
      <div className={s.cardHeader}>
        <span className={s.cardId}>{field.id}</span>
        <span className={s.cardType}>{field.type}</span>
      </div>
      <TextField
        label="label"
        value={field.label}
        resetKey={field.id}
        onCommit={(label) =>
          designerStore.updateField(field.id, { label } as Partial<DynamicField>)
        }
      />
      <div className={s.cardActions}>
        <Button
          variant="bare"
          className={cx(s.smallButton, bindActive && s.smallButtonActive)}
          disabled={!canBind}
          aria-pressed={bindActive}
          title={
            canBind
              ? 'Bind this field to a canvas element'
              : 'Already bound — remove the binding (×) to bind a different target'
          }
          onClick={() => designerStore.setBindMode(bindActive ? null : field.id)}
        >
          {bindActive ? 'Click a canvas element…' : 'Bind from canvas'}
        </Button>
        <Button
          variant="bare"
          className={s.smallButton}
          title="Delete this field and all its bindings"
          onClick={() => designerStore.removeField(field.id)}
        >
          delete field
        </Button>
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
          <Button
            variant="bare"
            className={s.smallButton}
            title="Unbind (keeps the field)"
            aria-label="Unbind"
            onClick={() => designerStore.removeBindingAt(idx)}
          >
            ×
          </Button>
        </div>
      ))}
    </div>
  );
}
