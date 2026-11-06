import { useEffect, useRef, useState } from 'react';
import { writeDigitsInto } from '@cg/gesture';
import {
  fieldDigitsOf,
  fieldTakesFileSource,
  fileSourcePolicyOf,
  numberFieldAllowedValues,
  numberFieldValueLabel,
  numberFieldValueError,
  type AggregatedFields,
  type DynamicField,
  type FieldDigits,
  type FieldValue,
  type GroupLabelParts,
  type ListItem,
  type NestedFieldValues,
} from '@cg/shared-schema';
import { TriangleAlert } from 'lucide-react';
import { valueMatchesPattern, writeFieldDigits, type DigitSet } from '@cg/text-shaping';
import { cx } from '../../cx.js';
import { keyboardLanguage } from '../../keyboardLanguage.js';
import { Button } from '../../ui/Button.js';
import { Callout } from '../../ui/Callout.js';
import { Icon } from '../../ui/Icon.js';
import { DateTimeInput } from '../../ui/DateTimeInput.js';
import { Select } from '../../ui/Select.js';
import { useTypedNumber } from '../../ui/typedNumber.js';
import { ListItemsEditor } from './ListItemsEditor.js';
import { ListItemsDialog } from './ListItemsDialog.js';
import type { ListItemColumn } from './repeater-columns.js';
import * as s from './PreviewFieldForm.css.js';

type Values = Record<string, FieldValue>;

