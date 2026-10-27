import {
  aggregateCompositionFields,
  type CompositionFieldGroup,
  type DynamicField,
  type FieldBinding,
  type Scene,
} from '@cg/shared-schema';
import { Link2, Trash2, Unlink2 } from 'lucide-react';
import { designerStore } from '../../state/store.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import * as s from './FieldsPanel.css.js';
import { TextField } from '../inspector/controls.js';
import { describeBinding, elementNameResolver } from './bind-resolver.js';
import { isFixedFileFieldId } from './fixedFileField.js';

interface Props {
  scene: Scene;
  bindModeFieldId: string | null;
}

/**
 * D-166 — composition-level Variables table. Fields are the operator's
 * runtime payload contract; bindings wire them to elements. It deliberately
 * lives beside the Inspector, not inside a selection-owned inspector branch.
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
  const ownFields = aggregate.fields.filter((field) => !isFixedFileFieldId(field.id));
  const visibleGroups = aggregate.groups.filter(namespaceHasFields);
  const empty = ownFields.length === 0 && visibleGroups.length === 0;
  return (
    <div className={s.block}>
      {empty ? (
        <p className={s.empty}>No variables.</p>
      ) : (
        <div className={s.list}>
          {ownFields.length > 0 && (
            <div className={s.table} role="table" aria-label="Composition variables">
              <TableHeader />
              <div role="rowgroup">
                {ownFields.map((f) => (
                  <FieldRow
                    key={f.id}
                    field={f}
                    bindings={scene.bindings}
                    bindModeFieldId={bindModeFieldId}
                    nameOf={nameOf}
                  />
                ))}
              </div>
            </div>
          )}
          {visibleGroups.map((g) => (
            <NamespaceGroup key={g.instanceId} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A namespace is useful iff it or one of its descendants contains a field. */
export function namespaceHasFields(group: CompositionFieldGroup): boolean {
  return (
    group.aggregate.fields.some((field) => !isFixedFileFieldId(field.id)) ||
    group.aggregate.groups.some(namespaceHasFields)
  );
}

function TableHeader(): JSX.Element {
  return (
    <div className={s.tableHeader} role="row">
      <span role="columnheader">Key</span>
      <span role="columnheader">Title</span>
      <span role="columnheader">Type / binding</span>
      <span role="columnheader" className={s.actionsHeader}>
        Actions
      </span>
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
  const visibleFields = fields.filter((field) => !isFixedFileFieldId(field.id));
  const visibleGroups = groups.filter(namespaceHasFields);
  return (
    <div className={s.nsGroup}>
      <div className={s.nsTitle}>{group.label ?? group.name}</div>
      {visibleFields.length > 0 && (
        <div className={s.table} role="table" aria-label={`${group.label ?? group.name} variables`}>
          <TableHeader />
          <div role="rowgroup">
            {visibleFields.map((f) => (
              <div
                key={f.id}
                className={s.readonlyRow}
                data-testid={`field-row-${f.id}`}
                role="row"
              >
                <span className={s.cardId} role="cell" title={f.id}>
                  {f.id}
                </span>
                <span className={s.readonlyLabel} role="cell">
                  {f.label || f.id}
                </span>
                <span className={s.cardType} role="cell">
                  {f.type}
                </span>
                <span role="cell" aria-label="Read-only nested variable" />
              </div>
            ))}
          </div>
        </div>
      )}
      {visibleGroups.map((g) => (
        <NamespaceGroup key={g.instanceId} group={g} />
      ))}
    </div>
  );
}

function FieldRow({
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
    <div className={s.fieldRow} data-testid={`field-card-${field.id}`} role="row">
      <span className={s.cardId} role="cell" title={field.id}>
        {field.id}
      </span>
      <div className={s.titleCell} role="cell">
        <TextField
          bare
          label="Title"
          ariaLabel={`Title for ${field.id}`}
          value={field.label}
          resetKey={field.id}
          onCommit={(label) =>
            designerStore.updateField(field.id, { label } as Partial<DynamicField>)
          }
        />
      </div>
      <div className={s.fieldDetails} role="cell">
        <span className={s.cardType}>{field.type}</span>
        <BindingList bindings={ownBindings} nameOf={nameOf} />
      </div>
      <div className={s.cardActions} role="cell">
        <Control
          size="sm"
          disabled={!canBind}
          aria-pressed={bindActive}
          aria-label={bindActive ? 'Click a canvas element' : 'Bind from canvas'}
          selected={bindActive}
          title={
            canBind
              ? 'Bind this field to a canvas element'
              : 'Already bound — remove the binding (×) to bind a different target'
          }
          onClick={() => designerStore.setBindMode(bindActive ? null : field.id)}
        >
          <Icon icon={Link2} size={13} />
        </Control>
        <Control
          size="sm"
          aria-label={`Delete ${field.id}`}
          title="Delete this field and all its bindings"
          onClick={() => designerStore.removeField(field.id)}
        >
          <Icon icon={Trash2} size={13} />
        </Control>
      </div>
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
          <span className={s.bindingText}>→ {describeBinding(b, nameOf)}</span>
          <Control
            size="xs"
            title="Unbind (keeps the field)"
            aria-label="Unbind"
            onClick={() => designerStore.removeBindingAt(idx)}
          >
            <Icon icon={Unlink2} size={11} />
          </Control>
        </div>
      ))}
    </div>
  );
}
