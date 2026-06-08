import { useMemo, useState } from 'react';
import type { DynamicField, FieldValue, Scene } from '@cg/shared-schema';
import { cx } from '../../cx.js';
import { CollapseSection } from '../inspector/CollapseSection.js';
import * as s from './PreviewFieldForm.css.js';

type Values = Record<string, FieldValue>;

/** Transport the form drives — the preview modal posts these to its iframe. */
export interface PreviewDispatch {
  update(fields: Values): void;
  play(fields: Values): void;
  stop(): void;
  next(): void;
  reset(): void;
  pause(): void;
  resume(): void;
}

/**
 * D-018 — live data-entry form for the preview. Generated from the
 * composition's dynamic fields; editing a value drives the preview through the
 * same runtime used on air (and that the single-file HTML export ships), via the
 * `dispatch` its host (the Preview modal) wires to a dedicated preview iframe.
 * Play / Stop / Next / Reset map to the CasparCG transport, so the operator sees
 * the simulated CasparCG output for the data they type.
 */
export function PreviewFieldForm({
  scene,
  dispatch,
}: {
  scene: Scene;
  dispatch: PreviewDispatch;
}): JSX.Element {
  const fields = scene.fields;
  // Re-seed whenever the field *set* changes (add / remove / rename / retype) —
  // but not on every unrelated scene edit, so the operator's typed test values
  // survive. The "adjust state during render when a key changes" pattern keeps
  // the seed in sync without an effect.
  const fieldsKey = useMemo(() => fields.map((f) => `${f.id}:${f.type}`).join('|'), [fields]);
  const [values, setValues] = useState<Values>(() => seedDefaults(fields));
  const [seededKey, setSeededKey] = useState(fieldsKey);
  if (seededKey !== fieldsKey) {
    setSeededKey(fieldsKey);
    setValues(seedDefaults(fields));
  }

  function setValue(id: string, v: FieldValue): void {
    setValues((prev) => {
      const next = { ...prev, [id]: v };
      dispatch.update(next);
      return next;
    });
  }

  function reset(): void {
    setValues(seedDefaults(fields));
    dispatch.reset();
  }

  return (
    <CollapseSection title="Preview" defaultExpanded>
      <div className={s.controls}>
        <button
          type="button"
          className={cx(s.btn, s.playBtn)}
          onClick={() => dispatch.play(values)}
        >
          ▶ Play
        </button>
        <button type="button" className={s.btn} onClick={() => dispatch.stop()}>
          ■ Stop
        </button>
        <button type="button" className={s.btn} onClick={() => dispatch.pause()}>
          ⏸ Pause
        </button>
        <button type="button" className={s.btn} onClick={() => dispatch.resume()}>
          ⏵ Resume
        </button>
        <button type="button" className={s.btn} onClick={() => dispatch.next()}>
          ⤼ Next
        </button>
        <button type="button" className={s.btn} onClick={reset}>
          ↺ Reset
        </button>
      </div>
      {fields.length === 0 ? (
        <p className={s.hint}>No data fields yet — give a text element a Data key to add one.</p>
      ) : (
        fields.map((f) => (
          <FieldRow key={f.id} field={f} value={values[f.id]} onChange={(v) => setValue(f.id, v)} />
        ))
      )}
    </CollapseSection>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: DynamicField;
  value: FieldValue | undefined;
  onChange: (v: FieldValue) => void;
}): JSX.Element {
  const error = validateField(field, value);
  return (
    <div className={s.row}>
      <label className={s.label} title={field.description}>
        {field.label || field.id}
        {field.required && <span className={s.required}> *</span>}
      </label>
      {renderInput(field, value, onChange, error !== null)}
      {error !== null && <span className={s.error}>{error}</span>}
    </div>
  );
}

function renderInput(
  field: DynamicField,
  value: FieldValue | undefined,
  onChange: (v: FieldValue) => void,
  invalid: boolean,
): JSX.Element {
  const cls = cx(s.input, invalid && s.inputInvalid);
  switch (field.type) {
    case 'multiline':
      return (
        <textarea
          className={cls}
          rows={2}
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'number':
      return (
        <input
          className={cls}
          type="number"
          value={typeof value === 'number' ? value : field.default}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      );
    case 'color':
      return (
        <input
          className={cls}
          type="color"
          value={asString(value) || field.default}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
      );
    case 'boolean':
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={field.label}
        />
      );
    case 'select':
      return (
        <select className={cls} value={asString(value)} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'image':
      return (
        <input
          className={cls}
          type="text"
          placeholder="asset id"
          value={imageId(value)}
          onChange={(e) => onChange({ assetId: e.target.value })}
        />
      );
    case 'text':
    default:
      return (
        <input
          className={cls}
          type="text"
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

/** Seed each field's preview value from its declared default. */
export function seedDefaults(fields: readonly DynamicField[]): Values {
  const out: Values = {};
  for (const f of fields) {
    out[f.id] =
      f.type === 'image' ? { assetId: f.defaultAssetId ?? '' } : (f.default as FieldValue);
  }
  return out;
}

/** Validation message for a value against a field's constraints, or null if valid. */
export function validateField(field: DynamicField, value: FieldValue | undefined): string | null {
  if (field.type !== 'text' && field.type !== 'multiline') return null;
  const str = asString(value);
  if (field.required && str === '') return 'Required';
  const len = [...str].length;
  if (field.minLength !== undefined && len < field.minLength) {
    return `Min ${String(field.minLength)} characters`;
  }
  if (field.type === 'text' && field.maxLength !== undefined && len > field.maxLength) {
    return `Max ${String(field.maxLength)} characters`;
  }
  if (field.pattern !== undefined && str !== '') {
    try {
      if (!new RegExp(field.pattern).test(str)) return `Doesn't match ${field.pattern}`;
    } catch {
      /* an invalid pattern is a field-config issue, not a value error */
    }
  }
  return null;
}

function asString(v: FieldValue | undefined): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function imageId(v: FieldValue | undefined): string {
  return typeof v === 'object' && v !== null && 'assetId' in v ? v.assetId : '';
}
