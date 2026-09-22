import { Fragment, useEffect, useState } from 'react';
import { Check, Copy, RefreshCw, ScrollText, Search } from 'lucide-react';
import { AuditEntrySchema, type AuditEntry } from '@cg/shared-schema';
import { type FixedLayerBank, type TemplateInfo } from '@cg/shared-ipc';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Notice } from '../../ui/Notice.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { OperatorNames } from '../../ui/OperatorNames.js';
import { auditTimeParts, placeName, shortId, templateName, timingClause } from './auditFormat.js';

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

/**
 * `MODAL-TRUTH-01` §3.3 — what the dialog says when the record could not be read at all.
 *
 * A plain statement of what happened, spelled ONCE: the body renders it and the Refresh
 * button reports it, and a second copy is how the two come to say different things. It
 * carries no advice — the console is not the place to teach how to start a bridge.
 */
const READ_FAILED_TEXT = 'The audit record could not be read — the bridge did not answer.';

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
 *
 * ⚠ `OPERATOR-NAME-SWEEP-01` — that sentence is now LITERALLY TRUE on a station running
 * `auth: 'off'`: with the self-declared label retired and no Playout to sign in to, every row
 * records `unattributed`. It is the honest answer rather than a regression — the label it
 * replaced was a claim nobody checked — and the remedy is federating identity, not typing a
 * name. Said here because the next reader will otherwise take this line for a promise the
 * panel no longer keeps.
 */
