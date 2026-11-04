import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { writeDigitsInto } from '@cg/gesture';
import {
  FieldDigitsSchema,
  numberFieldAllowedValues,
  numberFieldValueLabel,
  numberFieldValueError,
  type FieldDigits,
  type ListItem,
} from '@cg/shared-schema';
import { formatNumberLike, readLocalizedDuration, writeFieldDigits } from '@cg/text-shaping';
import { cx } from '../../cx.js';
import { keyboardLanguage } from '../../keyboardLanguage.js';
import { digitsWord } from '../inspector/DigitsField.js';
import { usePageThumb } from '../inspector/pageThumbs.js';
import { useTypedNumber } from '../../ui/typedNumber.js';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import { Select } from '../../ui/Select.js';
import { Tag } from '../../ui/Tag.js';
import { Textarea } from '../../ui/Textarea.js';
import type { ListItemColumn } from './repeater-columns.js';
import * as s from './ListItemsEditor.css.js';

/** D-083 — a composition the sequence's composition items can reference. */
export interface CompositionChoice {
  id: string;
  name: string;
}

/**
 * D-028 — the shared list-items editor (add / remove / reorder / edit text).
 * Used by the ticker/sequence inspector sections (editing the element's
 * authored items) and by the preview field form (editing a bound `list`
 * field's value), so authoring and operating look identical.
 *
 * Items follow the extensible `list` shape: required stable `id` + open
 * fields. The editor touches ONLY `text` (and, with {@link Props.showDwell},
 * `dwellMs`) and preserves everything else, so a future repeater payload
 * survives an edit here. Stable ids are what the runtime reconciles by —
 * never regenerated for existing items.
 *
 * D-029 — `showDwell` adds an optional per-item dwell column (edited in
 * SECONDS, stored as `dwellMs`; blank = the element's default dwell), for
 * sequence contexts in both the inspector and the preview form.
 */
export interface ListItemsEditorProps {
  items: readonly ListItem[];
  onChange: (items: ListItem[]) => void;
  /** Accessible-name base, e.g. the field label ("Headlines item 2"). */
  label: string;
  /**
   * D-118 — the item TEXT reading direction (the element's `direction`) applied to the multi-line
   * textarea, so Persian/RTL item text edits in reading order. Absent ⇒ inherits (LTR contexts).
   */
  dir?: 'ltr' | 'rtl' | 'auto' | undefined;
  /**
   * D-118 — render the single-text item input as a multi-line `<Textarea>` (sequence contexts), in
   * BOTH the inspector and the preview field form, so authoring a `\n` (D-117 renders it) is possible
   * everywhere. Absent/false ⇒ a single-line `<input>` (the ticker + generic list, unchanged). (The
   * `compositions` sequence-inspector branch is always a textarea.)
   */
  multiline?: boolean | undefined;
  /** D-029 — show the optional per-item dwell input (sequence contexts). */
  showDwell?: boolean;
  /**
   * D-030 — render one input PER COLUMN instead of the single `text` input
   * (repeater contexts: columns = the child composition's fields). Unknown
   * item fields are still preserved.
   */
  columns?: readonly ListItemColumn[] | undefined;
  /**
   * D-083 — when provided (sequence contexts), each item gains a KIND picker
   * (Text / Composition); a Composition item swaps its text input for a
   * composition picker drawn from this list. Absent ⇒ text-only (the prior
   * ticker / preview-form behaviour, unchanged).
   */
  compositions?: readonly CompositionChoice[] | undefined;
  /**
   * D-083 follow-up — the explicit per-item TEXT bind affordance (INSPECTOR sequence
   * context only). `itemDataKey` returns an item's current data key ('' = unbound);
   * `onItemDataKey` sets/renames/clears it (returns false if rejected, e.g. a key already
   * owned). When `onItemDataKey` is absent (preview form / ticker), text items show NO bind
   * control — operator-editability requires the designer to bind explicitly.
   */
  itemDataKey?: (itemId: string) => string;
  onItemDataKey?: (itemId: string, key: string) => boolean;
  /**
   * `TEXT-DIGITS-01` — the Digits the items' TEXT is typed in (a bound list field's, or the ticker's
   * / sequence's own): each box shows its text in them and writes each digit as it is typed, the
   * caret kept. Absent ⇒ boxes as before.
   */
  digits?: FieldDigits | undefined;
  /**
   * `TEXT-DIGITS-01` — a BOUND sequence item's own field Digits (`undefined` for an unbound item),
   * which win over {@link digits} for that item's box; `onItemDigits` sets them from the one Digits
   * control shown beside the item's data key.
   */
  itemDigits?: ((itemId: string) => FieldDigits | undefined) | undefined;
  onItemDigits?: ((itemId: string, digits: FieldDigits) => void) | undefined;
  /**
   * 🔴 `B-106` — the repeater's row LIMIT (`repeaterRowLimit`, the one reading the page shares):
   * `Add item` is withheld at it, and a row past it — authored before the limit was lowered — is
   * flagged "not shown", because the page stamps only the first `maxItems`. Absent ⇒ no limit.
   */
  maxItems?: number | undefined;
  /** Roomier controls for modal/table editing; compact Inspector lists keep their existing density. */
  comfortable?: boolean | undefined;
}

