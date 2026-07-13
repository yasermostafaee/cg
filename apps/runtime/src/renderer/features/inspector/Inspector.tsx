import { useEffect, useState, useSyncExternalStore } from 'react';
import type { DynamicField, FieldValue, StackItemState } from '@cg/shared-schema';
import type { TemplateInfo } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { DraftChip } from '../../ui/DraftChip.js';
import { ListFieldEditor } from './ListFieldEditor.js';
import { PositionPicker } from './PositionPicker.js';
import {
  draftsVersion,
  effectiveValue,
  isFieldDirty,
  isItemDirty,
  stageField,
  subscribeDrafts,
} from './draftStore.js';

/** The shared field class, plus the dirty accent (border only — no layout shift). */
function fieldClass(dirty: boolean): string {
  return dirty ? 'cg-field is-dirty' : 'cg-field';
}

interface Props {
  item: StackItemState | null;
  /** Apply the item's staged draft as one atomic `stack.update` (the round-trip). */
  onApply: (itemId: string) => Promise<{ accepted: boolean }>;
  /** Discard the item's staged draft, reverting to applied values. */
  onDiscard: (itemId: string) => void;
}

const styles = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    background: colors.panel,
    borderRadius: '0.25rem',
    border: `1px solid ${colors.border}`,
    padding: '0.75rem 1rem',
    gap: '0.5rem',
    minHeight: 0,
    overflowY: 'auto' as const,
  },
  heading: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    margin: 0,
  },
  empty: { color: colors.textMuted, fontSize: '0.9rem' },
  title: { fontSize: '1.1rem', fontWeight: 600, margin: 0 },
  meta: { color: colors.textMuted, fontSize: '0.85rem' },
  actions: { display: 'flex', gap: '0.5rem', marginTop: '0.25rem', alignItems: 'center' },
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: '0.5rem',
    padding: '0.25rem 0',
    fontSize: '0.9rem',
    alignItems: 'center',
  },
  fieldLabel: { color: colors.textMuted, fontWeight: 500, display: 'flex', gap: '0.3rem' },
} as const;

/**
 * Inspector pane (Phase 6 §4 / R-003). Fields now STAGE locally: every edit
 * writes to the per-item draft store, and NOTHING reaches the bridge on change,
 * blur, or Enter. The item's staged field-set is applied as one atomic
 * `stack.update` by the Update control (here + the stack row); Discard reverts
 * drafts to the last applied values. Drafts are keyed by item and survive
 * selection switches.
 *
 * Field metadata is fetched via `templates.get` on selection change; if the
 * registry doesn't know the template we fall back to type inference so the
 * inspector is never empty.
 */
