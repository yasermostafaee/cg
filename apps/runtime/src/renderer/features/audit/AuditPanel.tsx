import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, RefreshCw, ScrollText, Search } from 'lucide-react';
import { AuditEntrySchema, type AuditEntry } from '@cg/shared-schema';
import {
  auditMatches,
  holdsPermissionClass,
  type AuditCursor,
  type AuditFilter,
  type AuditNaming,
  type FixedLayerBank,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { useVirtualWindow } from '../../ui/useVirtualWindow.js';
import { useAuthSession } from '../../hooks/useAuthSession.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Notice } from '../../ui/Notice.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { OperatorNames } from '../../ui/OperatorNames.js';
import { CommandText, commandForDisplay } from '../sources/producerDisplay.js';
import { currentSourceCatalog } from '../sources/sourceStore.js';
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
 * from the schema's outcome set (`ok · failed · timeout`). ~~Applied HERE, over the fetched
 * tail~~ — 🔴 `CONSOLE-POLISH-01` (`R-083`): applied by CG Bridge with every other filter and the
 * search, before a page is cut (`audit.page`), so a page is a page of matching rows.
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

/** `R-083` — how long the search box is still before CG Bridge is asked. */
const SEARCH_SETTLE_MS = 250;
/** `R-083` — a row's height until it is measured (one line of names over one of ids). */
const ROW_ESTIMATE_PX = 56;
/** `R-083` — the next page is asked for when the rows in view come this close to the last held. */
const NEAR_END_ROWS = 10;
/** `R-083` — how far down a pushed row is looked for before it is added (a page may hold it). */
const LIVE_DUPLICATE_WINDOW = 200;

/** `R-083` — what one row records, as one string: equal for the same row however it arrived. */
function rowIdentity(e: AuditEntry): string {
  return [
    e.ts,
    e.actor,
    e.action,
    e.outcome,
    e.itemId ?? '',
    e.templateId ?? '',
    e.errorCode ?? '',
    e.slot === undefined ? '' : `${String(e.slot.channel)}-${String(e.slot.layer)}`,
  ].join('|');
}

/** `R-083` — the footer's count of the rows held: `1 event`, `12 events`, `100+ events`. */
function eventCount(held: number, more: boolean): string {
  return more ? `${String(held)}+ events` : `${String(held)} ${held === 1 ? 'event' : 'events'}`;
}

/** `R-083` — the channels the station declares, in order, for the Channel filter. */
function channelsOf(bank: readonly FixedLayerBank[] | null): number[] {
  return [...new Set((bank ?? []).map((b) => b.channel))].sort((a, b) => a - b);
}

function sameRow(a: AuditEntry, b: AuditEntry): boolean {
  return rowIdentity(a) === rowIdentity(b);
}

/** A stable key per row: its identity, numbered where two rows record the same thing. */
function rowKeys(entries: readonly AuditEntry[]): string[] {
  const seen = new Map<string, number>();
  return entries.map((e) => {
    const id = rowIdentity(e);
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    return n === 0 ? id : `${id}#${String(n)}`;
  });
}

/** B-141 — the bridge's own answer to "is this instrument live?" (`audit.health`). */
type AuditHealth = Awaited<ReturnType<typeof window.cg.audit.health>>;

/**
 * AuditPanel — modal showing the audit NDJSON record (Phase 8 §11 / M8.5).
 *
 * ~~Filters apply server-side via `audit.recent`. No live-tail in v1: the operator clicks
 * "Refresh" to re-fetch.~~ 🔴 `CONSOLE-POLISH-01` (`R-083`) — the owner's record is long, and a
 * 200-row tail rendered whole is not a Log. It is read from CG Bridge a PAGE at a time
 * (`audit.page`: 100 rows, newest first, the filters, the search and the channel grant applied
 * there, before the page is cut); the next page is asked for as the list nears its end; only the
 * rows in view are in the document (`useVirtualWindow`); and a row recorded while the dialog is open
 * arrives at the top (`audit.appended`), kept only if it passes the same `auditMatches` the bridge
 * pages with. Refresh reads the first page again.
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
 * `auth: 'off'`: with the self-declared label retired and no Playout to sign in to, no row can
 * name a person. `BRIDGE-TRUTH-01` §4 keeps the one distinction that IS knowable — a console's
 * press records `console`, the machine's own act records `unattributed` — and the remedy for the
 * rest is federating identity, not typing a name.
 */
export function AuditPanel({ open, onClose }: Props): JSX.Element | null {
  // `CENTRAL-BRIDGE-01` — who may download CG Bridge's logs (a station admin).
  const auth = useAuthSession();
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
  // `R-083` — the channel a row is about; `0` is every channel.
  const [channelFilter, setChannelFilter] = useState<number>(0);
  const [query, setQuery] = useState<string>('');
  /*
    `R-083` — the search CG Bridge is asked for, settled a moment after the last keystroke: each ask
    may read back through the record, and a keystroke is not a question.
  */
  const [search, setSearch] = useState<string>('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  /** `R-083` — where the next page starts; `null` — nothing older is left. */
  const [next, setNext] = useState<AuditCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
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
  // `MULTI-CHANNEL-01` — every declared bank: an entry is named from its own channel's bank.
  const [bank, setBank] = useState<readonly FixedLayerBank[] | null>(null);

  /*
    🔴 `R-083` — WHAT THE BRIDGE IS ASKED FOR: every filter and the settled search, each only when it
    narrows. One object, so the first page, the next page and a pushed row are all judged by the same
    question.
  */
  const filter = useMemo((): AuditFilter => {
    const f: AuditFilter = {};
    if (actionFilter !== 'all') f.action = actionFilter;
    if (outcomeFilter !== 'all') f.outcome = outcomeFilter;
    const actor = actorFilter.trim();
    if (actor !== '') f.actor = actor;
    if (channelFilter > 0) f.channel = channelFilter;
    if (search !== '') f.search = search;
    return f;
  }, [actionFilter, outcomeFilter, actorFilter, channelFilter, search]);
  // The latest ask: a page answered for an earlier one is dropped, never shown under the new filter.
  const asked = useRef(0);

  async function refresh(): Promise<{ accepted: boolean; message?: string }> {
    asked.current += 1;
    const ask = asked.current;
    try {
      // Both, together, every time: a health reading from before the entries were
      // fetched could report a writer that has failed since, and the operator would
      // read a failing instrument's silence as quiet.
      const [page, nextHealth, list, nextBank] = await Promise.all([
        window.cg.audit.page({ filter }),
        window.cg.audit.health(),
        window.cg.templates.list(),
        window.cg.fixedLayers.banks(),
      ]);
      if (ask !== asked.current) return { accepted: true };
      setEntries(page.entries);
      setNext(page.next);
      // A first page starts at the top: a list left scrolled to where the last one ended shows the
      // middle of the new one.
      if (tableRef.current !== null) tableRef.current.scrollTop = 0;
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
      if (ask !== asked.current) return { accepted: true };
      setRead({ kind: 'failed', detail: err instanceof Error ? err.message : String(err) });
      return { accepted: false, message: READ_FAILED_TEXT };
    }
  }

  useEffect(() => {
    if (!open) return;
    void refresh();
    // `refresh` is intentionally not in deps — recreating it on every
    // render would cause an infinite re-fetch loop. The FILTER is in deps,
    // so a narrowing reads the first page again, once.
  }, [open, filter]);

  /** `R-083` — the page after the rows held; asked once at a time, for the filter in force. */
  const loadMore = useCallback(async (): Promise<void> => {
    if (next === null || loadingMore) return;
    const ask = asked.current;
    setLoadingMore(true);
    try {
      const page = await window.cg.audit.page({ cursor: next, filter });
      if (ask !== asked.current) return;
      setEntries((held) => [...held, ...page.entries]);
      setNext(page.next);
    } catch {
      // The rows held stay true; the next scroll to the end asks again.
    } finally {
      setLoadingMore(false);
    }
  }, [next, loadingMore, filter]);

  /*
    🔴 `R-083` — A ROW RECORDED WHILE THE DIALOG IS OPEN ARRIVES AT THE TOP, if a page would have held
    it: the same `auditMatches` CG Bridge pages with, worded against the names this dialog holds. Read
    through refs so the subscription is made once per opening, not once per keystroke.
  */
  const naming = useMemo(
    (): AuditNaming => ({
      bank,
      templateLabel: (templateId) => templateName(templateId, templates),
    }),
    [bank, templates],
  );
  const live = useRef({ filter, naming });
  live.current = { filter, naming };
  useEffect(() => {
    if (!open) return undefined;
    return window.cg.audit.onAppended((entry) => {
      if (!auditMatches(entry, live.current.filter, live.current.naming)) return;
      setEntries((held) =>
        held.slice(0, LIVE_DUPLICATE_WINDOW).some((e) => sameRow(e, entry))
          ? held
          : [entry, ...held],
      );
    });
  }, [open]);

  /*
    `MODAL-TRUTH-01` — a CLOSED panel forgets what it read, so the next opening starts from
    `Reading…` rather than showing the previous session's rows under a fresh count, or a
    failure the operator has since walked away from. Same rule as Station setup's
    close-discard, one dialog along.
  */
  useEffect(() => {
    if (open) return;
    setEntries([]);
    setNext(null);
    setHealth(null);
    setRead({ kind: 'reading' });
  }, [open]);

  /*
    🔴 `R-083` — ONLY THE ROWS IN VIEW ARE IN THE DOCUMENT. The table is the scroller; each row is
    keyed by what it records (a row pushed to the top keeps its own key and its measured height), and
    the next page is asked for as the window nears the last rows held.
  */
  const tableRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const keys = useMemo(() => rowKeys(entries), [entries]);
  const view = useVirtualWindow({
    active: open,
    scroller: tableRef,
    list: rowsRef,
    keys,
    estimate: ROW_ESTIMATE_PX,
  });
  useEffect(() => {
    if (open && read.kind === 'ready' && view.end >= entries.length - NEAR_END_ROWS) {
      void loadMore();
    }
  }, [open, read.kind, view.end, entries.length, loadMore]);

  if (!open) return null;

  const shown = entries;
  const filtered = Object.keys(filter).length > 0 || query.trim() !== '';
  const resetFilters = (): void => {
    setActionFilter('all');
    setActorFilter('');
    setOutcomeFilter('all');
    setChannelFilter(0);
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
            {/*
              🔴 `R-083` — `N of M events` counted what was shown of a fetched tail; there is no
              tail now, only pages. The count is the rows held, with `+` while older ones are
              left to read — a fact about the list, not a total of the record.
            */}
            {read.kind === 'ready' ? (
              <span data-audit-count={String(shown.length)} data-audit-more={String(next !== null)}>
                {eventCount(shown.length, next !== null)}
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
        {/* `R-083` — the channel a row is about, from the channels this station declares. */}
        {channelsOf(bank).length > 0 && (
          <div className="cg-audit-field">
            <label htmlFor="audit-channel">Channel</label>
            <select
              id="audit-channel"
              className="cg-field"
              value={String(channelFilter)}
              onChange={(e) => setChannelFilter(Number(e.target.value))}
            >
              <option value="0">All channels</option>
              {channelsOf(bank).map((c) => (
                <option key={c} value={String(c)}>
                  CH {String(c)}
                </option>
              ))}
            </select>
          </div>
        )}
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
        {/*
          `CENTRAL-BRIDGE-01` §1 A — CG BRIDGE'S LOGS, DOWNLOADED. They live on the Playout machine
          now, so the folder `FIELD-FIXES-01` G opened became one zip, saved from CG Bridge. A
          station admin's (or anyone's on a station with auth off); absent for everyone else, not
          disabled — and the bridge refuses the ticket to anyone else anyway.
        */}
        {window.cg.audit.canDownloadLogs() &&
          (auth.kind === 'off' ||
            (auth.kind === 'signed-in' &&
              holdsPermissionClass(auth.principal.roles, 'station-admin'))) && (
            <AsyncButton
              variant="neutral"
              icon={Download}
              run={() => window.cg.audit.downloadLogs()}
              data-audit-download-logs=""
            >
              Download logs
            </AsyncButton>
          )}
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
        weaker than it is. Under auth OFF the console sends no `actor` at all, and the bridge
        records `console` — a console did it, nobody proved who — keeping `unattributed` for what
        no console caused (`BRIDGE-TRUTH-01` §4).

        ⚠ **The identity is stated elsewhere, not nowhere.** `IdentityIndicator` in the status
        bar names who is signed in, once, on the axis that measures it — this panel shows the
        RECORD, and the record now speaks for itself.
      */}
      <div className="cg-audit-table" data-audit-table="" ref={tableRef}>
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
            title="The signed-in operator, as the bridge verified them. 'console': a console did it and nobody was signed in. 'unattributed': no console caused it."
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
          /*
            🔴 `R-083` — the rows IN VIEW, between two spacers that keep the space of the rest, so
            the scrollbar stays a true reading of how much is held.
          */
          <div ref={rowsRef} data-audit-rows="" data-audit-held={String(shown.length)}>
            <div aria-hidden="true" style={{ height: view.padTop }} />
            {shown.slice(view.start, view.end).map((e, offset) => {
              const idx = view.start + offset;
              /*
                `B-210` — the date band, where the LOCAL date changes down the list.
                Computed from the same parts the row renders, so the band and the row can
                never disagree about which day a 01:00 entry belongs to. The day before is the
                previous row HELD, not the previous row rendered.
              */
              const parts = auditTimeParts(e.ts);
              const previous = idx > 0 ? auditTimeParts(shown[idx - 1]?.ts ?? '').date : null;
              const key = keys[idx] ?? String(idx);
              return (
                <div key={key} ref={view.measureRef(key)}>
                  {parts.date !== '' && parts.date !== previous ? (
                    <div className="cg-audit-date" data-audit-date={parts.date} role="presentation">
                      {parts.date}
                    </div>
                  ) : null}
                  <Row entry={e} time={parts} templates={templates} bank={bank} />
                </div>
              );
            })}
            <div aria-hidden="true" style={{ height: view.padBottom }} />
          </div>
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
  bank: readonly FixedLayerBank[] | null;
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
      {/*
        `CENTRAL-BRIDGE-01` — and the console MACHINE it came from, on hover: the record names the
        user and the machine; the address is a technical fact, so it rides the title (rule 11).
      */}
      <span
        className="cg-audit-actor"
        data-audit-actor={entry.actor}
        {...(entry.consoleAddress !== undefined && {
          title: `From ${entry.consoleAddress}`,
          'data-audit-console': entry.consoleAddress,
        })}
      >
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
        {/*
          `B-209` — the line CasparCG refused, beside the code it refused it with.
          `PLAYOUT-SOURCES-01` §2.B — its source named as every surface names it, and a stream's
          address never shown (§1.E): not in the line, and not on its hover either.
        */}
        {entry.command !== undefined ? (
          <span
            className="cg-audit-command"
            data-audit-command=""
            title={commandForDisplay(entry.command)}
          >
            <CommandText command={entry.command} catalog={currentSourceCatalog()} />
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