/** `B-106` — why `Add item` is withheld at the limit, as the add row's title. */
export function rowLimitReason(maxItems: number): string {
  return `At most ${String(maxItems)} row${maxItems === 1 ? '' : 's'} (max items). Raise max items to add more.`;
}

/** `B-106` — why a row past the limit is not shown, as its flag's title. */
export function rowOverLimitReason(maxItems: number): string {
  return `Past max items (${String(maxItems)}): the page stamps only the first ${String(maxItems)}.`;
}

/**
 * `TEXT-DIGITS-01` — an item box's text as shown, and as typed: in `digits` (absent: untouched), each
 * entered digit written through the one writer, the caret kept.
 */
export function shown(text: string, digits: FieldDigits | undefined): string {
  return digits === undefined ? text : writeFieldDigits(text, digits);
}
export function typedInto(
  el: HTMLInputElement | HTMLTextAreaElement,
  event: Event,
  digits: FieldDigits | undefined,
): string {
  return digits === undefined ? el.value : writeDigitsInto(el, event, digits, keyboardLanguage);
}

/** D-083 — the item's kind ('text' default for back-compat); `D-163` a PICTURE. */
function kindOf(item: ListItem): 'text' | 'composition' | 'image' {
  const kind = (item as Record<string, unknown>)['kind'];
  return kind === 'composition' ? 'composition' : kind === 'image' ? 'image' : 'text';
}

/** `D-163` — a picture item's file name (or its id when it carries none). */
function pageNameOf(item: ListItem): string {
  const name = (item as Record<string, unknown>)['name'];
  return typeof name === 'string' && name !== '' ? name : item.id;
}

/**
 * `D-163` / 🔴 `RUN-NEXT-VERSION-03` 1.6 — a PICTURE item, in either of the editor's forms: its thumbnail
 * and its file name, never a box to type in. The Preview's data form shows a book through the plain
 * form, which knew no pictures, so a book of four pictures and a text page drew five text boxes, four
 * of them empty (the owner, 2026-10-21).
 */
function PictureItem({ item, ariaLabel }: { item: ListItem; ariaLabel: string }): JSX.Element {
  const assetId = (item as Record<string, unknown>)['assetId'];
  const thumb = usePageThumb(typeof assetId === 'string' ? assetId : undefined);
  const name = pageNameOf(item);
  return (
    <span className={s.pictureItem} title={name} aria-label={ariaLabel} data-list-picture="">
      {thumb !== null && <img src={thumb} alt="" className={s.pictureThumb} draggable={false} />}
      <span className={s.pageName}>{name}</span>
    </span>
  );
}

