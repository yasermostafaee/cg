import { Fragment, useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { AuditEntrySchema, type AuditEntry } from '@cg/shared-schema';
import {
  MAX_ACTOR_LENGTH,
  UNATTRIBUTED_ACTOR,
  type FixedLayerBank,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Notice } from '../../ui/Notice.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { auditTimeParts, placeName, shortId, templateName } from './auditFormat.js';

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

/*
  `B-210` / `B-211` — the time column narrowed from an ISO stamp's width to a clock's,
  and the detail column widened to carry a name line over an id line.
*/
const COLUMNS = '84px 110px 110px 1fr 80px';

const styles = {
  filters: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    fontSize: '0.85rem',
  },
  actorInput: { width: 140 },
  /*
    B-141 follow-up — THIS CONSOLE's name, and its caveat, above the table rather than
    tucked in a settings dialog somewhere else. It sits here because this is the only
    surface where `actor` appears at all (the column and the filter below), so the
    limits of the value are read in the same glance as the value itself.
  */
  console: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'baseline',
    flexWrap: 'wrap' as const,
    fontSize: '0.85rem',
    paddingBottom: '0.5rem',
  },
  caveat: {
    color: colors.textMuted,
    fontSize: '0.75rem',
    flex: '1 1 20rem',
    lineHeight: 1.4,
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
    gridTemplateColumns: COLUMNS,
    gap: '0.6rem',
    padding: '0.25rem 0.5rem',
    borderBottom: `1px solid ${colors.border}`,
    alignItems: 'start',
  },
  headerRow: {
    display: 'grid',
    gridTemplateColumns: COLUMNS,
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
  /*
    `B-210` — the DATE, once per day down the list, as a band rather than a column.
    The list is newest-first, so a band sits above the first row of each day. It is
    not a row: it names nothing that happened.
  */
  dateBand: {
    padding: '0.2rem 0.5rem',
    background: colors.panelMuted,
    color: colors.textMuted,
    fontSize: '0.72rem',
    letterSpacing: '0.05em',
    borderBottom: `1px solid ${colors.border}`,
  },
  /** `B-211` — the NAME line: what the operator calls the row and the template. */
  names: { display: 'block' },
  /** …and the ID line beneath it: muted, full id in the title, copy beside each. */
  ids: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.35rem',
    alignItems: 'center',
    color: colors.textMuted,
    fontSize: '0.72rem',
  },
  idCode: { fontFamily: 'monospace' },
  /** `B-209` — the refused line, on its own line so a long URL does not push the ids off. */
  command: {
    display: 'block',
    color: colors.textMuted,
    fontSize: '0.72rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
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
  // Error TEXT on a dark background — the owner's colour, through the theme.
  outcomeFailed: { color: colors.errorText },
  outcomeTimeout: { color: '#fcd34d' },
} as const;

