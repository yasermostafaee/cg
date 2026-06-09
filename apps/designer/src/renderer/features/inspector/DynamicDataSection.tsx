import { useState } from 'react';
import type { DynamicField, Scene, TextElement } from '@cg/shared-schema';
import { designerStore, type ElementFieldMetaPatch } from '../../state/store.js';
import { CollapseSection } from './CollapseSection.js';
import { NumberField, SelectField, TextField } from './controls.js';
import * as cs from './controls.css.js';
import * as s from './DynamicDataSection.css.js';

/**
 * D-018 — "Dynamic / Data" section, shown only for text elements. A text
 * element becomes a runtime data field when given a non-empty **Data key**;
 * the store's convenience layer (`setElementDataKey` / `setElementFieldMeta`)
 * keeps the scene-level `fields[]`+`bindings[]` in sync. This is distinct from
 * the inspector's existing "Key" row, which edits the element name.
 */
export function DynamicDataSection({
  element,
  scene,
}: {
  element: TextElement;
  scene: Scene;
}): JSX.Element {
  // The convenience binding for this element is the full-text one (no
  // placeholder); its field is what the meta controls edit.
  const conv = scene.bindings.find(
    (b) =>
      b.target.kind === 'text' &&
      b.target.elementId === element.id &&
      b.target.placeholder === undefined,
  );
  const field = conv === undefined ? undefined : scene.fields.find((f) => f.id === conv.fieldId);
  const currentKey = field?.id ?? '';
  const [warn, setWarn] = useState<string | null>(null);

  // A key is a real conflict only when *another* element already owns it via a
  // full-text binding. A field that merely exists but is orphaned (its binding
  // was removed) is re-adopted by the store, so it must not block re-typing.
  function isDuplicate(value: string): boolean {
    const t = value.trim();
    if (t === '' || t === currentKey) return false;
    return scene.bindings.some(
      (b) =>
        b.fieldId === t &&
        b.target.kind === 'text' &&
        b.target.placeholder === undefined &&
        b.target.elementId !== element.id,
    );
  }

  // Re-bindable keys for the autocomplete: existing text/multiline fields that
  // aren't owned by another element (i.e. orphaned by an "unbind"), so the
  // operator can reconnect a field here instead of hunting for it.
  const adoptable = scene.fields
    .filter(
      (f) =>
        (f.type === 'text' || f.type === 'multiline') &&
        f.id !== currentKey &&
        !scene.bindings.some(
          (b) =>
            b.fieldId === f.id &&
            b.target.kind === 'text' &&
            b.target.placeholder === undefined &&
            b.target.elementId !== element.id,
        ),
    )
    .map((f) => f.id);

  return (
    <CollapseSection title="Dynamic / Data" defaultExpanded={field !== undefined}>
      <div className={cs.row}>
        <span className={cs.label}>Data key</span>
        <div className="cg-field">
          <input
            className={cs.inputInner}
            type="text"
            placeholder="(static)"
            defaultValue={currentKey}
            // Key by the SELECTED element id (+ the committed key) so the input
            // re-initialises when the selection moves to another element instead
            // of keeping the previous element's uncommitted draft (B-009).
            key={`dk-${element.id}-${currentKey}`}
            aria-label="Data key"
            list={adoptable.length > 0 ? 'cg-data-key-options' : undefined}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) =>
              setWarn(
                isDuplicate(e.target.value)
                  ? `Key “${e.target.value.trim()}” is already used`
                  : null,
              )
            }
            onBlur={(e) => {
              if (isDuplicate(e.target.value)) {
                e.target.value = currentKey; // reject; keep the warning visible
                return;
              }
              designerStore.setElementDataKey(element.id, e.target.value);
              setWarn(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                (e.target as HTMLInputElement).value = currentKey;
                setWarn(null);
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          {adoptable.length > 0 && (
            <datalist id="cg-data-key-options">
              {adoptable.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          )}
        </div>
      </div>
      {warn !== null && <p className={s.warn}>{warn}</p>}

      {field === undefined ? (
        <p className={s.hint}>Give this text a Data key to drive it from field data at playout.</p>
      ) : (
        <FieldMeta element={element} field={field} />
      )}
    </CollapseSection>
  );
}

/** The editable metadata for the field backing a Data key. */
function FieldMeta({ element, field }: { element: TextElement; field: DynamicField }): JSX.Element {
  const fieldType: 'text' | 'number' = field.type === 'number' ? 'number' : 'text';
  const multiline = field.type === 'multiline';
  const patch = (p: ElementFieldMetaPatch): void =>
    designerStore.setElementFieldMeta(element.id, p);

  return (
    <>
      <TextField
        label="Title"
        value={field.label}
        onCommit={(v) => patch({ title: v })}
        resetKey={element.id}
      />
      <TextField
        label="Description"
        value={field.description ?? ''}
        onCommit={(v) => patch({ description: v })}
        resetKey={element.id}
      />
      <CheckRow
        label="Required"
        checked={field.required}
        onChange={(v) => patch({ required: v })}
      />
      <SelectField
        label="Field type"
        value={fieldType}
        options={['text', 'number'] as const}
        onCommit={(v) => patch({ fieldType: v })}
      />
      {fieldType === 'text' && (
        <>
          <CheckRow
            label="Multiline"
            checked={multiline}
            onChange={(v) => patch({ multiline: v })}
          />
          <NumberField
            label="Min length"
            value={lenOf(field, 'min')}
            min={0}
            step={1}
            onCommit={(n) => patch({ minLength: Math.max(0, Math.round(n)) })}
          />
          {!multiline && (
            <NumberField
              label="Max length"
              value={lenOf(field, 'max')}
              min={0}
              step={1}
              onCommit={(n) => patch({ maxLength: Math.max(0, Math.round(n)) })}
            />
          )}
          <TextField
            label="Pattern"
            value={patternOf(field)}
            onCommit={(v) => patch({ pattern: v })}
            resetKey={element.id}
          />
        </>
      )}
      {fieldType === 'number' ? (
        <NumberField
          label="Value"
          value={field.type === 'number' ? field.default : 0}
          step={1}
          onCommit={(n) => patch({ default: n })}
        />
      ) : (
        <TextField
          label="Value"
          value={defaultStr(field)}
          onCommit={(v) => patch({ default: v })}
          resetKey={element.id}
        />
      )}
    </>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element {
  return (
    <div className={cs.row}>
      <span className={cs.label}>{label}</span>
      <input
        type="checkbox"
        className={s.checkbox}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
    </div>
  );
}

function lenOf(f: DynamicField, which: 'min' | 'max'): number {
  if (which === 'min') {
    return (f.type === 'text' || f.type === 'multiline') && f.minLength !== undefined
      ? f.minLength
      : 0;
  }
  return f.type === 'text' && f.maxLength !== undefined ? f.maxLength : 0;
}

function patternOf(f: DynamicField): string {
  return (f.type === 'text' || f.type === 'multiline') && f.pattern !== undefined ? f.pattern : '';
}

function defaultStr(f: DynamicField): string {
  if (f.type === 'image') return '';
  return typeof f.default === 'string' ? f.default : String(f.default);
}