/** The composition id a composition item references ('' when unset). */
function compIdOf(item: ListItem): string {
  const v = (item as Record<string, unknown>)['compositionId'];
  return typeof v === 'string' ? v : '';
}

/** Switch an item's kind, preserving its stable id + dwell; drops the other kind's payload. */
function withKind(item: ListItem, kind: 'text' | 'composition', firstCompId: string): ListItem {
  const o = item as Record<string, unknown>;
  const dwell = typeof o['dwellMs'] === 'number' ? { dwellMs: o['dwellMs'] } : {};
  if (kind === 'composition') {
    const keep = typeof o['compositionId'] === 'string' ? o['compositionId'] : firstCompId;
    return { id: item.id, kind: 'composition', compositionId: keep, ...dwell } as ListItem;
  }
  const text = typeof o['text'] === 'string' ? o['text'] : '';
  return { id: item.id, kind: 'text', text, ...dwell } as ListItem;
}

let seq = 0;
/**
 * Session-unique id for a NEW item (no secure-context APIs — see memory). Exported so the Pages
 * manager's `Add text` / `Add composition` make items exactly as `Add item` does here (`D-163`).
 */
export function newItemId(): string {
  seq += 1;
  return `item-${Date.now().toString(36)}-${String(seq)}`;
}

function textOf(item: ListItem): string {
  const t = (item as Record<string, unknown>)['text'];
  return typeof t === 'string' ? t : '';
}

/** The item's dwell in MILLISECONDS (`undefined` = unset → the element's default dwell). */
function dwellMsOf(item: ListItem): number | undefined {
  const d = (item as Record<string, unknown>)['dwellMs'];
  return typeof d === 'number' && d > 0 ? d : undefined;
}

/** Set/clear `dwellMs`, preserving every other field. Unset or zero clears it. */
function withDwell(item: ListItem, ms: number | undefined): ListItem {
  const next: Record<string, unknown> = { ...item };
  if (ms === undefined || ms <= 0) {
    delete next['dwellMs'];
  } else {
    next['dwellMs'] = Math.max(1, Math.round(ms));
  }
  return next as ListItem;
}

