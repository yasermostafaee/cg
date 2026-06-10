import type {
  AggregatedFields,
  DynamicField,
  FieldValue,
  ListItem,
  NestedFieldValues,
} from '@cg/shared-schema';
import { cx } from '../../cx.js';
import { Callout } from '../../ui/Callout.js';
import { Select } from '../../ui/Select.js';
import { ListItemsEditor } from './ListItemsEditor.js';
import * as s from './PreviewFieldForm.css.js';

type Values = Record<string, FieldValue>;

/** Transport the preview drives — the modal posts these (nested) to its iframe. */
export interface PreviewDispatch {
  update(fields: NestedFieldValues): void;
  play(fields: NestedFieldValues): void;
  stop(): void;
  next(): void;
  reset(): void;
  pause(): void;
  resume(): void;
}

/**
 * D-018 / D-025 — live data-entry form for the preview. Generated from the
 * composition's AGGREGATED fields: its own flat fields plus, for each nested child
 * instance, a namespaced sub-group (recursive). Editing drives the preview through
 * the same runtime used on air. Values are a NESTED object keyed by field id within
 * a composition and by instance name across nesting (`{ home: { teamName } }`), so
 * the same child instanced twice updates independently.
 *
 * Controlled by the {@link PreviewModal}, which owns the nested value state; this
 * form reports edits by `path` (e.g. `['home','teamName']`).
 */
export function PreviewFieldForm({
  aggregate,
  values,
  onChange,
}: {
  aggregate: AggregatedFields;
  values: NestedFieldValues;
  onChange: (path: string[], value: FieldValue) => void;
}): JSX.Element {
  return (
    <AggregateSection
      aggregate={aggregate}
      values={values}
      path={[]}
      onChange={onChange}
      title="Data"
      depth={0}
    />
  );
}

/** One composition's fields (flat) + its nested-instance namespaces (recursive). */
function AggregateSection({
  aggregate,
  values,
  path,
  onChange,
  title,
  depth,
}: {
  aggregate: AggregatedFields;
  values: NestedFieldValues;
  path: string[];
  onChange: (path: string[], value: FieldValue) => void;
  title: string;
  depth: number;
}): JSX.Element {
  const duplicateKeys = findDuplicateKeys(aggregate.fields);
  const invalidCount = aggregate.fields.filter(
    (f) => validateField(f, scalarAt(values, f.id)) !== null,
  ).length;
  const empty = aggregate.fields.length === 0 && aggregate.groups.length === 0;

  return (
    <div className={depth > 0 ? s.group : undefined}>
      <div className={s.header}>
        <span className={depth > 0 ? s.groupTitle : s.title}>{title}</span>
        {aggregate.fields.length > 0 && (
          <span className={s.count}>
            {String(aggregate.fields.length)} field{aggregate.fields.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {duplicateKeys.length > 0 && (
        <Callout variant="danger" className={s.banner}>
          Duplicate data {duplicateKeys.length === 1 ? 'key' : 'keys'}:{' '}
          {duplicateKeys.map((k) => `"${k}"`).join(', ')}. Two elements share a key, so their
          preview values collide — rename one in the inspector.
        </Callout>
      )}
      {invalidCount > 0 && (
        <Callout variant="danger" className={s.banner}>
          {String(invalidCount)} field{invalidCount === 1 ? '' : 's'} need
          {invalidCount === 1 ? 's' : ''} attention before this looks right on air.
        </Callout>
      )}

      {empty && depth === 0 && (
        <p className={s.hint}>No data fields yet — give a text element a Data key to add one.</p>
      )}

      {aggregate.fields.map((f) => (
        <FieldRow
          key={f.id}
          field={f}
          value={scalarAt(values, f.id)}
          onChange={(v) => onChange([...path, f.id], v)}
        />
      ))}

      {aggregate.groups.map((g) => (
        <AggregateSection
          key={g.instanceId}
          aggregate={g.aggregate}
          values={namespaceAt(values, g.name)}
          path={[...path, g.name]}
          onChange={onChange}
          title={g.name}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

/** A field's scalar value (not a nested namespace object). */
function scalarAt(values: NestedFieldValues, id: string): FieldValue | undefined {
  const v = values[id];
  return isNamespace(v) ? undefined : (v as FieldValue | undefined);
}

/** A nested-instance namespace sub-object (empty when missing). */
function namespaceAt(values: NestedFieldValues, name: string): NestedFieldValues {
  const v = values[name];
  return isNamespace(v) ? v : {};
}

function isNamespace(v: unknown): v is NestedFieldValues {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !('assetId' in v);
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
  // A stable accessible name per field (label, else the data key) so the preview
  // form is reachable by `getByLabel` in E2E — and a genuine a11y improvement.
  const label = field.label || field.id;
  switch (field.type) {
    case 'multiline':
      return (
        <textarea
          className={cls}
          rows={2}
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
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
          aria-label={label}
        />
      );
    case 'color':
      return (
        <input
          className={cls}
          type="color"
          value={asString(value) || field.default}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label={label}
        />
      );
    case 'boolean':
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
        />
      );
    case 'select':
      return (
        <Select
          className={cls}
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    case 'image':
      return (
        <input
          className={cls}
          type="text"
          placeholder="asset id"
          value={imageId(value)}
          onChange={(e) => onChange({ assetId: e.target.value })}
          aria-label={label}
        />
      );
    case 'list':
      // D-028 — the same items editor the ticker inspector uses; every edit
      // live-updates the crawl (the runtime reconciles by stable item id).
      return (
        <ListItemsEditor
          items={listItems(value, field.default)}
          label={label}
          onChange={(items) => onChange(items)}
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
          aria-label={label}
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

/** A list field's current items (falling back to its declared default). */
function listItems(value: FieldValue | undefined, fallback: readonly ListItem[]): ListItem[] {
  return Array.isArray(value) ? value : [...fallback];
}

/** Validation message for a value against a field's constraints, or null if valid. */
export function validateField(field: DynamicField, value: FieldValue | undefined): string | null {
  if (field.type === 'list') {
    return field.required && listItems(value, field.default).length === 0 ? 'Required' : null;
  }
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
