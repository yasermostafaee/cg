import { Check, Link2 } from 'lucide-react';
import type { ListItem } from '@cg/shared-schema';
import { formatNumberLike, readLocalizedDuration } from '@cg/text-shaping';
import { cx } from '../../cx.js';
import { useTypedNumber } from '../../ui/typedNumber.js';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import { Select } from '../../ui/Select.js';
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
interface Props {
  items: readonly ListItem[];
  onChange: (items: ListItem[]) => void;
  /** Accessible-name base, e.g. the field label ("Headlines item 2"). */
  label: string;
  /**
   * D-118 — the item TEXT reading direction (the element's `direction`) applied to the multi-line
   * textarea, so Persian/RTL item text edits in reading order. Absent ⇒ inherits (LTR contexts).
   */
  dir?: 'ltr' | 'rtl' | undefined;
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
   * D-106 follow-up — PREVIEW form only: a PER-ITEM Update button (matching the
   * per-field one), so each item input applies independently. `appliedItems` is
   * the on-stage list (an item is "dirty" when its value differs from its
   * same-id applied item); `onUpdateItem` applies ONLY that item to the stage.
   * Absent (inspector / authoring contexts, which edit live) ⇒ no per-item Update.
   */
  appliedItems?: readonly ListItem[] | undefined;
  onUpdateItem?: ((itemId: string) => void) | undefined;
}

/** D-083 — the item's kind ('text' default for back-compat). */
function kindOf(item: ListItem): 'text' | 'composition' {
  return (item as Record<string, unknown>)['kind'] === 'composition' ? 'composition' : 'text';
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
/** Session-unique id for a NEW item (no secure-context APIs — see memory). */
function newItemId(): string {
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
}: {
  className: string;
  invalidClassName: string;
  value: number | undefined;
  onValue: (next: number | undefined) => void;
  kind: 'number' | 'duration';
  placeholder: string;
  title: string;
  ariaLabel: string;
}): JSX.Element {
  const typed = useTypedNumber(
    value,
    kind === 'duration'
      ? { read: readLocalizedDuration, write: (ms, sample) => formatNumberLike(ms / 1000, sample) }
      : {},
  );
  return (
    <input
      className={cx(className, typed.refusal !== null && invalidClassName)}
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      // In a row this narrow the refusal cannot take a line of its own: it is the box's tooltip
      // and its danger edge instead.
      title={typed.refusal ?? title}
      value={typed.text}
      aria-label={ariaLabel}
      {...(typed.refusal !== null ? { 'aria-invalid': true } : {})}
      onChange={(e) => {
        const reading = typed.change(e.target.value);
        if (reading.kind === 'number') onValue(reading.value);
        else if (e.target.value.trim() === '') onValue(undefined);
      }}
    />
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
  appliedItems,
  onUpdateItem,
}: Props): JSX.Element {
  // D-106 follow-up — an item is edited-but-unapplied when its value differs from
  // the same-id on-stage item (a brand-new item, with no applied twin, is dirty).
  const itemDirty = (item: ListItem): boolean => {
    if (onUpdateItem === undefined) return false;
    const applied = appliedItems?.find((a) => a.id === item.id);
    return JSON.stringify(item) !== JSON.stringify(applied ?? null);
  };
  const move = (from: number, to: number): void => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const moved = next.splice(from, 1)[0];
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div className={s.list}>
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
            {onUpdateItem !== undefined && (
              <Control
                variant="primary"
                size="sm"
                title={
                  itemDirty(item)
                    ? 'Apply this item to the stage'
                    : 'No unsaved change for this item'
                }
                aria-label={`Update ${label} item ${String(i + 1)}`}
                disabled={!itemDirty(item)}
                onClick={() => onUpdateItem(item.id)}
              >
                <Icon icon={Check} size={12} />
              </Control>
            )}
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
                  onChange={(e) =>
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
                    )
                  }
                >
                  <option value="text">Text</option>
                  <option value="composition">Composition</option>
                </Select>
                <div className={s.itemActions}>
                  {dwellInput}
                  {controls}
                </div>
              </div>
              {kindOf(item) === 'composition' ? (
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
                  value={textOf(item)}
                  dir={dir}
                  aria-label={`${label} item ${String(i + 1)}`}
                  onChange={(e) =>
                    onChange(items.map((it, j) => (j === i ? { ...it, text: e.target.value } : it)))
                  }
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
                </div>
              )}
            </div>
          );
        }

        return (
          <div key={item.id} className={s.itemRow}>
            {columns !== undefined && columns.length > 0 ? (
              // D-030 — one input per child-composition field (column).
              columns.map((col) =>
                col.kind === 'number' ? (
                  <ItemNumberInput
                    key={col.key}
                    className={s.itemInput}
                    invalidClassName={s.inputInvalid}
                    kind="number"
                    placeholder={col.label}
                    title={col.label}
                    value={numberCellOf(item, col.key)}
                    ariaLabel={`${label} item ${String(i + 1)} ${col.label}`}
                    onValue={(n) =>
                      onChange(
                        items.map((it, j) => (j === i ? withNumberCell(it, col.key, n) : it)),
                      )
                    }
                  />
                ) : (
                  <input
                    key={col.key}
                    className={s.itemInput}
                    type="text"
                    placeholder={col.label}
                    title={col.label}
                    value={cellOf(item, col.key)}
                    aria-label={`${label} item ${String(i + 1)} ${col.label}`}
                    onChange={(e) =>
                      onChange(
                        items.map((it, j) => (j === i ? withCell(it, col, e.target.value) : it)),
                      )
                    }
                  />
                ),
              )
            ) : multiline ? (
              // D-118 — sequence contexts (inspector + preview form): a multi-line textarea (Enter
              // inserts `\n`, does not commit), same per-change item-update path. RTL via `dir`.
              <Textarea
                className={s.itemTextArea}
                value={textOf(item)}
                dir={dir}
                aria-label={`${label} item ${String(i + 1)}`}
                onChange={(e) =>
                  onChange(items.map((it, j) => (j === i ? { ...it, text: e.target.value } : it)))
                }
              />
            ) : (
              <input
                className={s.itemInput}
                type="text"
                value={textOf(item)}
                aria-label={`${label} item ${String(i + 1)}`}
                onChange={(e) =>
                  onChange(items.map((it, j) => (j === i ? { ...it, text: e.target.value } : it)))
                }
              />
            )}
            {dwellInput}
            {controls}
          </div>
        );
      })}
      <div className={s.addRow}>
        <Button
          variant="secondary"
          onClick={() => onChange([...items, { id: newItemId(), text: '' }])}
        >
          Add item
        </Button>
      </div>
    </div>
  );
}