/** Display value for one TEXT column cell ('' when unset). */
function cellOf(item: ListItem, key: string): string {
  const v = (item as Record<string, unknown>)[key];
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

/** A NUMBER column cell's value (`undefined` when unset). */
function numberCellOf(item: ListItem, key: string): number | undefined {
  const v = (item as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : undefined;
}

/** An IMAGE column's canonical asset id (legacy scalar ids remain readable). */
function imageCellOf(item: ListItem, key: string): string {
  const v = (item as Record<string, unknown>)[key];
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    const assetId = (v as Record<string, unknown>)['assetId'];
    return typeof assetId === 'string' ? assetId : '';
  }
  return '';
}

function booleanCellOf(item: ListItem, key: string): boolean {
  return (item as Record<string, unknown>)[key] === true;
}

/** Set one TEXT column cell, preserving every other field. */
function withCell(item: ListItem, column: ListItemColumn, raw: string): ListItem {
  return { ...item, [column.key]: raw } as ListItem;
}

/** Set/clear one NUMBER column cell, preserving every other field. */
function withNumberCell(item: ListItem, key: string, n: number | undefined): ListItem {
  const next: Record<string, unknown> = { ...item };
  if (n === undefined) delete next[key];
  else next[key] = n;
  return next as ListItem;
}

/** Set/clear one IMAGE column cell using the canonical FieldValue shape. */
function withImageCell(item: ListItem, key: string, assetId: string): ListItem {
  const next: Record<string, unknown> = { ...item };
  if (assetId === '') delete next[key];
  else next[key] = { assetId };
  return next as ListItem;
}

function withBooleanCell(item: ListItem, key: string, checked: boolean): ListItem {
  return { ...item, [key]: checked } as ListItem;
}

/** A new structured row seeded from the referenced child composition's fields. */
export function newColumnItem(columns: readonly ListItemColumn[]): ListItem {
  const row: Record<string, unknown> = { id: newItemId() };
  for (const column of columns) {
    if (!Object.prototype.hasOwnProperty.call(column, 'defaultValue')) continue;
    const value = column.defaultValue;
    row[column.key] =
      typeof value === 'object' && value !== null
        ? Array.isArray(value)
          ? [...value]
          : { ...(value as Record<string, unknown>) }
        : value;
  }
  return row as ListItem;
}

/**
 * `PERSIAN-DIGITS-01` — a list item's NUMBER, typed on the author's own keyboard: a repeater's
 * number column (`read` a number) or the per-item dwell (`read` a duration — seconds, `m:ss`, or
 * `h:mm:ss`, so `۰۰:۳۰` is thirty seconds). Both were native `type="number"` boxes that dropped
 * Persian digits before script saw them. The text stays as typed; an EMPTY box unsets the value;
 * a text that can never be a number changes nothing and says so on the box itself.
 */
function ItemNumberInput({
  className,
  invalidClassName,
  value,
  onValue,
  kind,
  placeholder,
  title,
  ariaLabel,
  min,
  max,
  step,
  allowedValues,
}: {
  className: string;
  invalidClassName: string;
  value: number | undefined;
  onValue: (next: number | undefined) => void;
  kind: 'number' | 'duration';
  placeholder: string;
  title: string;
  ariaLabel: string;
  min?: number;
  max?: number;
  step?: number;
  allowedValues?: readonly number[];
}): JSX.Element {
  const [rangeRefusal, setRangeRefusal] = useState<string | null>(null);
  const typed = useTypedNumber(
    value,
    kind === 'duration'
      ? {
          read: readLocalizedDuration,
          write: (ms, sample) => formatNumberLike(ms / 1000, sample),
          rejectInvalid: true,
        }
      : { rejectInvalid: true },
  );
  return (
    <input
      className={cx(
        className,
        (typed.refusal !== null || rangeRefusal !== null) && invalidClassName,
      )}
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      // In a row this narrow the refusal cannot take a line of its own: it is the box's tooltip
      // and its danger edge instead.
      title={typed.refusal ?? rangeRefusal ?? title}
      value={typed.text}
      aria-label={ariaLabel}
      {...(typed.refusal !== null || rangeRefusal !== null ? { 'aria-invalid': true } : {})}
      onChange={(e) => {
        const reading = typed.change(e.target.value);
        if (reading.kind === 'number') {
          const error =
            kind === 'number'
              ? numberFieldValueError(
                  {
                    ...(min === undefined ? {} : { min }),
                    ...(max === undefined ? {} : { max }),
                    ...(step === undefined ? {} : { step }),
                    ...(allowedValues === undefined ? {} : { allowedValues }),
                  },
                  reading.value,
                )
              : undefined;
          setRangeRefusal(error ?? null);
          if (error === undefined) onValue(reading.value);
        } else if (e.target.value.trim() === '') {
          setRangeRefusal(null);
          onValue(undefined);
        }
      }}
    />
  );
}

/** One labelled structured cell. The label is visible; placeholder/title are only secondary help. */
function StructuredCellEditor({
  column,
  row,
  rowNumber,
  label,
  dir,
  onChange,
}: {
  column: ListItemColumn;
  row: ListItem;
  rowNumber: number;
  label: string;
  dir?: 'ltr' | 'rtl' | 'auto' | undefined;
  onChange: (row: ListItem) => void;
}): JSX.Element {
  const ariaLabel = `${label} item ${String(rowNumber)} ${column.label}`;
  let control: JSX.Element;

  if (column.kind === 'number') {
    const allowedValues = numberFieldAllowedValues(column);
    control =
      allowedValues !== undefined ? (
        <Select
          className={s.itemInput}
          wrapperClassName={s.itemControl}
          value={String(numberCellOf(row, column.key) ?? column.defaultValue ?? allowedValues[0])}
          aria-label={ariaLabel}
          onChange={(event) =>
            onChange(withNumberCell(row, column.key, Number(event.target.value)))
          }
        >
          {allowedValues.map((value) => (
            <option key={value} value={value}>
              {numberFieldValueLabel(column, value)}
            </option>
          ))}
        </Select>
      ) : (
        <ItemNumberInput
          className={s.itemInput}
          invalidClassName={s.inputInvalid}
          kind="number"
          placeholder={column.label}
          title={column.label}
          value={numberCellOf(row, column.key)}
          ariaLabel={ariaLabel}
          {...(column.min === undefined ? {} : { min: column.min })}
          {...(column.max === undefined ? {} : { max: column.max })}
          {...(column.step === undefined ? {} : { step: column.step })}
          {...(column.allowedValues === undefined ? {} : { allowedValues: column.allowedValues })}
          onValue={(value) => onChange(withNumberCell(row, column.key, value))}
        />
      );
  } else if (column.kind === 'image' || column.kind === 'select') {
    const value = column.kind === 'image' ? imageCellOf(row, column.key) : cellOf(row, column.key);
    const known = column.choices?.some((choice) => choice.value === value) === true;
    control = (
      <Select
        className={s.itemInput}
        wrapperClassName={s.itemControl}
        value={value}
        aria-label={ariaLabel}
        onChange={(event) =>
          onChange(
            column.kind === 'image'
              ? withImageCell(row, column.key, event.target.value)
              : withCell(row, column, event.target.value),
          )
        }
      >
        {column.kind === 'image' && <option value="">— use default / no image —</option>}
        {value !== '' && !known && <option value={value}>{value} (missing)</option>}
        {(column.choices ?? []).map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </Select>
    );
  } else if (column.kind === 'boolean') {
    control = (
      <input
        type="checkbox"
        checked={booleanCellOf(row, column.key)}
        aria-label={ariaLabel}
        onChange={(event) => onChange(withBooleanCell(row, column.key, event.target.checked))}
      />
    );
  } else if (column.kind === 'color') {
    const value = cellOf(row, column.key);
    control = (
      <input
        className={s.itemInput}
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
        aria-label={ariaLabel}
        onChange={(event) => onChange(withCell(row, column, event.target.value))}
      />
    );
  } else {
    control = (
      <input
        className={s.itemInput}
        type="text"
        dir={dir}
        placeholder={column.label}
        value={shown(cellOf(row, column.key), column.digits)}
        aria-label={ariaLabel}
        onChange={(event) => {
          const text = typedInto(event.currentTarget, event.nativeEvent, column.digits);
          onChange(withCell(row, column, text));
        }}
      />
    );
  }

  return (
    <label className={s.structuredCell} title={column.key}>
      <span className={s.structuredLabel}>{column.label}</span>
      {control}
    </label>
  );
}

export function ListItemsEditor({
  items,
  onChange,
  label,
  dir,
  multiline = false,
  showDwell = false,
  columns,
  compositions,
  itemDataKey,
  onItemDataKey,
  digits,
  itemDigits,
  onItemDigits,
  maxItems,
  comfortable = false,
}: ListItemsEditorProps): JSX.Element {
  const atLimit = maxItems !== undefined && items.length >= maxItems;
  /** The Digits an item's text box writes: its own bound field's, else the list's / element's. */
  const digitsFor = (item: ListItem): FieldDigits | undefined => itemDigits?.(item.id) ?? digits;
  const move = (from: number, to: number): void => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const moved = next.splice(from, 1)[0];
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div
      className={cx(
        s.list,
        comfortable && s.comfortableList,
        columns !== undefined && s.structuredList,
      )}
      data-structured-rows={columns === undefined ? undefined : ''}
    >
      {items.length === 0 && <p className={s.empty}>No items yet — add the first one.</p>}
      {items.map((item, i) => {
        const dwellInput = showDwell ? (
          <ItemNumberInput
            className={s.dwellInput}
            invalidClassName={s.inputInvalid}
            kind="duration"
            placeholder="dwell"
            title="Per-item dwell in seconds (blank = the element's default dwell)"
            value={dwellMsOf(item)}
            ariaLabel={`${label} item ${String(i + 1)} dwell`}
            onValue={(ms) => onChange(items.map((it, j) => (j === i ? withDwell(it, ms) : it)))}
          />
        ) : null;
        const controls = (
          <>
            <Control
              size="sm"
              title="Move up"
              aria-label={`Move ${label} item ${String(i + 1)} up`}
              disabled={i === 0}
              onClick={() => move(i, i - 1)}
            >
              ↑
            </Control>
            <Control
              size="sm"
              title="Move down"
              aria-label={`Move ${label} item ${String(i + 1)} down`}
              disabled={i === items.length - 1}
              onClick={() => move(i, i + 1)}
            >
              ↓
            </Control>
            <Control
              variant="danger"
              size="sm"
              title="Remove item"
              aria-label={`Remove ${label} item ${String(i + 1)}`}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              ×
            </Control>
          </>
        );

        // D-083 — sequence items: KIND picker + dwell + controls on line 1; the value
        // (text input OR composition picker) on its OWN full-width line so a long
        // headline stays fully visible in the narrow inspector panel.
        if (compositions !== undefined) {
          return (
            <div key={item.id} className={s.seqItem}>
              <div className={s.seqTopLine}>
                <Select
                  value={kindOf(item)}
                  aria-label={`${label} item ${String(i + 1)} type`}
                  onChange={(e) => {
                    // D-163 — `Picture` is only ever the kind an item already has: a picture
                    // comes from `Add pictures…`, never from turning text into one.
                    if (e.target.value === 'image') return;
                    onChange(
                      items.map((it, j) =>
                        j === i
                          ? withKind(
                              it,
                              e.target.value === 'composition' ? 'composition' : 'text',
                              compositions[0]?.id ?? '',
                            )
                          : it,
                      ),
                    );
                  }}
                >
                  <option value="text">Text</option>
                  <option value="composition">Composition</option>
                  {kindOf(item) === 'image' && <option value="image">Picture</option>}
                </Select>
                <div className={s.itemActions}>
                  {dwellInput}
                  {controls}
                </div>
              </div>
              {kindOf(item) === 'image' ? (
                <PictureItem item={item} ariaLabel={`${label} item ${String(i + 1)} picture`} />
              ) : kindOf(item) === 'composition' ? (
                <Select
                  value={compIdOf(item)}
                  aria-label={`${label} item ${String(i + 1)} composition`}
                  onChange={(e) =>
                    onChange(
                      items.map((it, j) =>
                        j === i ? ({ ...it, compositionId: e.target.value } as ListItem) : it,
                      ),
                    )
                  }
                >
                  {compositions.length === 0 && <option value="">(no compositions)</option>}
                  {compositions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.id}
                    </option>
                  ))}
                </Select>
              ) : (
                // D-118 — a multi-line textarea (Enter inserts `\n`, does not commit), committing
                // through the same per-change item-update path. RTL via the element's `dir`.
                <Textarea
                  value={shown(textOf(item), digitsFor(item))}
                  dir={dir}
                  aria-label={`${label} item ${String(i + 1)}`}
                  onChange={(e) => {
                    const text = typedInto(e.currentTarget, e.nativeEvent, digitsFor(item));
                    onChange(items.map((it, j) => (j === i ? { ...it, text } : it)));
                  }}
                />
              )}
              {/* D-083 follow-up — EXPLICIT per-item bind: a text item is operator-editable
                  ONLY when the designer gives it a data key here (empty = static). Mirrors
                  the element Data-key control; uncontrolled (`key` resets on commit). */}
              {onItemDataKey !== undefined && kindOf(item) === 'text' && (
                <div className={s.seqBindRow} title="Bind this item to a data field">
                  <Icon icon={Link2} size={12} />
                  <input
                    className={s.seqBindKey}
                    type="text"
                    placeholder="data key — bind for operator editing (optional)"
                    title="Bind this text item to a field so the operator can edit it (empty = static design-time text)"
                    defaultValue={itemDataKey?.(item.id) ?? ''}
                    key={`itemdk-${item.id}-${itemDataKey?.(item.id) ?? ''}`}
                    aria-label={`${label} item ${String(i + 1)} data key`}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => {
                      const ok = onItemDataKey(item.id, e.target.value);
                      if (!ok) e.target.value = itemDataKey?.(item.id) ?? '';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') {
                        (e.target as HTMLInputElement).value = itemDataKey?.(item.id) ?? '';
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                  />
                  {/* TEXT-DIGITS-01 — a bound item's field: its ONE Digits control, beside its key,
                      in the same words as every other. */}
                  {onItemDigits !== undefined && itemDigits?.(item.id) !== undefined && (
                    <Select
                      className={s.seqBindDigits}
                      value={itemDigits(item.id)}
                      title="The digits this item's field is written in"
                      aria-label={`${label} item ${String(i + 1)} digits`}
                      onChange={(e) =>
                        onItemDigits(item.id, FieldDigitsSchema.parse(e.target.value))
                      }
                    >
                      {FieldDigitsSchema.options.map((option) => (
                        <option key={option} value={option}>
                          {digitsWord(option)}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              )}
            </div>
          );
        }

        const overLimit = maxItems !== undefined && i >= maxItems;
        return (
          <div
            key={item.id}
            className={cx(s.itemRow, overLimit && s.itemOverLimit)}
            data-over-limit={overLimit ? 'true' : undefined}
          >
            {columns !== undefined && columns.length > 0 ? (
              <div className={s.structuredCells}>
                {columns.map((column) => (
                  <StructuredCellEditor
                    key={column.key}
                    column={column}
                    row={item}
                    rowNumber={i + 1}
                    label={label}
                    dir={dir}
                    onChange={(next) =>
                      onChange(items.map((candidate, index) => (index === i ? next : candidate)))
                    }
                  />
                ))}
              </div>
            ) : kindOf(item) === 'image' ? (
              <PictureItem item={item} ariaLabel={`${label} item ${String(i + 1)} picture`} />
            ) : multiline ? (
              // D-118 — sequence contexts (inspector + preview form): a multi-line textarea (Enter
              // inserts `\n`, does not commit), same per-change item-update path. RTL via `dir`.
              <Textarea
                className={s.itemTextArea}
                value={shown(textOf(item), digitsFor(item))}
                dir={dir}
                aria-label={`${label} item ${String(i + 1)}`}
                onChange={(e) => {
                  const text = typedInto(e.currentTarget, e.nativeEvent, digitsFor(item));
                  onChange(items.map((it, j) => (j === i ? { ...it, text } : it)));
                }}
              />
            ) : (
              <input
                className={s.itemInput}
                type="text"
                dir={dir}
                value={shown(textOf(item), digitsFor(item))}
                aria-label={`${label} item ${String(i + 1)}`}
                onChange={(e) => {
                  const text = typedInto(e.currentTarget, e.nativeEvent, digitsFor(item));
                  onChange(items.map((it, j) => (j === i ? { ...it, text } : it)));
                }}
              />
            )}
            {overLimit && maxItems !== undefined && (
              <Tag className={s.overLimitTag} title={rowOverLimitReason(maxItems)}>
                not shown
              </Tag>
            )}
            {dwellInput}
            {controls}
          </div>
        );
      })}
      {/* `B-106` — withheld at the limit, its reason on the row: a natively disabled button shows
          no title of its own (`D-157`). */}
      <div
        className={s.addRow}
        title={atLimit && maxItems !== undefined ? rowLimitReason(maxItems) : undefined}
      >
        <Button
          variant="secondary"
          disabled={atLimit}
          onClick={() => {
            if (atLimit) return;
            onChange([
              ...items,
              columns !== undefined && columns.length > 0
                ? newColumnItem(columns)
                : { id: newItemId(), text: '' },
            ]);
          }}
        >
          Add item
        </Button>
      </div>
    </div>
  );
}