export function Inspector({ item, onApply, onDiscard }: Props): JSX.Element {
  const [info, setInfo] = useState<TemplateInfo | null>(null);
  // Re-render on any draft change so dirty markers + the draft-or-applied
  // values stay live (a push to `item` also re-renders via props).
  useSyncExternalStore(subscribeDrafts, draftsVersion);

  useEffect(() => {
    if (item === null) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    void window.cg.templates.get({ templateId: item.templateId }).then((resolved) => {
      if (!cancelled) setInfo(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [item]);

  if (item === null) {
    return (
      <aside style={styles.panel} aria-label="Inspector">
        <h2 style={styles.heading}>INSPECTOR</h2>
        <p style={styles.empty}>Select a stack item to inspect its fields.</p>
      </aside>
    );
  }

  const itemId = item.itemId;
  const schema = info?.fields ?? null;
  const valueEntries = Object.entries(item.fields);
  const rows: { field: DynamicField | null; key: string; value: FieldValue | undefined }[] =
    schema !== null && schema.length > 0
      ? schema.map((f) => ({ field: f, key: f.id, value: item.fields[f.id] }))
      : valueEntries.map(([key, value]) => ({ field: null, key, value }));

  const dirty = isItemDirty(itemId, item.fields);

  return (
    <aside style={styles.panel} aria-label="Inspector">
      <h2 style={styles.heading}>INSPECTOR</h2>
      <h3 style={styles.title}>{String(item.fields['title'] ?? item.itemId)}</h3>
      <div style={styles.meta}>{item.templateId}</div>
      <div style={styles.meta}>
        Status: {item.status}
        {item.pending ? ' (pending)' : ''}
      </div>
      {item.slot && (
        <div style={styles.meta}>
          Slot: {item.slot.channel}-{item.slot.layer} on {item.slot.server}
        </div>
      )}
      <div style={styles.actions}>
        {/* Apply stays enabled even with nothing staged — re-sending unchanged
            values is the operator's documented B-048 recovery path. */}
        <AsyncButton
          variant="secondary"
          aria-label="Apply staged edits"
          run={() => onApply(itemId)}
        >
          Update
        </AsyncButton>
        <Button
          variant="ghost"
          aria-label="Discard staged edits"
          disabled={!dirty}
          onClick={() => onDiscard(itemId)}
        >
          Discard
        </Button>
        {dirty && <DraftChip label="unapplied edits" />}
      </div>
      {/* R-011 — per-item on-air position; keyed so item switches re-seed. */}
      <PositionPicker key={`pos-${itemId}`} item={item} />
      <div
        style={{
          marginTop: '0.5rem',
          borderTop: `1px solid ${colors.border}`,
          paddingTop: '0.5rem',
        }}
      >
        <h2 style={styles.heading}>FIELDS</h2>
        {rows.length === 0 ? (
          <p style={styles.empty}>No fields.</p>
        ) : (
          rows.map((row) => (
            // Key by item+field so switching stack items remounts the controls
            // (each re-seeds from the new item's draft-or-applied value) — no
            // uncontrolled DOM node is ever reused across items.
            <FieldEditor
              key={`${itemId}-${row.key}`}
              field={row.field}
              fieldId={row.key}
              itemId={itemId}
              applied={row.value}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function FieldEditor({
  field,
  fieldId,
  itemId,
  applied,
}: {
  field: DynamicField | null;
  fieldId: string;
  itemId: string;
  applied: FieldValue | undefined;
}): JSX.Element {
  const label = field?.label ?? fieldId;
  const value = effectiveValue(itemId, fieldId, applied);
  const kind = field?.type ?? inferKind(value);
  const dirty = isFieldDirty(itemId, fieldId, applied);
  const stage = (next: FieldValue): void => stageField(itemId, fieldId, next);
  return (
    <div style={styles.fieldRow}>
      <span style={styles.fieldLabel}>
        {label}
        {dirty && (
          <span className="cg-dirty-dot" aria-label={`${fieldId} has unapplied edits`}>
            ●
          </span>
        )}
      </span>
      <FieldControl
        kind={kind}
        field={field}
        value={value}
        fieldId={fieldId}
        dirty={dirty}
        onStage={stage}
      />
    </div>
  );
}

function FieldControl({
  kind,
  field,
  value,
  fieldId,
  dirty,
  onStage,
}: {
  kind: DynamicField['type'] | 'unknown';
  field: DynamicField | null;
  value: FieldValue | undefined;
  fieldId: string;
  dirty: boolean;
  onStage: (next: FieldValue) => void;
}): JSX.Element {
  if (kind === 'boolean') {
    const v = typeof value === 'boolean' ? value : false;
    return (
      <input
        type="checkbox"
        checked={v}
        onChange={(e) => onStage(e.target.checked)}
        aria-label={fieldId}
      />
    );
  }
  if (kind === 'number') {
    return (
      <NumberField field={field} value={value} fieldId={fieldId} dirty={dirty} onStage={onStage} />
    );
  }
  if (kind === 'color') {
    const v = typeof value === 'string' ? value : '#FFFFFF';
    return (
      <input
        type="color"
        value={v}
        onChange={(e) => onStage(e.target.value)}
        aria-label={fieldId}
      />
    );
  }
  if (kind === 'select' && field?.type === 'select') {
    const v = typeof value === 'string' ? value : field.default;
    return (
      <select
        className={fieldClass(dirty)}
        value={v}
        onChange={(e) => onStage(e.target.value)}
        aria-label={fieldId}
      >
        {field.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
  if (kind === 'image') {
    // Image fields ship as { assetId }; kept as a plain text field on the
    // assetId (the asset library picker lands later).
    const v =
      typeof value === 'object' && value !== null && 'assetId' in value
        ? String((value as { assetId: string }).assetId)
        : '';
    return (
      <input
        className={fieldClass(dirty)}
        type="text"
        value={v}
        placeholder="asset id"
        onChange={(e) => onStage({ assetId: e.target.value })}
        aria-label={fieldId}
      />
    );
  }
  if (kind === 'multiline') {
    const v = typeof value === 'string' ? value : '';
    return (
      <textarea
        className={fieldClass(dirty)}
        style={{ minHeight: 60 }}
        value={v}
        onChange={(e) => onStage(e.target.value)}
        aria-label={fieldId}
      />
    );
  }
  if (kind === 'list') {
    // R-003 — the structured list editor stages its ops (no remount key).
    return <ListFieldEditor fieldId={fieldId} value={value} onStage={onStage} />;
  }
  // Default: text input (controlled — stages on change, no blur/Enter commit).
  const v = typeof value === 'string' ? value : value === undefined ? '' : String(value);
  return (
    <input
      className={fieldClass(dirty)}
      type="text"
      value={v}
      onChange={(e) => onStage(e.target.value)}
      aria-label={fieldId}
    />
  );
}

/**
 * A number field that STAGES on change while preserving in-progress text. It is
 * controlled by a local raw string (so "-", "1.", and "" survive) and NEVER
 * remounts on a keystroke — the text re-seeds only when the effective value
 * changes from OUTSIDE our own edits (a push, Discard, apply, or item switch),
 * via the standard "adjust state during render" pattern. This is the fix for
 * the review finding that the old frozen-key trick dropped focus on the first
 * digit and could diverge across same-id fields.
 */
function NumberField({
  field,
  value,
  fieldId,
  dirty,
  onStage,
}: {
  field: DynamicField | null;
  value: FieldValue | undefined;
  fieldId: string;
  dirty: boolean;
  onStage: (next: FieldValue) => void;
}): JSX.Element {
  const external = typeof value === 'number' ? String(value) : '';
  const [text, setText] = useState(external);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    // Keep the in-progress text if it already represents the new value; else
    // reseed from outside (push / discard / apply changed the applied value).
    const parsed = Number(text);
    const represents = text.trim() !== '' && Number.isFinite(parsed) && parsed === value;
    if (!represents) setText(external);
  }
  return (
    <input
      className={fieldClass(dirty)}
      type="number"
      value={text}
      step={field?.type === 'number' ? field.step : undefined}
      min={field?.type === 'number' ? field.min : undefined}
      max={field?.type === 'number' ? field.max : undefined}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const n = Number(raw);
        if (raw.trim() !== '' && Number.isFinite(n)) {
          setSeen(n); // our own edit — don't let the resync reseed over it
          onStage(n);
        }
      }}
      aria-label={fieldId}
    />
  );
}

function inferKind(value: FieldValue | undefined): DynamicField['type'] | 'unknown' {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'string') {
    if (/^#[0-9a-f]{3,8}$/i.test(value)) return 'color';
    return 'text';
  }
  if (typeof value === 'object' && value !== null && 'assetId' in value) return 'image';
  return 'unknown';
}