/**
 * AuditPanel — modal showing the tail of the audit NDJSON file
 * (Phase 8 §11 / M8.5). Filters apply server-side via `audit.recent`.
 *
 * No live-tail in v1: the operator clicks "Refresh" to re-fetch.
 * A push channel would add minimal value — audit volume is low and
 * the panel is opened for forensic review, not continuous monitoring.
 *
 * `B-210` / `B-211` — it reads the record in the operator's terms (see
 * `auditFormat.ts`): local time to the second, the date only where it changes,
 * the row's and the template's NAMES first, the ids beneath them — shortened for
 * display, full in the title, and copyable. The names are joined here, against the
 * same registry list and the same declared bank the Layers table reads, so the log
 * cannot call a row something the table does not.
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
  /*
    B-141 follow-up — this console's own name. Browser-local, so it is read from the
    bridge surface once per opening rather than subscribed: another TAB on the same
    console could have changed it, and reopening the panel is when that matters. What
    is actually SENT is re-read at every request, so a stale field here can never make
    the record wrong — only the box.
  */
  const [operatorName, setOperatorNameState] = useState<string>('');
  /*
    `B-211` — the two joins a name needs, fetched with every refresh. A template
    deleted since the entry was written simply has no name any more, and the row
    falls back to its id — which is the honest reading, and why the id is never
    dropped.
  */
  const [templates, setTemplates] = useState<ReadonlyMap<string, TemplateInfo>>(new Map());
  const [bank, setBank] = useState<FixedLayerBank | null>(null);

  async function refresh(): Promise<void> {
    const req: { limit: number; action?: AuditEntry['action']; actor?: string } = { limit: 200 };
    if (actionFilter !== 'all') req.action = actionFilter;
    const trimmedActor = actorFilter.trim();
    if (trimmedActor !== '') req.actor = trimmedActor;
    // Both, together, every time: a health reading from before the entries were
    // fetched could report a writer that has failed since, and the operator would
    // read a failing instrument's silence as quiet.
    const [next, nextHealth, list, nextBank] = await Promise.all([
      window.cg.audit.recent(req),
      window.cg.audit.health(),
      window.cg.templates.list(),
      window.cg.fixedLayers.config(),
    ]);
    setEntries(next);
    setHealth(nextHealth);
    setTemplates(new Map(list.map((t) => [t.templateId, t])));
    setBank(nextBank);
  }

  useEffect(() => {
    if (!open) return;
    setOperatorNameState(window.cg.audit.operatorName());
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
      {/*
        ⭐ THE HONESTY HALF, ON THE SURFACE — not only in the design doc.

        The value below is SELF-DECLARED and UNVERIFIED: the control socket is
        unauthenticated loopback, so the record answers "which console, as labelled"
        and never "which person, proven". Anyone can type anything, and a shared
        console carries the last name typed straight through a shift change.

        Saying that only in a design note is the exact failure `assumed` already made
        (B-143): the system knows the limits of what it knows, and the operator — the
        one who acts on it — is the one not told. So it is written where the log is
        read, in the operator's words, beside the column it qualifies.

        `B-211` did not touch this sentence, deliberately: naming the ROW and the
        TEMPLATE better must not read as naming the PERSON better.
      */}
      <div style={styles.console}>
        <label htmlFor="audit-operator">This console</label>
        <input
          id="audit-operator"
          className="cg-field"
          style={styles.actorInput}
          placeholder="unattributed"
          maxLength={MAX_ACTOR_LENGTH}
          value={operatorName}
          onChange={(e) => {
            setOperatorNameState(e.target.value);
            window.cg.audit.setOperatorName(e.target.value);
          }}
        />
        <span style={styles.caveat}>
          Recorded as the <strong>actor</strong> of everything done from this console. It is a LABEL
          you typed, not a verified sign-in — it says which console, not which person, and it does
          not change when somebody else takes the chair. Left empty, actions record{' '}
          <strong>{UNATTRIBUTED_ACTOR}</strong>.
        </span>
      </div>
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
          {/* `B-210` — local wall-clock time; the record's UTC stamp is the cell's title. */}
          <span title="This console's local time, to the second. Hover a time for the record's own UTC stamp.">
            time
          </span>
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
          entries.map((e, idx) => {
            /*
              `B-210` — the date band, where the LOCAL date changes down the list.
              Computed from the same parts the row renders, so the band and the row can
              never disagree about which day a 01:00 entry belongs to.
            */
            const parts = auditTimeParts(e.ts);
            const previous = idx > 0 ? auditTimeParts(entries[idx - 1]?.ts ?? '').date : null;
            return (
              <Fragment key={idx}>
                {parts.date !== '' && parts.date !== previous ? (
                  <div style={styles.dateBand} data-audit-date={parts.date} role="presentation">
                    {parts.date}
                  </div>
                ) : null}
                <Row entry={e} time={parts} templates={templates} bank={bank} />
              </Fragment>
            );
          })
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

function Row({
  entry,
  time,
  templates,
  bank,
}: {
  entry: AuditEntry;
  time: ReturnType<typeof auditTimeParts>;
  templates: ReadonlyMap<string, TemplateInfo>;
  bank: FixedLayerBank | null;
}): JSX.Element {
  const outcomeStyle =
    entry.outcome === 'ok'
      ? styles.outcomeOk
      : entry.outcome === 'timeout'
        ? styles.outcomeTimeout
        : styles.outcomeFailed;
  /*
    `B-211` — NAME PRIMARY, ID SECONDARY. The place (the row, or the layer with the
    fact that it is not a row) and the template, in the operator's words; then the
    ids beneath, shortened for the eye and complete in the title and on the copy.
    An entry with nothing to name (an import, a lock) shows only what it has.
  */
  const place = placeName(entry.slot, bank);
  const template = templateName(entry.templateId, templates);
  const names = [place, template].filter((n): n is string => n !== null);
  return (
    <div style={styles.row} data-audit-row="">
      {/* `B-210` — the clock the operator is looking at; the UTC stamp on hover. */}
      <span title={`Recorded as ${time.utc} (UTC)`} data-audit-time={time.utc}>
        {time.time}
      </span>
      <span>{entry.actor}</span>
      <span>{entry.action}</span>
      <span>
        {names.length > 0 ? (
          <span style={styles.names} data-audit-names="">
            {names.join(' · ')}
          </span>
        ) : null}
        <span style={styles.ids}>
          {entry.itemId !== undefined ? <IdChip kind="item" id={entry.itemId} /> : null}
          {entry.templateId !== undefined ? <IdChip kind="template" id={entry.templateId} /> : null}
          {entry.errorCode !== undefined ? (
            <span data-audit-error-code="">{entry.errorCode}</span>
          ) : null}
        </span>
        {/* `B-209` — the line CasparCG refused, beside the code it refused it with. */}
        {entry.command !== undefined ? (
          <span style={styles.command} data-audit-command="" title={entry.command}>
            {entry.command}
          </span>
        ) : null}
      </span>
      <span style={outcomeStyle}>{entry.outcome}</span>
    </div>
  );
}

/**
 * `B-211` — one id: shortened in the text, complete in the title, and a copy button
 * beside it. The copy confirms LOCALLY (the icon flips to a check for a moment)
 * rather than through the command toast, which renders UNDER a modal's backdrop and
 * would never be seen (the A9 lesson).
 */
function IdChip({ kind, id }: { kind: 'item' | 'template'; id: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <span data-audit-id={kind} data-audit-full-id={id}>
      <code style={styles.idCode} title={id}>
        {shortId(id)}
      </code>{' '}
      <Button
        variant="neutral"
        aria-label={`Copy ${kind} id`}
        title={`Copy ${id}`}
        onClick={() => {
          const clipboard = navigator.clipboard;
          if (clipboard === undefined) return;
          void clipboard.writeText(id).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        <Icon icon={copied ? Check : Copy} size={12} />
      </Button>
    </span>
  );
}
