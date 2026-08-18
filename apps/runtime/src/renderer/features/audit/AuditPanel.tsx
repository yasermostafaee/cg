import { useEffect, useState } from 'react';
import { AuditEntrySchema, type AuditEntry } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Notice } from '../../ui/Notice.js';
import { Modal, ModalAction } from '../../ui/Modal.js';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * B-141 — the filter options are DERIVED from the one schema action set, never
 * hand-kept.
 *
 * They used to be a literal of eleven, and it had silently drifted: the schema
 * enumerates FIFTEEN, so `stop`, `next`, `update-deferred` and `update-installed`
 * could never be isolated by the filter even once they were written. One rule,
 * two spellings, with nothing catching the disagreement — and the schema is the
 * one that is right, because it is what the entries are parsed against.
 *
 * Deriving it means a new action becomes filterable the moment it becomes
 * writable, which is the only way the two can stay in step.
 */
const ACTION_OPTIONS = ['all', ...AuditEntrySchema.shape.action.options] as const;

type ActionFilter = (typeof ACTION_OPTIONS)[number];

/** B-141 — the bridge's own answer to "is this instrument live?" (`audit.health`). */
type AuditHealth = Awaited<ReturnType<typeof window.cg.audit.health>>;

const styles = {
  filters: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    fontSize: '0.85rem',
  },
  actorInput: { width: 140 },
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
  /*
    B-141 — the two empty states that are NOT "quiet" are rendered through the
    shared `Notice`, so this carries only the box they sit in. A local colour
    treatment here is exactly what `Notice`'s header forbids: an exported style
    object is copied, a component is consumed.
  */
  emptyFault: {
    padding: '0.75rem',
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
  /*
    B-141 — THE POSITIVE CONTROL, fetched beside the tail and never inferred from
    it. `null` means "not asked yet", which is itself distinct from every answer:
    an empty list before the health read has landed says nothing at all, so the
    panel says nothing at all.
  */
  const [health, setHealth] = useState<AuditHealth | null>(null);
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [actorFilter, setActorFilter] = useState<string>('');

  async function refresh(): Promise<void> {
    const req: { limit: number; action?: AuditEntry['action']; actor?: string } = { limit: 200 };
    if (actionFilter !== 'all') req.action = actionFilter;
    const trimmedActor = actorFilter.trim();
    if (trimmedActor !== '') req.actor = trimmedActor;
    // Both, together, every time: a health reading from before the entries were
    // fetched could report a writer that has failed since, and the operator would
    // read a failing instrument's silence as quiet.
    const [next, nextHealth] = await Promise.all([
      window.cg.audit.recent(req),
      window.cg.audit.health(),
    ]);
    setEntries(next);
    setHealth(nextHealth);
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
    <Modal
      /* §1 — SENTENCE case, like every other dialog. It was `AUDIT LOG`; the words
         are unchanged. */
      title="Audit log"
      ariaLabel="Audit log"
      size="wide"
      onClose={onClose}
      /*
        ONE action, and its role is `cancel` — not `primary` (owner).

        `Close` DISMISSES; it commits nothing. This dialog is read-only, so it has no
        primary action at all, and dressing a dismissal as one would put the weight
        of "the action this dialog exists to perform" on a button that does nothing.
        Same treatment as every other Cancel, which is the point: the operator learns
        one shape for "get me out of here".

        The hand-rolled header's `Close` BUTTON is still gone — the primitive's ✕ is
        the close affordance here as it is everywhere else.
      */
      footer={
        <ModalAction actionRole="cancel" onClick={onClose}>
          Close
        </ModalAction>
      }
    >
      <div style={styles.filters}>
        <label htmlFor="audit-action">Action</label>
        <select
          id="audit-action"
          className="cg-field"
          style={{ width: 'auto' }}
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
          className="cg-field"
          style={styles.actorInput}
          placeholder="any"
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
        />
        <AsyncButton run={() => refresh().then(() => ({ accepted: true }))}>Refresh</AsyncButton>
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
          <EmptyState
            health={health}
            filtered={actionFilter !== 'all' || actorFilter.trim() !== ''}
          />
        ) : (
          entries.map((e, idx) => <Row key={idx} entry={e} />)
        )}
      </div>
    </Modal>
  );
}

/**
 * ⭐ **B-141 — THE EMPTY STATE THAT DOES NOT ASSERT A FACT IT CANNOT KNOW.**
 *
 * The panel used to answer every empty read with _"No audit entries yet."_, which
 * cannot distinguish:
 *
 *   - **nothing happened** — a configured, healthy writer with an empty file;
 *   - **nothing is recorded** — a writer that is failing every append;
 *   - **there is no writer** — a build or a boot with no `--audit-log-path`.
 *
 * Three different situations, one sentence, and the two that mean "your record is
 * MISSING" were being reported as the one that means "your station was quiet".
 * This is the repo's own recurring error — a negative observation is not a result
 * until a positive control proves the instrument is live — written into the
 * product, and the operator is the one who acts on it.
 *
 * So the reassuring sentence is now the NARROWEST branch: it appears only when a
 * writer is configured, has failed nothing, and genuinely returned no rows. Every
 * other reading, including "the health probe itself has not answered", says
 * something else.
 */
function EmptyState({
  health,
  filtered,
}: {
  health: AuditHealth | null;
  filtered: boolean;
}): JSX.Element {
  // Not asked yet — say nothing rather than guess. The read is one round trip away.
  if (health === null) return <p style={styles.empty}>Reading the audit record…</p>;
  /*
    `noticeRole="refusal"` is the palette's ATTENTION treatment (amber), which is
    what these two are — not `notice`, which is the neutral statement and would
    dress a missing record as an ordinary remark. `aria="status"` overrides the
    role's `alert` default deliberately: an alert announces the CONSEQUENCE OF
    SOMETHING THE OPERATOR JUST DID, and this is a standing fact about the
    instrument that happens to be read when the dialog opens.
  */
  if (!health.configured) {
    return (
      <div style={styles.emptyFault}>
        <Notice
          noticeRole="refusal"
          aria="status"
          text="No audit record is configured on this bridge, so nothing has been written. This is NOT a quiet session — it is a session with no record."
          detail="Start the bridge with --audit-log-path to record one."
        />
      </div>
    );
  }
  if (health.errorCount > 0) {
    return (
      <div style={styles.emptyFault}>
        <Notice
          noticeRole="refusal"
          aria="status"
          text={`The audit record could not be written (${String(health.errorCount)} ${
            health.errorCount === 1 ? 'failure' : 'failures'
          }), so entries are MISSING rather than absent.`}
          detail={[health.lastError, health.path].filter((d) => d !== null).join(' — ')}
        />
      </div>
    );
  }
  // The one honest use of the reassuring sentence: a live instrument that read
  // nothing. The filtered variant is separate because "no rows match this filter"
  // is also not "nothing happened".
  return (
    <p style={styles.empty}>
      {filtered ? 'No audit entries match this filter.' : 'No audit entries yet.'}
    </p>
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