/** Transport the preview drives — the modal posts these (nested) to its iframe. */
export interface PreviewDispatch {
  update(fields: NestedFieldValues): void;
  play(fields: NestedFieldValues): void;
  stop(): void;
  out(): void;
  next(): void;
  /** D-163 — back one page (the runtime's previous()). */
  previous(): void;
  reset(fields?: NestedFieldValues): void;
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
const EMPTY_PENDING: ReadonlySet<string> = new Set<string>();

/** D-196 — an empty composition/Look namespace is not a Preview variable. */
export function aggregateHasEditableFields(aggregate: AggregatedFields): boolean {
  return (
    aggregate.fields.length > 0 ||
    aggregate.groups.some((group) => aggregateHasEditableFields(group.aggregate))
  );
}

export function PreviewFieldForm({
  aggregate,
  values,
  onChange,
  pendingPaths,
  onUpdateAll,
  anyPending,
  dwellFieldIds,
  columnsByFieldId,
  title = 'Variables',
}: {
  aggregate: AggregatedFields;
  values: NestedFieldValues;
  onChange: (path: string[], value: FieldValue) => void;
  /** D-106 — dotted leaf paths edited but not yet applied (show a pending indicator). */
  pendingPaths?: ReadonlySet<string>;
  /** D-106 — apply ALL pending field values at once. */
  onUpdateAll?: () => void;
  /** D-106 — whether any field is pending (gates the "Update all" control). */
  anyPending?: boolean;
  /** D-029 — `list` fields bound `sequence-items` get the per-item dwell column. */
  dwellFieldIds?: ReadonlySet<string>;
  /** D-030 — `list` fields bound `repeater-items` get child-field columns. */
  columnsByFieldId?: ReadonlyMap<string, readonly ListItemColumn[]>;
  /** Surface-specific heading; Preview keeps the legacy default. */
  title?: string;
}): JSX.Element {
  return (
    <AggregateSection
      aggregate={aggregate}
      values={values}
      path={[]}
      onChange={onChange}
      pendingPaths={pendingPaths ?? EMPTY_PENDING}
      onUpdateAll={onUpdateAll}
      anyPending={anyPending ?? false}
      title={title}
      depth={0}
      dwellFieldIds={dwellFieldIds}
      columnsByFieldId={columnsByFieldId}
      fileManagedSource={undefined}
    />
  );
}

/** One composition's fields (flat) + its nested-instance namespaces (recursive). */
function AggregateSection({
  aggregate,
  values,
  path,
  onChange,
  pendingPaths,
  onUpdateAll,
  anyPending,
  title,
  titleParts,
  depth,
  dwellFieldIds,
  columnsByFieldId,
  fileManagedSource,
}: {
  aggregate: AggregatedFields;
  values: NestedFieldValues;
  path: string[];
  onChange: (path: string[], value: FieldValue) => void;
  pendingPaths: ReadonlySet<string>;
  onUpdateAll?: (() => void) | undefined;
  anyPending?: boolean | undefined;
  title: string;
  /** `R-037` / `R-040` — a sequence item's heading as parts, each name in its own `<bdi>`. */
  titleParts?: GroupLabelParts | undefined;
  depth: number;
  dwellFieldIds?: ReadonlySet<string> | undefined;
  columnsByFieldId?: ReadonlyMap<string, readonly ListItemColumn[]> | undefined;
  /** Outer Sequence workbook that owns every Repeater row in this namespace. */
  fileManagedSource?: string | undefined;
}): JSX.Element {
  const duplicateKeys = findDuplicateKeys(aggregate.fields);
  const invalidCount = aggregate.fields.filter(
    (f) => validateField(f, scalarAt(values, f.id)) !== null,
  ).length;
  const visibleGroups = aggregate.groups.filter((group) =>
    aggregateHasEditableFields(group.aggregate),
  );
  const empty = aggregate.fields.length === 0 && visibleGroups.length === 0;

  return (
    <div className={depth > 0 ? s.group : undefined}>
      <div className={s.header}>
        <span className={depth > 0 ? s.groupTitle : s.title}>
          {titleParts === undefined ? (
            title
          ) : (
            // `R-037` / `R-040` — the composition name (often Persian) and the stub each in their
            // own isolate; `— item N` is chrome. Joined into one text node the bidi algorithm
            // would order the pieces, not this line (golden rule 11).
            <>
              <bdi>{titleParts.name}</bdi>
              {` — item ${String(titleParts.item)}`}
              {titleParts.stub !== undefined && (
                <>
                  {' · '}
                  <bdi>{titleParts.stub}</bdi>
                </>
              )}
            </>
          )}
        </span>
        {depth === 0 && onUpdateAll !== undefined && (
          <Button
            size="sm"
            className={cx(anyPending === true && s.updateAllPending)}
            disabled={anyPending !== true}
            onClick={onUpdateAll}
            title={
              anyPending === true
                ? 'Apply all pending field changes to the stage'
                : 'No pending changes'
            }
          >
            Update all
          </Button>
        )}
      </div>

      {depth === 0 && !empty && (
        <div className={s.columns} aria-hidden="true">
          <span>Variable</span>
          <span>Value</span>
        </div>
      )}

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
          pending={pendingPaths.has([...path, f.id].join('.'))}
          showDwell={dwellFieldIds?.has(f.id) ?? false}
          columns={columnsByFieldId?.get(f.id)}
          readOnly={
            fileManagedSource !== undefined ||
            (fieldTakesFileSource(f) && fileSourcePolicyOf(f)?.inputMode === 'file-only')
          }
          fileManagedSource={fileManagedSource}
        />
      ))}

      {visibleGroups.map((g) => (
        <AggregateSection
          key={g.instanceId}
          aggregate={g.aggregate}
          values={namespaceAt(values, g.name)}
          path={[...path, g.name]}
          onChange={onChange}
          pendingPaths={pendingPaths}
          title={g.label ?? g.name}
          titleParts={g.labelParts}
          depth={depth + 1}
          dwellFieldIds={dwellFieldIds}
          columnsByFieldId={columnsByFieldId}
          fileManagedSource={g.sequence?.pageDataFile ?? fileManagedSource}
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
  pending,
  showDwell,
  columns,
  readOnly = false,
  fileManagedSource,
}: {
  field: DynamicField;
  value: FieldValue | undefined;
  onChange: (v: FieldValue) => void;
  pending?: boolean | undefined;
  showDwell?: boolean | undefined;
  columns?: readonly ListItemColumn[] | undefined;
  readOnly?: boolean | undefined;
  fileManagedSource?: string | undefined;
}): JSX.Element {
  const error = validateField(field, value);
  return (
    <div className={cx(s.row, pending === true && s.rowPending)}>
      <label className={s.label} title={field.description}>
        <span className={s.keyLine}>
          <code className={s.key}>{field.id}</code>
          {field.required && <span className={s.required}>*</span>}
        </span>
        {field.label !== '' && field.label !== field.id && (
          <span className={s.friendlyLabel}>{field.label}</span>
        )}
        {readOnly && (
          <span className={s.readOnlyTag}>
            {fileManagedSource === undefined ? 'file only' : 'file managed'}
          </span>
        )}
      </label>
      {readOnly
        ? renderReadOnlyValue(field, value, fileManagedSource)
        : renderInput(field, value, onChange, error !== null, showDwell === true, columns)}
      {error !== null && (
        <span className={s.error} role="alert">
          <Icon icon={TriangleAlert} size={14} />
          {error}
        </span>
      )}
    </div>
  );
}

function renderReadOnlyValue(
  field: DynamicField,
  value: FieldValue | undefined,
  fileManagedSource?: string,
): JSX.Element {
  const label = field.label || field.id;
  if (field.type === 'list' && fileManagedSource !== undefined) {
    return (
      <div className={s.fileManagedValue} aria-label={`${label} connected file`}>
        <span>Connected file</span>
        <code title={fileManagedSource}>{fileManagedSource}</code>
      </div>
    );
  }
  if (field.type === 'list') {
    const items = listItems(value, field.default);
    return (
      <ol className={s.readOnlyItems} aria-label={`${label} read-only items`}>
        {items.map((item, index) => (
          <li key={item.id}>
            <span>{String(index + 1)}</span>
            <bdi>{typeof item.text === 'string' ? item.text : ''}</bdi>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <textarea
      className={cx(s.input, s.readOnlyValue)}
      dir="auto"
      readOnly
      rows={field.type === 'multiline' ? 3 : 1}
      value={asString(value)}
      aria-label={label}
    />
  );
}

/**
 * `PERSIAN-DIGITS-01` — a `number` field's preview value, typed on the author's own keyboard.
 *
 * It was a native `type="number"` box, which drops every digit that is not ASCII before script
 * sees it: measured in Chromium, `۱۲٫۵` typed here previewed as `0`. The box now keeps the text
 * as typed, the one reader (`useTypedNumber`) decides the number, and only a NUMBER is handed on
 * — so the template still receives a JSON number, exactly as it does on air. Impossible numeric
 * characters are refused at entry time; numeric range/choice errors keep their own error line.
 */
function PreviewNumberInput({
  className,
  value,
  onChange,
  label,
  digits,
  field,
}: {
  className: string;
  value: number;
  onChange: (v: FieldValue) => void;
  label: string;
  /** `TEXT-DIGITS-01` — the field's digits: the box shows and types the number in them. */
  digits: DigitSet;
  field: Extract<DynamicField, { type: 'number' }>;
}): JSX.Element {
  const typed = useTypedNumber(value, { rejectInvalid: true });
  const [rangeRefusal, setRangeRefusal] = useState<string | null>(null);
  const refusal = typed.refusal ?? rangeRefusal;
  return (
    <>
      <input
        className={cx(className, refusal !== null && s.inputInvalid)}
        type="text"
        inputMode="decimal"
        value={writeFieldDigits(typed.text, digits, 'number')}
        onChange={(e) => {
          const text = writeDigitsInto(
            e.currentTarget,
            e.nativeEvent,
            digits,
            keyboardLanguage,
            'number',
          );
          const reading = typed.change(text);
          if (reading.kind === 'number') {
            const error = numberFieldValueError(field, reading.value);
            setRangeRefusal(error ?? null);
            if (error === undefined) onChange(reading.value);
          }
        }}
        aria-label={label}
        {...(refusal !== null ? { 'aria-invalid': true } : {})}
      />
      {refusal !== null && (
        <span className={s.error} role="alert">
          <Icon icon={TriangleAlert} size={14} />
          {refusal}
        </span>
      )}
    </>
  );
}

/** D-106 — a textarea that auto-grows to its content (compact when short, full when long). */
function GrowTextarea({
  className,
  rows,
  multiline,
  value,
  onChange,
  label,
  digits,
}: {
  className: string;
  rows: number;
  multiline: boolean;
  value: string;
  onChange: (v: FieldValue) => void;
  label: string;
  /** `TEXT-DIGITS-01` — the field's digits: shown, and each digit written in them as it is typed. */
  digits: FieldDigits;
}): JSX.Element {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    el.style.height = 'auto';
    el.style.height = `${String(el.scrollHeight)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={cx(className, s.grow)}
      dir="auto"
      rows={rows}
      value={writeFieldDigits(value, digits)}
      onChange={(e) =>
        onChange(writeDigitsInto(e.currentTarget, e.nativeEvent, digits, keyboardLanguage))
      }
      onKeyDown={(e) => {
        // D-106 — a single-line `text` field keeps single-line semantics: Enter
        // does not insert a newline (only `multiline` fields accept newlines).
        if (!multiline && e.key === 'Enter') e.preventDefault();
      }}
      aria-label={label}
    />
  );
}

function renderInput(
  field: DynamicField,
  value: FieldValue | undefined,
  onChange: (v: FieldValue) => void,
  invalid: boolean,
  showDwell = false,
  columns?: readonly ListItemColumn[],
): JSX.Element {
  const cls = cx(s.input, invalid && s.inputInvalid);
  // A stable accessible name per field (label, else the data key) so the preview
  // form is reachable by `getByLabel` in E2E — and a genuine a11y improvement.
  const label = field.label || field.id;
  switch (field.type) {
    case 'multiline':
      return (
        <GrowTextarea
          className={cls}
          rows={2}
          multiline
          value={asString(value)}
          onChange={onChange}
          label={label}
          digits={fieldDigitsOf(field)}
        />
      );
    case 'number': {
      const numberDigits = fieldDigitsOf(field);
      const allowedValues = numberFieldAllowedValues(field);
      if (allowedValues !== undefined) {
        return (
          <Select
            className={cls}
            value={String(
              typeof value === 'number' && allowedValues.includes(value)
                ? value
                : (allowedValues[0] ?? field.default),
            )}
            aria-label={label}
            onChange={(event) => onChange(Number(event.currentTarget.value))}
          >
            {allowedValues.map((choice) => (
              <option key={choice} value={choice}>
                {numberFieldValueLabel(field, choice)}
              </option>
            ))}
          </Select>
        );
      }
      return (
        <PreviewNumberInput
          className={cls}
          value={typeof value === 'number' ? value : field.default}
          onChange={onChange}
          label={label}
          digits={numberDigits === 'as-typed' ? 'latin' : numberDigits}
          field={field}
        />
      );
    }
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
    case 'list': {
      // D-028 — the same items editor the ticker/sequence/repeater
      // inspectors use; every edit live-updates the stage. D-029 —
      // sequence-bound lists get the per-item dwell column. D-030 —
      // repeater-bound lists get one column per child field.
      const RowsEditor = columns === undefined ? ListItemsEditor : ListItemsDialog;
      return (
        <RowsEditor
          items={listItems(value, field.default)}
          label={label}
          showDwell={showDwell}
          // D-118 — a SEQUENCE-bound list (its hallmark is the per-item dwell) edits its item text in
          // the SAME multi-line textarea as the inspector, so the preview matches the properties panel.
          // (A `list` field carries no own direction; the textarea inherits the form's reading order.)
          multiline={showDwell}
          dir="auto"
          columns={columns}
          digits={fieldDigitsOf(field)}
          // `RUN-NEXT-VERSION-02` Q3 — a repeater's list stops at its row limit, as the Rows section does.
          maxItems={field.maxItems}
          onChange={(items) => onChange(items)}
        />
      );
    }
    case 'text':
      if (field.countdown !== undefined) {
        const digits = fieldDigitsOf(field);
        return (
          <DateTimeInput
            mode={field.countdown.target}
            value={asString(value)}
            onCommit={onChange}
            ariaLabel={label}
            digits={digits === 'as-typed' ? 'latin' : digits}
          />
        );
      }
      return (
        <GrowTextarea
          className={cls}
          rows={1}
          multiline={false}
          value={asString(value)}
          onChange={onChange}
          label={label}
          digits={fieldDigitsOf(field)}
        />
      );
    default:
      // D-106 — an auto-grow textarea so long values are fully visible (compact when short).
      return (
        <GrowTextarea
          className={cls}
          rows={1}
          multiline={false}
          value={asString(value)}
          onChange={onChange}
          label={label}
          digits={fieldDigitsOf(field)}
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
  /*
    `PERSIAN-DIGITS-01` — a pattern is written with Latin classes (`[0-9]`, `\d`), and the author
    types on a Persian keyboard: the `Time (HH:MM)` preset refused `۲۱:۳۰`. So a value is accepted
    when it matches as typed OR with its digits, `٫` and `٬` read as Latin. The VALUE is not
    rewritten, and no stored pattern is — templates already exported carry the old presets, and
    reading the value is the fix that reaches them. `R-101` — the rule is `valueMatchesPattern`
    now, the one CG Control asks too; an invalid pattern is a field-config issue, not a value error.
  */
  if (field.pattern !== undefined && !valueMatchesPattern(field.pattern, str)) {
    return `Doesn't match ${field.pattern}`;
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
