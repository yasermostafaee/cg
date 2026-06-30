import { useEffect, useState } from 'react';
import type { DynamicField, FieldValue, StackItemState } from '@cg/shared-schema';
import type { TemplateInfo } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { ListFieldEditor } from './ListFieldEditor.js';

interface Props {
  item: StackItemState | null;
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
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: '0.5rem',
    padding: '0.25rem 0',
    fontSize: '0.9rem',
    alignItems: 'center',
  },
  fieldLabel: { color: colors.textMuted, fontWeight: 500 },
  fieldInput: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    padding: '0.25rem 0.5rem',
    borderRadius: '0.2rem',
    fontSize: '0.9rem',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  fieldStatic: { color: colors.text, fontWeight: 500 },
  errorMsg: {
    color: '#fda4af',
    fontSize: '0.78rem',
    marginTop: '0.25rem',
  },
} as const;

/**
 * Inspector pane (Phase 6 §4 / Phase 8 M7.2). Fields are now editable;
 * commit-on-blur dispatches `stack.update` so CasparCG sees a CG INVOKE
 * UPDATE line on the wire.
 *
 * Field metadata is fetched via `templates.get` on selection change. If
 * the registry doesn't know the template (item loaded before the .vcg
 * arrived, or template-only-known-by-id), we fall back to type inference
 * from the current values so the inspector is never empty.
 */
export function Inspector({ item }: Props): JSX.Element {
  const [info, setInfo] = useState<TemplateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
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

  const schema = info?.fields ?? null;
  const valueEntries = Object.entries(item.fields);
  // Fields the operator should see — schema-driven if available, else
  // current values keyed alphabetically.
  const rows: { field: DynamicField | null; key: string; value: FieldValue | undefined }[] =
    schema !== null && schema.length > 0
      ? schema.map((f) => ({ field: f, key: f.id, value: item.fields[f.id] }))
      : valueEntries.map(([key, value]) => ({ field: null, key, value }));

  async function commit(fieldId: string, next: FieldValue): Promise<void> {
    if (item === null) return;
    setError(null);
    try {
      const res = await window.cg.stack.update({
        itemId: item.itemId,
        fields: { [fieldId]: next },
        mergeMode: 'merge',
      });
      if (!res.accepted) setError(`update rejected for ${fieldId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

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
            <FieldEditor
              key={row.key}
              field={row.field}
              fieldId={row.key}
              value={row.value}
              onCommit={(v) => void commit(row.key, v)}
            />
          ))
        )}
        {error !== null && <p style={styles.errorMsg}>{error}</p>}
      </div>
    </aside>
  );
}

function FieldEditor({
  field,
  fieldId,
  value,
  onCommit,
}: {
  field: DynamicField | null;
  fieldId: string;
  value: FieldValue | undefined;
  onCommit: (next: FieldValue) => void;
}): JSX.Element {
  const label = field?.label ?? fieldId;
  const kind = field?.type ?? inferKind(value);
  return (
    <div style={styles.fieldRow}>
      <span style={styles.fieldLabel}>{label}</span>
      <FieldControl kind={kind} field={field} value={value} fieldId={fieldId} onCommit={onCommit} />
    </div>
  );
}

function FieldControl({
  kind,
  field,
  value,
  fieldId,
  onCommit,
}: {
  kind: DynamicField['type'] | 'unknown';
  field: DynamicField | null;
  value: FieldValue | undefined;
  fieldId: string;
  onCommit: (next: FieldValue) => void;
}): JSX.Element {
  if (kind === 'boolean') {
    const v = typeof value === 'boolean' ? value : false;
    return (
      <input
        type="checkbox"
        checked={v}
        onChange={(e) => onCommit(e.target.checked)}
        aria-label={fieldId}
      />
    );
  }
  if (kind === 'number') {
    const v = typeof value === 'number' ? value : 0;
    return (
      <input
        style={styles.fieldInput}
        type="number"
        defaultValue={v}
        step={field?.type === 'number' ? field.step : undefined}
        min={field?.type === 'number' ? field.min : undefined}
        max={field?.type === 'number' ? field.max : undefined}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onCommit(n);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        aria-label={fieldId}
        key={`${fieldId}-${String(v)}`}
      />
    );
  }
  if (kind === 'color') {
    const v = typeof value === 'string' ? value : '#FFFFFF';
    return (
      <input
        type="color"
        value={v}
        onChange={(e) => onCommit(e.target.value)}
        aria-label={fieldId}
      />
    );
  }
  if (kind === 'select' && field?.type === 'select') {
    const v = typeof value === 'string' ? value : field.default;
    return (
      <select
        style={styles.fieldInput}
        value={v}
        onChange={(e) => onCommit(e.target.value)}
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
    // Image fields ship as { assetId }. M7.2 keeps it as a plain text
    // field on the assetId — the asset library picker lands later.
    const v =
      typeof value === 'object' && value !== null && 'assetId' in value
        ? String((value as { assetId: string }).assetId)
        : '';
    return (
      <input
        style={styles.fieldInput}
        type="text"
        defaultValue={v}
        placeholder="asset id"
        onBlur={(e) => onCommit({ assetId: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        aria-label={fieldId}
        key={`${fieldId}-${v}`}
      />
    );
  }
  if (kind === 'multiline') {
    const v = typeof value === 'string' ? value : '';
    return (
      <textarea
        style={{ ...styles.fieldInput, minHeight: 60, resize: 'vertical' }}
        defaultValue={v}
        onBlur={(e) => onCommit(e.target.value)}
        aria-label={fieldId}
        key={`${fieldId}-${v}`}
      />
    );
  }
  if (kind === 'list') {
    // B-040 — a `list` (array) field gets a structured items editor, never the
    // default text input (which would `String()`-coerce the array to
    // "[object Object]"). Keyed by the value signature so selecting a different
    // stack item / an external update re-seeds the editor (mirrors the scalar
    // inputs' `key`). The committed value stays a structured `ListItem[]`.
    return (
      <ListFieldEditor
        key={`${fieldId}-${JSON.stringify(value)}`}
        fieldId={fieldId}
        value={value}
        onCommit={onCommit}
      />
    );
  }
  // Default: text input.
  const v = typeof value === 'string' ? value : value === undefined ? '' : String(value);
  return (
    <input
      style={styles.fieldInput}
      type="text"
      defaultValue={v}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      aria-label={fieldId}
      key={`${fieldId}-${v}`}
    />
  );
}

function inferKind(value: FieldValue | undefined): DynamicField['type'] | 'unknown' {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  // B-040 — an array value is a `list` field; route it to the items editor so it's
  // never rendered (or committed) as a `String()`-coerced "[object Object]".
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'string') {
    if (/^#[0-9a-f]{3,8}$/i.test(value)) return 'color';
    return 'text';
  }
  if (typeof value === 'object' && value !== null && 'assetId' in value) return 'image';
  return 'unknown';
}
