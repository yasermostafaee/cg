import { useEffect, useState } from 'react';
import type { AuditEntry } from '@cg/shared-schema';
import { colors } from '../../theme.js';

interface Props {
  open: boolean;
  onClose: () => void;
}

const ACTION_OPTIONS = [
  'all',
  'load',
  'take',
  'update',
  'out',
  'remove',
  'failover',
  'reconnect',
  'import',
  'export',
  'lock-engage',
  'lock-release',
] as const;

type ActionFilter = (typeof ACTION_OPTIONS)[number];

const styles = {
  scrim: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(2, 6, 23, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 900,
  },
  modal: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.5rem',
    padding: '1rem 1.25rem',
    width: 'min(880px, 90vw)',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
    color: colors.text,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.75rem',
  },
  title: { margin: 0, fontSize: '1rem', fontWeight: 700, letterSpacing: '0.05em' },
  closeButton: {
    background: 'transparent',
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    padding: '0.2rem 0.6rem',
    borderRadius: '0.25rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  filters: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    fontSize: '0.85rem',
  },
  select: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.2rem 0.4rem',
    fontSize: '0.85rem',
  },
  input: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.2rem 0.4rem',
    fontSize: '0.85rem',
    width: 140,
  },
  table: {
    flex: 1,
    overflowY: 'auto' as const,
    fontSize: '0.82rem',
    fontFamily: 'monospace',
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '180px 110px 110px 1fr 80px',
    gap: '0.6rem',
    padding: '0.25rem 0.5rem',
    borderBottom: `1px solid ${colors.border}`,
  },
  headerRow: {
    display: 'grid',
    gridTemplateColumns: '180px 110px 110px 1fr 80px',
    gap: '0.6rem',
    padding: '0.4rem 0.5rem',
    background: colors.panelMuted,
    fontWeight: 700,
    fontSize: '0.72rem',
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
    position: 'sticky' as const,
    top: 0,
  },
  empty: {
    padding: '1rem',
    color: colors.textMuted,
    fontStyle: 'italic' as const,
  },
  outcomeOk: { color: '#86efac' },
  outcomeFailed: { color: '#fda4af' },
  outcomeTimeout: { color: '#fcd34d' },
} as const;

/**
 * AuditPanel — modal showing the tail of the audit NDJSON file
 * (Phase 8 §11 / M8.5). Filters apply server-side via `audit.recent`.
 *
 * No live-tail in v1: the operator clicks "Refresh" to re-fetch.
 * A push channel would add minimal value — audit volume is low and
 * the panel is opened for forensic review, not continuous monitoring.
 */
export function AuditPanel({ open, onClose }: Props): JSX.Element | null {
  const [entries, setEntries] = useState<readonly AuditEntry[]>([]);
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [actorFilter, setActorFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);

  async function refresh(): Promise<void> {
    setLoading(true);
    try {
      const req: { limit: number; action?: AuditEntry['action']; actor?: string } = { limit: 200 };
      if (actionFilter !== 'all') req.action = actionFilter;
      const trimmedActor = actorFilter.trim();
      if (trimmedActor !== '') req.actor = trimmedActor;
      const next = await window.cg.audit.recent(req);
      setEntries(next);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void refresh();
    // `refresh` is intentionally not in deps — recreating it on every
    // render would cause an infinite re-fetch loop. Filter state IS in
    // deps so changing a filter triggers exactly one refetch.
  }, [open, actionFilter, actorFilter]);

  if (!open) return null;

  return (
    <div style={styles.scrim} role="dialog" aria-label="Audit log" aria-modal="true">
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>AUDIT LOG</h2>
          <button style={styles.closeButton} onClick={onClose} aria-label="Close audit panel">
            Close
          </button>
        </div>
        <div style={styles.filters}>
          <label htmlFor="audit-action">Action</label>
          <select
            id="audit-action"
            style={styles.select}
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as ActionFilter)}
          >
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <label htmlFor="audit-actor">Actor</label>
          <input
            id="audit-actor"
            style={styles.input}
            placeholder="any"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
          />
          <button style={styles.closeButton} onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        <div style={styles.table}>
          <div style={styles.headerRow}>
            <span>timestamp</span>
            <span>actor</span>
            <span>action</span>
            <span>item / detail</span>
            <span>outcome</span>
          </div>
          {entries.length === 0 ? (
            <p style={styles.empty}>No audit entries yet.</p>
          ) : (
            entries.map((e, idx) => <Row key={idx} entry={e} />)
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ entry }: { entry: AuditEntry }): JSX.Element {
  const outcomeStyle =
    entry.outcome === 'ok'
      ? styles.outcomeOk
      : entry.outcome === 'timeout'
        ? styles.outcomeTimeout
        : styles.outcomeFailed;
  return (
    <div style={styles.row}>
      <span>{entry.ts}</span>
      <span>{entry.actor}</span>
      <span>{entry.action}</span>
      <span>
        {entry.itemId ?? ''}
        {entry.templateId !== undefined ? ` · ${entry.templateId}` : ''}
        {entry.errorCode !== undefined ? ` · ${entry.errorCode}` : ''}
      </span>
      <span style={outcomeStyle}>{entry.outcome}</span>
    </div>
  );
}
