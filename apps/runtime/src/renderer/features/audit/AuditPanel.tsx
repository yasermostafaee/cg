import { Fragment, useEffect, useState } from 'react';
import { Check, Copy, RefreshCw, Search } from 'lucide-react';
import { AuditEntrySchema, type AuditEntry } from '@cg/shared-schema';
import {
  MAX_ACTOR_LENGTH,
  UNATTRIBUTED_ACTOR,
  type FixedLayerBank,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Notice } from '../../ui/Notice.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { OperatorNames } from '../../ui/OperatorNames.js';
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

/**
 * `RUNTIME-REDESIGN-01` Phase 8 — the reference's `Result` filter, derived the same way
 * from the schema's outcome set (`ok · failed · timeout`). Applied HERE, over the fetched
 * tail, because `audit.recent` filters by action and actor only and this phase adds no
 * request field: the tail is at most 200 rows, and a client-side narrowing of a list the
 * bridge already answered is not a second source of truth.
 */
const OUTCOME_OPTIONS = ['all', ...AuditEntrySchema.shape.outcome.options] as const;

type OutcomeFilter = (typeof OUTCOME_OPTIONS)[number];

/** B-141 — the bridge's own answer to "is this instrument live?" (`audit.health`). */
type AuditHealth = Awaited<ReturnType<typeof window.cg.audit.health>>;

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
 *
 * ── `RUNTIME-REDESIGN-01` PHASE 8 — `03-audit-log.html` AS RENDERED, PLUS THE ACTOR ──
 *
 * The look is the reference's (`AUDIT_LOG_PX`, `design.md` §15.3): a ledger-wide frame, a
 * tools row of search and labelled selects with Refresh, a table whose head is the small
 * muted rank and whose item cell stacks a strong line over small lines, an outcome tag,
 * and a footer count beside Close. Its `View event` aside is NOT adopted — `B-211` put
 * the names, the ids and the refused line ON the row on purpose — nor its per-row date
 * (`B-210`'s band), its `Date` filter, or `Follow new events` (no live tail, above).
 *
 * 🔴 The reference draws NO ACTOR COLUMN, and no caveat beside one. This surface keeps
 * both, and the field that writes the actor — guard item 27 (`design.md` §3), owner
 * answer A1: the picker STAYS, made SMALL, BESIDE the column it qualifies, and never in
 * Station setup. A log that names nobody is the `B-143` failure with the sign flipped.
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
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [query, setQuery] = useState<string>('');
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

  /*
    The client-side half of the filters (see `OUTCOME_OPTIONS`): the outcome select and the
    search, over the tail the bridge answered. The search reads what the ROW SHOWS — the
    names the operator sees, the ids, the actor, the action, the code and the refused line
    — so a hit is something visible, never a field the row keeps to itself.
  */
  const q = query.trim().toLocaleLowerCase();
  const shown = entries.filter((e) => {
    if (outcomeFilter !== 'all' && e.outcome !== outcomeFilter) return false;
    if (q === '') return true;
    const place = placeName(e.slot, bank);
    const template = templateName(e.templateId, templates);
    return [
      place,
      template,
      e.actor,
      e.action,
      e.outcome,
      e.itemId,
      e.templateId,
      e.errorCode,
      e.command,
    ]
      .filter((v): v is string => typeof v === 'string' && v !== '')
      .join(' ')
      .toLocaleLowerCase()
      .includes(q);
  });
  const filtered =
    actionFilter !== 'all' || actorFilter.trim() !== '' || outcomeFilter !== 'all' || q !== '';
  const resetFilters = (): void => {
    setActionFilter('all');
    setActorFilter('');
    setOutcomeFilter('all');
    setQuery('');
  };

  return (
    <Modal
      /* §1 — SENTENCE case, like every other dialog. It was `AUDIT LOG`; the words
         are unchanged. */
      title="Audit log"
      /* The reference's own line under its title. */
      subtitle="Station actions and their recorded outcomes."
      ariaLabel="Audit log"
      size="ledger"
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

        Phase 8 — the reference's footer count sits at the left, with `Reset filters`
        beside it while a filter is narrowing the list.
      */
      footer={
        <>
          <span className="cg-audit-foot-info">
            <span data-audit-count={String(shown.length)}>
              {String(shown.length)} of {String(entries.length)} events
            </span>
            {filtered && (
              <Button variant="ghost" onClick={resetFilters} data-audit-reset="">
                Reset filters
              </Button>
            )}
          </span>
          <ModalAction actionRole="cancel" onClick={onClose}>
            Close
          </ModalAction>
        </>
      }
    >
      <div className="cg-audit-tools">
        <label className="cg-audit-search">
          <Icon icon={Search} size={16} />
          <input
            type="search"
            className="cg-field"
            placeholder="Search events or templates…"
            aria-label="Search events, names, ids and actors"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="cg-audit-field">
          <label htmlFor="audit-action">Action</label>
          <select
            id="audit-action"
            className="cg-field"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as ActionFilter)}
          >
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a === 'all' ? 'All actions' : a}
              </option>
            ))}
          </select>
        </div>
        <div className="cg-audit-field">
          <label htmlFor="audit-result">Result</label>
          <select
            id="audit-result"
            className="cg-field"
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value as OutcomeFilter)}
          >
            {OUTCOME_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o === 'all' ? 'All results' : o}
              </option>
            ))}
          </select>
        </div>
        <div className="cg-audit-field">
          <label htmlFor="audit-actor">Actor</label>
          <input
            id="audit-actor"
            className="cg-field"
            placeholder="any"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
          />
        </div>
        <AsyncButton
          variant="neutral"
          icon={RefreshCw}
          run={() => refresh().then(() => ({ accepted: true }))}
        >
          Refresh
        </AsyncButton>
      </div>
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
        TEMPLATE better must not read as naming the PERSON better. Phase 8 (owner answer
        A1) made the FIELD small and kept the strip directly above the ACTOR column; the
        sentence is byte for byte what it was.
      */}
      <div className="cg-audit-console" data-audit-console="">
        <label htmlFor="audit-operator">This console</label>
        <input
          id="audit-operator"
          className="cg-field"
          placeholder="unattributed"
          maxLength={MAX_ACTOR_LENGTH}
          value={operatorName}
          onChange={(e) => {
            setOperatorNameState(e.target.value);
            window.cg.audit.setOperatorName(e.target.value);
          }}
        />
        <span className="cg-audit-caveat" data-audit-caveat="">
          Recorded as the <strong>actor</strong> of everything done from this console. It is a LABEL
          you typed, not a verified sign-in — it says which console, not which person, and it does
          not change when somebody else takes the chair. Left empty, actions record{' '}
          <strong>{UNATTRIBUTED_ACTOR}</strong>.
        </span>
      </div>
      <div className="cg-audit-table" data-audit-table="">
        <div className="cg-audit-head" data-audit-head="">
          {/* `B-210` — local wall-clock time; the record's UTC stamp is the cell's title. */}
          <span title="This console's local time, to the second. Hover a time for the record's own UTC stamp.">
            Time
          </span>
          {/*
            Guard item 27 — THE ACTOR COLUMN, which the reference does not draw. Its header
            carries the caveat's gist for the moment the strip above has scrolled away.
          */}
          <span
            data-audit-actor-head=""
            title="The console name typed above — a self-declared label, not a verified sign-in."
          >
            Actor
          </span>
          <span>Action</span>
          <span>Item / detail</span>
          <span>Outcome</span>
        </div>
        {shown.length === 0 ? (
          <EmptyState health={health} filtered={filtered} />
        ) : (
          shown.map((e, idx) => {
            /*
              `B-210` — the date band, where the LOCAL date changes down the list.
              Computed from the same parts the row renders, so the band and the row can
              never disagree about which day a 01:00 entry belongs to.
            */
            const parts = auditTimeParts(e.ts);
            const previous = idx > 0 ? auditTimeParts(shown[idx - 1]?.ts ?? '').date : null;
            return (
              <Fragment key={idx}>
                {parts.date !== '' && parts.date !== previous ? (
                  <div className="cg-audit-date" data-audit-date={parts.date} role="presentation">
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
  if (health === null) return <p className="cg-audit-empty">Reading the audit record…</p>;
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
      <div className="cg-audit-fault">
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
      <div className="cg-audit-fault">
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
    <p className="cg-audit-empty">
      {filtered ? 'No audit entries match this filter.' : 'No audit entries yet.'}
    </p>
  );
}

/** The outcome's tag — the alarm WORD's ink for `failed` (2A), caution for `timeout`. */
function outcomeTag(outcome: AuditEntry['outcome']): string {
  if (outcome === 'ok') return 'cg-tag cg-tag--ok';
  if (outcome === 'timeout') return 'cg-tag cg-tag--warn';
  return 'cg-tag cg-tag--error';
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
    <div className="cg-audit-row" data-audit-row="">
      {/* `B-210` — the clock the operator is looking at; the UTC stamp on hover. */}
      <span
        className="cg-audit-time"
        title={`Recorded as ${time.utc} (UTC)`}
        data-audit-time={time.utc}
      >
        {time.time}
      </span>
      {/*
        Guard item 27 — the WHO, in its own isolate (a console name can be Persian beside
        this Latin chrome). Never composed with the names: it is a label somebody typed.
      */}
      <span className="cg-audit-actor" data-audit-actor={entry.actor}>
        <bdi>{entry.actor}</bdi>
      </span>
      <span>{entry.action}</span>
      <span className="cg-audit-item">
        {names.length > 0 ? (
          /*
            `B-232` — EACH NAME IN ITS OWN ISOLATE, not one joined string. This column is
            almost entirely Persian aliases beside Latin template names, which is the
            mixture the bidi algorithm reorders around the neutral separator; the audit
            log had the same defect as the emptied-air notice and for the same reason —
            both compose the same `names` array. See `ui/OperatorNames.tsx`.
          */
          <span className="cg-audit-names" data-audit-names="">
            <OperatorNames name={{ names, layer: null, title: '' }} />
          </span>
        ) : null}
        {/*
          Golden rule 11 ⭐ — the real LAYER NUMBER stays visible where a row is named in
          a log entry: `R-028`'s reason is the moment the console is not helping, and an
          operator clearing a layer by hand needs the coordinate, not the alias. The
          reference's small line carries `CH 1`; this one carries the whole coordinate.
        */}
        {entry.slot !== undefined ? (
          <span
            className="cg-audit-slot"
            data-audit-slot={`${String(entry.slot.channel)}-${String(entry.slot.layer)}`}
          >
            on {String(entry.slot.channel)}-{String(entry.slot.layer)}
          </span>
        ) : null}
        <span className="cg-audit-ids">
          {entry.itemId !== undefined ? <IdChip kind="item" id={entry.itemId} /> : null}
          {entry.templateId !== undefined ? <IdChip kind="template" id={entry.templateId} /> : null}
        </span>
        {/* `B-209` — the line CasparCG refused, beside the code it refused it with. */}
        {entry.command !== undefined ? (
          <span className="cg-audit-command" data-audit-command="" title={entry.command}>
            {entry.command}
          </span>
        ) : null}
      </span>
      <span className="cg-audit-outcome">
        <span className={outcomeTag(entry.outcome)} data-audit-outcome={entry.outcome}>
          {entry.outcome}
        </span>
        {/*
          `B-209` — the CODE under the outcome it explains, as the reference's small reason
          sits under its result tag. It moved here from the ids line; it is still on the row.
        */}
        {entry.errorCode !== undefined ? (
          <span className="cg-audit-reason" data-audit-error-code="">
            {entry.errorCode}
          </span>
        ) : null}
      </span>
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
      <code title={id}>{shortId(id)}</code>{' '}
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