export function AuditPanel({ open, onClose }: Props): JSX.Element | null {
  const [entries, setEntries] = useState<readonly AuditEntry[]>([]);
  /*
    🔴 `MODAL-TRUTH-01` §3.2/§3.3 — **HAS THE READ ANSWERED, ON ITS OWN AXIS.**

    Not derived from `health`, and not from `entries.length`. `health` answers a different
    question — is the WRITER live — and reading one channel's silence as the other's answer
    is `B-101` in miniature; `entries.length` cannot tell an empty record from a read that
    never happened, which is the whole of `B-141` one layer down. So the fetch's own
    condition is stored as the fetch's own value.

    `reading` only ever describes the FIRST read: a later refresh keeps the count on screen
    while it runs rather than blanking it on every filter keystroke.
  */
  const [read, setRead] = useState<
    { kind: 'reading' } | { kind: 'ready' } | { kind: 'failed'; detail: string }
  >({ kind: 'reading' });
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
  /*
    `B-211` — the two joins a name needs, fetched with every refresh. A template
    deleted since the entry was written simply has no name any more, and the row
    falls back to its id — which is the honest reading, and why the id is never
    dropped.
  */
  const [templates, setTemplates] = useState<ReadonlyMap<string, TemplateInfo>>(new Map());
  const [bank, setBank] = useState<FixedLayerBank | null>(null);

  async function refresh(): Promise<{ accepted: boolean; message?: string }> {
    const req: { limit: number; action?: AuditEntry['action']; actor?: string } = { limit: 200 };
    if (actionFilter !== 'all') req.action = actionFilter;
    const trimmedActor = actorFilter.trim();
    if (trimmedActor !== '') req.actor = trimmedActor;
    try {
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
      setRead({ kind: 'ready' });
      return { accepted: true };
    } catch (err) {
      /*
        🔴 `MODAL-TRUTH-01` §3.3 — **A READ THAT CANNOT HAPPEN SAYS SO.**

        This used to be uncaught: `void refresh()` below left an unhandled rejection and
        `health` stayed `null`, so the dialog sat on `Reading the audit record…` for as
        long as it was open. Measured with a bridge that refuses the connection — that
        sentence, forever, beside a footer claiming `0 of 0 events`. Silence where an
        error belongs is the same defect as the counter beside it: the surface reporting a
        state that is not the one it is in.

        What FAILED is kept separate from what the record SAYS. `health` and `entries` are
        deliberately left alone — a refresh that fails after a good read has not unmade the
        rows already on screen, and blanking them would replace one wrong statement with
        another.
      */
      setRead({ kind: 'failed', detail: err instanceof Error ? err.message : String(err) });
      return { accepted: false, message: READ_FAILED_TEXT };
    }
  }

  useEffect(() => {
    if (!open) return;
    void refresh();
    // `refresh` is intentionally not in deps — recreating it on every
    // render would cause an infinite re-fetch loop. Filter state IS in
    // deps so changing a filter triggers exactly one refetch.
  }, [open, actionFilter, actorFilter]);

  /*
    `MODAL-TRUTH-01` — a CLOSED panel forgets what it read, so the next opening starts from
    `Reading…` rather than showing the previous session's rows under a fresh count, or a
    failure the operator has since walked away from. Same rule as Station setup's
    close-discard, one dialog along.
  */
  useEffect(() => {
    if (open) return;
    setEntries([]);
    setHealth(null);
    setRead({ kind: 'reading' });
  }, [open]);

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
      // `R3` — the timing clause is ON the row, and this file's rule is that a hit is
      // something VISIBLE. Searching "until stop" has to find the rows that say it.
      timingClause(e.timing),
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
      /* `REPAIR-03` B, audit row 113 — the reference draws a 42 px emblem in this head. */
      emblem={ScrollText}
      /* The reference's own line under its title. */
      subtitle="Station actions and their recorded outcomes."
      ariaLabel="Audit log"
      size="ledger"
      /*
        🔴 `MODAL-TRUTH-01` §3.1 — **THE EXISTING FOOTER RULE, APPLIED THROUGH ITS OWN DOOR.**

        `PLATES-AUDIO-11` DELTA §2 wrote the rule and the diagnosis in `Modal.tsx`'s
        `styles.bodyFlush`: _"A declared height alone does not put the footer at the bottom.
        `styles.body` is `overflowY: auto` with `minHeight: 0` but no `flex`, so with fewer
        rows than the frame holds it is CONTENT-sized: the footer floats up under the last
        row and the frame's lower third is dead space."_ That is this dialog, exactly, and
        the owner photographed it: `0 of 0 events` under a two-line body, with a large dead
        region beneath it inside a shell still holding its full declared height.

        It never got the rule because that note ALSO scoped it — _"Applied only where a
        caller opted in with `frame="fixed"`, NOT to every framed size. `library` and
        `ledger` keep exactly the layout `MODAL-CHROME-10` §4 measured"_ — on the ground
        that re-tuning two signed-off surfaces to fix a third would be worse. So this is
        the OPT-IN being taken, not a second mechanism and not a new rule: `frame` is
        documented there as "a DOOR, not a second mechanism", it resolves to the same
        `bodyFlush` and the same `--r-modal-h-frame`, and the template picker is untouched.

        ⚠ It changes NOTHING about the outer box: `ledger` is already in `framed`, so the
        height and the clamp are the ones `modal-frame-chrome.spec.ts` §4 holds. What moves
        is where the footer sits INSIDE it.

        ⚠ And `MODAL-CHROME-10` §4's own warning still holds — a short list must not STRETCH
        to fill the frame. It does not: the body takes the slack as a scroll region, so two
        rows stay two rows with empty space under them, and the band is pinned to the edge.
      */
      frame="fixed"
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
            {/*
              🔴 `MODAL-TRUTH-01` §3.2 — **THE COUNTER DOES NOT CLAIM A NUMBER BEFORE THE
              READ SETTLES.**

              The owner photographed `Reading the audit record…` in the body and
              `0 of 0 events` in the footer, at the same moment. The BODY was the truthful
              one — `health === null` genuinely means "not asked yet" — and the counter was
              the stale half: it rendered `entries.length` unconditionally, and `entries`
              starts as `[]`, so every read was preceded by a footer asserting a total of
              the record it had not opened. Measured with a bridge that never answers: that
              pair on screen indefinitely.

              So the count is rendered only for a read that has ANSWERED. The other two
              conditions get a label each — state facts, three words at most, in the place
              the count would be, because a footer that empties reads as a missing element.
            */}
            {read.kind === 'ready' ? (
              <span data-audit-count={String(shown.length)}>
                {String(shown.length)} of {String(entries.length)} events
              </span>
            ) : (
              /*
                ⚠ `data-audit-count` is ABSENT here, not empty. It is the selector four
                specs and `library-audit-geometry.spec.ts` use to read the count, and an
                attribute that is present while no count is being claimed would let every
                one of them assert against a label — which is the defect wearing a test.
                `data-audit-read` is the separate handle for the separate condition.
              */
              <span data-audit-read={read.kind}>
                {read.kind === 'reading' ? 'Reading…' : 'Not read'}
              </span>
            )}
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
        {/*
          `MODAL-TRUTH-01` §3.3 — a Refresh that could not read reports NOT ACCEPTED. It
          used to map every settlement to `{ accepted: true }`, so a refresh against a dead
          bridge flashed success — the button agreeing with the body's silence.
        */}
        <AsyncButton variant="neutral" icon={RefreshCw} run={() => refresh()}>
          Refresh
        </AsyncButton>
      </div>
      {/*
        🔴 `OPERATOR-NAME-SWEEP-01` — **THE CONSOLE-NAME FIELD AND ITS CAVEAT ARE GONE.**

        What stood here was a text box labelled "This console" and, beside it, a sentence
        warning that the recorded actor was merely a label somebody had typed rather than a
        proven sign-in. Both were CORRECT when they shipped (`B-141`): the control socket was
        unauthenticated loopback, the value was self-declared, and saying so on the surface was
        the honest half that `B-143` had taught us not to leave in a design note.

        ⚠ The old wording is deliberately NOT quoted here. `operatorNameRetired.test.ts` asserts
        those clauses appear NOWHERE in source — comments included — because an exception list
        for "a comment may quote it" is a list whose first entry is how the sentence returns.
        The archived `audit-actor-console-name` change keeps the exact words, where history
        belongs.

        They are gone because the premise is gone. `C-037` verifies a Playout-issued token and
        `C-038` gates every route on it, so the rows below carry a name that came out of a
        signature check, with the operator's `sub` beside it. A sentence dismissing that as
        something somebody typed is not a caution any more — it is **false, displayed directly
        above the evidence that contradicts it**, and it tells the operator the record is
        weaker than it is. Under auth OFF the console now sends no `actor` at all and the bridge records
        `unattributed`, which is the state the system is actually in.

        ⚠ **The identity is stated elsewhere, not nowhere.** `IdentityIndicator` in the status
        bar names who is signed in, once, on the axis that measures it — this panel shows the
        RECORD, and the record now speaks for itself.
      */}
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
            title="The signed-in operator, as the bridge verified them. Rows written with no principal record 'unattributed'."
          >
            Actor
          </span>
          <span>Action</span>
          <span>Item / detail</span>
          <span>Outcome</span>
        </div>
        {shown.length === 0 ? (
          <EmptyState health={health} filtered={filtered} read={read} />
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
  read,
}: {
  health: AuditHealth | null;
  filtered: boolean;
  read: { kind: 'reading' } | { kind: 'ready' } | { kind: 'failed'; detail: string };
}): JSX.Element {
  /*
    🔴 `MODAL-TRUTH-01` §3.3 — THE FAILED READ IS ANSWERED BEFORE ANYTHING ELSE, and it is
    answered from the READ's own state rather than from `health`.

    `health` is `null` both when the read has not happened yet and when it could not happen,
    and this branch used to be the only reader of that: a bridge that never answered left
    `Reading the audit record…` on screen for as long as the dialog was open. Three empty
    states were already told apart here for exactly this reason (`B-141`); this is the
    fourth, and it is the one that is not empty at all — nothing was read.

    It is a `refusal` Notice with `aria="status"`, like the two faults below: the amber
    attention treatment, not the neutral remark that would dress an unreadable record as
    an ordinary observation. The bridge's own words go in the detail; the sentence above
    them states what happened and offers no advice.
  */
  if (read.kind === 'failed') {
    return (
      <div className="cg-audit-fault">
        <Notice noticeRole="refusal" aria="status" text={READ_FAILED_TEXT} detail={read.detail} />
      </div>
    );
  }
  // Not asked yet — say nothing rather than guess. The read is one round trip away.
  if (read.kind === 'reading' || health === null)
    return <p className="cg-audit-empty">Reading the audit record…</p>;
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
  // `R3` — the VALUE a `set-pass-timing` row carried, worded once and read twice below.
  const timing = timingClause(entry.timing);
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
        {/*
          `R3` — WHAT was set, for a `set-pass-timing` row. One clause, no prose: it is a
          VALUE, which is one of the four things an operator surface may state. It sits with
          the ids rather than with the names because it is neither a place nor a template —
          and it stays LTR chrome like the coordinate above it, since it is digits and English.
        */}
        {timing !== null ? (
          <span className="cg-audit-timing" data-audit-timing="">
            {timing}
          </span>
        ) : null}
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
