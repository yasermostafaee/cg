import type { DynamicField, FieldValue, Scene } from '@cg/shared-schema';
import { cx } from '../../cx.js';
import { Callout } from '../../ui/Callout.js';
import * as s from './PreviewFieldForm.css.js';

type Values = Record<string, FieldValue>;

/** Transport the preview drives — the modal posts these to its iframe. */
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
 * D-018 — live data-entry form for the preview. Generated from the composition's
 * dynamic fields; editing a value drives the preview through the same runtime used
 * on air (and that the single-file HTML export ships).
 *
 * Controlled by the {@link PreviewModal}, which owns the value state so the
 * (fixed) transport bar can `play()` with the current values while this form
 * scrolls independently. Important problems — a duplicate data key, or per-field
 * validation errors — are surfaced as prominent callouts, not muted hints.
 */
export function PreviewFieldForm({
  scene,
  values,
  onChange,
}: {
  scene: Scene;
  values: Values;
  onChange: (id: string, value: FieldValue) => void;
}): JSX.Element {
  const fields = scene.fields;
  const duplicateKeys = findDuplicateKeys(fields);
  const invalidCount = fields.filter((f) => validateField(f, values[f.id]) !== null).length;

  return (
    <div>
      <div className={s.header}>
        <span className={s.title}>Data</span>
        {fields.length > 0 && (
          <span className={s.count}>
            {String(fields.length)} field{fields.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {duplicateKeys.length > 0 && (
        <Callout variant="danger" className={s.banner}>
          Duplicate data {duplicateKeys.length === 1 ? 'key' : 'keys'}:{' '}
          {duplicateKeys.map((k) => `"${k}"`).join(', ')}. Two elements share a key, so their preview
          values collide — rename one in the inspector.
        </Callout>
      )}
      {invalidCount > 0 && (
        <Callout variant="danger" className={s.banner}>
          {String(invalidCount)} field{invalidCount === 1 ? '' : 's'} need
          {invalidCount === 1 ? 's' : ''} attention before this looks right on air.
        </Callout>
      )}

      {fields.length === 0 ? (
        <p className={s.hint}>No data fields yet — give a text element a Data key to add one.</p>
      ) : (
        fields.map((f) => (
          <FieldRow
            key={f.id}
            field={f}
            value={values[f.id]}
            onChange={(v) => onChange(f.id, v)}
          />
        ))
      )}
    </div>
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
      {error !== null && (
        <span className={s.error} role="alert">
          <span aria-hidden>⚠</span>
          {error}
        </span>
      )}
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

/** Data keys that appear on more than one field (an authoring mistake). */
export function findDuplicateKeys(fields: readonly DynamicField[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const f of fields) {
    if (seen.has(f.id)) dupes.add(f.id);
    seen.add(f.id);
  }
  return [...dupes];
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
