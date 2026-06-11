import type { ListItem } from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import * as s from './ListItemsEditor.css.js';

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
  /** D-029 — show the optional per-item dwell input (sequence contexts). */
  showDwell?: boolean;
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

/** The item's dwell in SECONDS for display ('' = unset → element default). */
function dwellSecondsOf(item: ListItem): string {
  const d = (item as Record<string, unknown>)['dwellMs'];
  return typeof d === 'number' && d > 0 ? String(d / 1000) : '';
}

/** Set/clear `dwellMs` from a seconds input, preserving every other field. */
function withDwell(item: ListItem, secondsRaw: string): ListItem {
  const next: Record<string, unknown> = { ...item };
  const secs = Number.parseFloat(secondsRaw);
  if (secondsRaw.trim() === '' || !Number.isFinite(secs) || secs <= 0) {
    delete next['dwellMs'];
  } else {
    next['dwellMs'] = Math.max(1, Math.round(secs * 1000));
  }
  return next as ListItem;
}

export function ListItemsEditor({ items, onChange, label, showDwell = false }: Props): JSX.Element {
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
      {items.map((item, i) => (
        <div key={item.id} className={s.itemRow}>
          <input
            className={s.itemInput}
            type="text"
            value={textOf(item)}
            aria-label={`${label} item ${String(i + 1)}`}
            onChange={(e) =>
              onChange(items.map((it, j) => (j === i ? { ...it, text: e.target.value } : it)))
            }
          />
          {showDwell && (
            <input
              className={s.dwellInput}
              type="number"
              min={0.1}
              step={0.5}
              placeholder="dwell"
              title="Per-item dwell in seconds (blank = the element's default dwell)"
              value={dwellSecondsOf(item)}
              aria-label={`${label} item ${String(i + 1)} dwell`}
              onChange={(e) =>
                onChange(items.map((it, j) => (j === i ? withDwell(it, e.target.value) : it)))
              }
            />
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
        </div>
      ))}
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
