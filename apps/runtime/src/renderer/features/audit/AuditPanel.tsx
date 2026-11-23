import { useFeedbackText, useLanguages, useUiText } from '../../i18n/locale.js';
import { writeFieldDigits } from '@cg/text-shaping';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  RefreshCw,
  ScrollText,
  Search,
  X,
} from 'lucide-react';
import { AuditEntrySchema, type AuditEntry } from '@cg/shared-schema';
import {
  auditChannelOf,
  auditMatches,
  holdsPermissionClass,
  rebuildDetail,
  type AuditCursor,
  type AuditFilter,
  type AuditNaming,
  type FixedLayerBank,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { useAuthSession } from '../../hooks/useAuthSession.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { AuditDateInput } from './AuditDateInput.js';
import { AUDIT_DIGITS, useAuditCalendar } from './auditCalendarChoice.js';
import { useLunarAdjustDays } from '../calendar/calendarStore.js';
import { Icon } from '../../ui/Icon.js';
import { Notice } from '../../ui/Notice.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { OperatorNames } from '../../ui/OperatorNames.js';
import { SelectInput } from '../../ui/SelectInput.js';
import { TextInput } from '../../ui/TextInput.js';
import { commandForDisplay } from '../sources/producerDisplay.js';
import {
  auditTimeParts,
  placeName,
  templateName,
  timingClause,
  type AuditCalendarFormat,
} from './auditFormat.js';

interface Props {
  open: boolean;
  onClose: () => void;
}

const ACTION_OPTIONS = ['all', ...AuditEntrySchema.shape.action.options] as const;
type ActionFilter = (typeof ACTION_OPTIONS)[number];
const OUTCOME_OPTIONS = ['all', ...AuditEntrySchema.shape.outcome.options] as const;
type OutcomeFilter = (typeof OUTCOME_OPTIONS)[number];

const READ_FAILED_TEXT = 'The audit record could not be read — the bridge did not answer.';
const SEARCH_SETTLE_MS = 250;
const UI_PAGE_SIZE = 25;

type AuditHealth = Awaited<ReturnType<typeof window.cg.audit.health>>;
type ReadState = { kind: 'reading' } | { kind: 'ready' } | { kind: 'failed'; detail: string };

function rowIdentity(entry: AuditEntry): string {
  return [
    entry.ts,
    entry.actor,
    entry.action,
    entry.outcome,
    entry.itemId ?? '',
    entry.templateId ?? '',
    entry.errorCode ?? '',
    entry.slot === undefined ? '' : `${String(entry.slot.channel)}-${String(entry.slot.layer)}`,
  ].join('|');
}

function channelsOf(bank: readonly FixedLayerBank[] | null): number[] {
  return [...new Set((bank ?? []).map((candidate) => candidate.channel))].sort((a, b) => a - b);
}

function dateBound(value: string, end: boolean): string | undefined {
  if (value === '') return undefined;
  const suffix = end ? 'T23:59:59.999' : 'T00:00:00.000';
  const instant = new Date(`${value}${suffix}`);
  return Number.isNaN(instant.getTime()) ? undefined : instant.toISOString();
}

function outcomeLabel(outcome: AuditEntry['outcome']): string {
  if (outcome === 'ok') return 'Succeeded';
  if (outcome === 'timeout') return 'Timed out';
  return 'Failed';
}

function outcomeTag(outcome: AuditEntry['outcome']): string {
  if (outcome === 'ok') return 'cg-tag cg-tag--ok';
  if (outcome === 'timeout') return 'cg-tag cg-tag--warn';
  return 'cg-tag cg-tag--error';
}

export function AuditPanel({ open, onClose }: Props): JSX.Element | null {
  const localizeUi = useUiText();
  const localizeFeedback = useFeedbackText();
  const { interface: locale } = useLanguages();
  const calendar = useAuditCalendar();
  const lunarAdjust = useLunarAdjustDays();
  const format: AuditCalendarFormat = { calendar, lunarAdjust, digits: AUDIT_DIGITS[locale] };
  const number = (value: number): string => writeFieldDigits(String(value), format.digits);
  const auth = useAuthSession();
  const [entries, setEntries] = useState<readonly AuditEntry[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [totalRead, setTotalRead] = useState<ReadState>({ kind: 'reading' });
  const [read, setRead] = useState<ReadState>({ kind: 'reading' });
  const [health, setHealth] = useState<AuditHealth | null>(null);
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [actorFilter, setActorFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [channelFilter, setChannelFilter] = useState(0);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [fromInvalid, setFromInvalid] = useState(false);
  const [toInvalid, setToInvalid] = useState(false);
  const [dateReset, setDateReset] = useState(0);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [next, setNext] = useState<AuditCursor | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [cursors, setCursors] = useState<readonly (AuditCursor | undefined)[]>([undefined]);
  const [busy, setBusy] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [savedLogPath, setSavedLogPath] = useState<string>();
  const [followNew, setFollowNew] = useState(true);
  const [pendingEvents, setPendingEvents] = useState(0);
  const [templates, setTemplates] = useState<ReadonlyMap<string, TemplateInfo>>(new Map());
  const [bank, setBank] = useState<readonly FixedLayerBank[] | null>(null);
  const [channelNames, setChannelNames] = useState<ReadonlyMap<number, string>>(new Map());
  const tableRef = useRef<HTMLDivElement | null>(null);
  const asked = useRef(0);
  const totalAsked = useRef(0);
  const opened = useRef(false);
  const openingFilterKey = useRef<string | null>(null);
  const initialSelectionPending = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const invalidDate = fromInvalid || toInvalid;
  const rangeReversed = fromDate !== '' && toDate !== '' && fromDate > toDate;
  const rangeError = invalidDate || rangeReversed;
  const rangeMessage = invalidDate
    ? 'Enter a valid date in the selected calendar.'
    : 'From must not be after To.';
  const filter = useMemo((): AuditFilter => {
    const value: AuditFilter = {};
    if (actionFilter !== 'all') value.action = actionFilter;
    if (outcomeFilter !== 'all') value.outcome = outcomeFilter;
    if (actorFilter.trim() !== '') value.actor = actorFilter.trim();
    if (channelFilter > 0) value.channel = channelFilter;
    if (search !== '') value.search = search;
    const from = dateBound(fromDate, false);
    const to = dateBound(toDate, true);
    if (from !== undefined) value.from = from;
    if (to !== undefined) value.to = to;
    return value;
  }, [actionFilter, actorFilter, channelFilter, fromDate, outcomeFilter, search, toDate]);
  const filterKey = JSON.stringify(filter);

  const loadTotal = async (): Promise<void> => {
    totalAsked.current += 1;
    const ask = totalAsked.current;
    setTotalRead({ kind: 'reading' });
    try {
      const result = await window.cg.audit.count({ filter });
      if (ask !== totalAsked.current) return;
      setTotal(result.total);
      setTotalRead({ kind: 'ready' });
    } catch (error) {
      if (ask !== totalAsked.current) return;
      setTotal(null);
      setTotalRead({
        kind: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const loadPage = async (
    cursor: AuditCursor | undefined,
    targetPage: number,
    selectFirst = false,
  ): Promise<{ accepted: boolean; message?: string }> => {
    asked.current += 1;
    const ask = asked.current;
    setBusy(true);
    try {
      const [page, nextHealth, list, nextBank, channels] = await Promise.all([
        window.cg.audit.page({
          filter,
          limit: UI_PAGE_SIZE,
          ...(cursor === undefined ? {} : { cursor }),
        }),
        window.cg.audit.health(),
        window.cg.templates.list(),
        window.cg.fixedLayers.banks(),
        window.cg.stationChannels.list(),
      ]);
      if (ask !== asked.current) return { accepted: true };
      setEntries(page.entries);
      setNext(page.next);
      setPageIndex(targetPage);
      setPendingEvents(0);
      setHealth(nextHealth);
      setTemplates(new Map(list.map((template) => [template.templateId, template])));
      setBank(nextBank);
      setChannelNames(
        new Map(
          channels.channels.flatMap((candidate) =>
            candidate.declared && candidate.named !== null
              ? [[candidate.channel, candidate.named.name] as const]
              : [],
          ),
        ),
      );
      setSelectedKey((selected) => {
        if (selected !== null && page.entries.some((entry) => rowIdentity(entry) === selected)) {
          return selected;
        }
        if (!selectFirst) return null;
        const first = page.entries[0];
        return first === undefined ? null : rowIdentity(first);
      });
      setRead({ kind: 'ready' });
      if (tableRef.current !== null) tableRef.current.scrollTop = 0;
      return { accepted: true };
    } catch (error) {
      if (ask !== asked.current) return { accepted: true };
      setRead({ kind: 'failed', detail: error instanceof Error ? error.message : String(error) });
      return { accepted: false, message: localizeFeedback(READ_FAILED_TEXT) };
    } finally {
      if (ask === asked.current) setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (!opened.current) {
      opened.current = true;
      openingFilterKey.current = filterKey;
      initialSelectionPending.current = true;
    } else if (openingFilterKey.current !== filterKey) {
      initialSelectionPending.current = false;
    }
    const selectFirst = initialSelectionPending.current;
    setCursors([undefined]);
    setPageIndex(0);
    setNext(null);
    setSelectedKey(null);
    setPendingEvents(0);
    if (rangeError) {
      asked.current += 1;
      totalAsked.current += 1;
      setEntries([]);
      setTotal(0);
      setTotalRead({ kind: 'ready' });
      setRead({ kind: 'ready' });
      setBusy(false);
      return;
    }
    void loadPage(undefined, 0, selectFirst);
    void loadTotal();
    // `filterKey` is the serialised request; `loadPage` is intentionally not a dependency.
  }, [open, filterKey, rangeError]);

  const downloadLogs = async (): ReturnType<typeof window.cg.audit.downloadLogs> => {
    setSavedLogPath(undefined);
    const result = await window.cg.audit.downloadLogs();
    if (result.accepted) setSavedLogPath(result.savedPath);
    return result;
  };

  const refresh = (): Promise<{ accepted: boolean; message?: string }> => {
    if (rangeError)
      return Promise.resolve({ accepted: false, message: localizeFeedback(rangeMessage) });
    void loadTotal();
    return loadPage(cursors[pageIndex], pageIndex);
  };

  const goNext = (): void => {
    if (next === null || busy) return;
    const target = pageIndex + 1;
    setCursors((held) => [...held.slice(0, target), next]);
    void loadPage(next, target);
  };

  const goPrevious = (): void => {
    if (pageIndex === 0 || busy) return;
    const target = pageIndex - 1;
    void loadPage(cursors[target], target);
  };

  const naming = useMemo(
    (): AuditNaming => ({
      bank,
      templateLabel: (templateId) => templateName(templateId, templates),
    }),
    [bank, templates],
  );
  const live = useRef({ filter, naming, pageIndex, followNew });
  live.current = { filter, naming, pageIndex, followNew };
  const loadFirst = useRef<() => void>(() => undefined);
  loadFirst.current = () => {
    setCursors([undefined]);
    void loadPage(undefined, 0);
  };

  useEffect(() => {
    if (!open) return undefined;
    return window.cg.audit.onAppended((entry) => {
      const state = live.current;
      if (!auditMatches(entry, state.filter, state.naming)) return;
      setTotal((count) => (count === null ? null : count + 1));
      if (state.pageIndex === 0 && state.followNew) loadFirst.current();
      else setPendingEvents((count) => count + 1);
    });
  }, [open]);

  useEffect(() => {
    if (open) return;
    setSavedLogPath(undefined);
    opened.current = false;
    openingFilterKey.current = null;
    initialSelectionPending.current = false;
    asked.current += 1;
    totalAsked.current += 1;
    setEntries([]);
    setTotal(null);
    setTotalRead({ kind: 'reading' });
    setRead({ kind: 'reading' });
    setHealth(null);
    setNext(null);
    setPageIndex(0);
    setCursors([undefined]);
    setSelectedKey(null);
    setPendingEvents(0);
    setChannelNames(new Map());
    setBusy(false);
  }, [open]);

  if (!open) return null;

  const canDownload =
    window.cg.audit.canDownloadLogs() &&
    (auth.kind === 'off' ||
      (auth.kind === 'signed-in' && holdsPermissionClass(auth.principal.roles, 'station-admin')));
  const selected = entries.find((entry) => rowIdentity(entry) === selectedKey) ?? null;
  const filtered = Object.keys(filter).length > 0 || query.trim() !== '' || invalidDate;
  const resetFilters = (): void => {
    setActionFilter('all');
    setActorFilter('');
    setOutcomeFilter('all');
    setChannelFilter(0);
    setFromDate('');
    setToDate('');
    setFromInvalid(false);
    setToInvalid(false);
    setDateReset((revision) => revision + 1);
    setQuery('');
  };

  return (
    <Modal
      title={localizeUi('Audit log')}
      emblem={ScrollText}
      subtitle={localizeUi('Station actions and their recorded outcomes.')}
      ariaLabel={localizeUi('Audit log')}
      size="ledger"
      frame="fixed"
      onClose={onClose}
      footer={
        <div className="cg-audit-footer" data-audit-footer="">
          <span className="cg-audit-foot-info">
            {read.kind === 'ready' ? (
              <span data-audit-count={String(entries.length)}>
                {localizeUi(entries.length === 1 ? '{count} event' : '{count} events', {
                  count: number(entries.length),
                })}
              </span>
            ) : (
              <span data-audit-read={read.kind}>
                {localizeUi(read.kind === 'reading' ? 'Reading…' : 'Not read')}
              </span>
            )}
            {totalRead.kind === 'ready' && total !== null ? (
              <span data-audit-total={String(total)}>
                {localizeUi(total === 1 ? '{count} event total' : '{count} events total', {
                  count: number(total),
                })}
              </span>
            ) : (
              <span data-audit-total-read={totalRead.kind}>
                {localizeUi(totalRead.kind === 'reading' ? 'Counting…' : 'Total unavailable')}
              </span>
            )}
            <label className="cg-audit-follow" htmlFor="cg-audit-follow-new">
              <Checkbox id="cg-audit-follow-new" checked={followNew} onChange={setFollowNew} />
              {localizeUi('Follow new events')}
            </label>
            {pendingEvents > 0 && (
              <Button variant="ghost" data-audit-new-events="" onClick={() => loadFirst.current()}>
                {localizeUi(pendingEvents === 1 ? '{count} new event' : '{count} new events', {
                  count: number(pendingEvents),
                })}
              </Button>
            )}
            {filtered && (
              <Button variant="ghost" onClick={resetFilters} data-audit-reset="">
                {localizeUi('Reset filters')}
              </Button>
            )}
          </span>
          <div className="cg-audit-pagination" aria-label={localizeUi('Audit pages')}>
            <Button
              variant="neutral"
              aria-label={localizeUi('Previous audit page')}
              disabled={pageIndex === 0 || busy}
              onClick={goPrevious}
            >
              <Icon icon={ChevronLeft} flipRtl /> {localizeUi('Previous')}
            </Button>
            <span data-audit-page={String(pageIndex + 1)}>
              {localizeUi('Page {number}', { number: number(pageIndex + 1) })}
            </span>
            <Button
              variant="neutral"
              aria-label={localizeUi('Next audit page')}
              disabled={next === null || busy}
              onClick={goNext}
            >
              {localizeUi('Next')} <Icon icon={ChevronRight} flipRtl />
            </Button>
          </div>
          <ModalAction actionRole="cancel" onClick={onClose} data-audit-close="">
            {localizeUi('Close')}
          </ModalAction>
        </div>
      }
    >
      <div className="cg-audit-tools">
        <label className="cg-audit-search" htmlFor="audit-search">
          <Icon icon={Search} size={16} />
          <TextInput
            id="audit-search"
            type="search"
            placeholder={localizeUi('Search events or templates…')}
            aria-label={localizeUi('Search events, names, ids and actors')}
            autoComplete="off"
            value={query}
            onChange={setQuery}
          />
        </label>
        <FilterSelect
          id="audit-action"
          label={localizeUi('Action')}
          value={actionFilter}
          onChange={(value) => setActionFilter(value as ActionFilter)}
          options={ACTION_OPTIONS.map((value) => ({
            value,
            label: localizeUi(value === 'all' ? 'All actions' : value),
          }))}
        />
        <FilterSelect
          id="audit-result"
          label={localizeUi('Result')}
          value={outcomeFilter}
          onChange={(value) => setOutcomeFilter(value as OutcomeFilter)}
          options={OUTCOME_OPTIONS.map((value) => ({
            value,
            label: localizeUi(value === 'all' ? 'All results' : outcomeLabel(value)),
          }))}
        />
        {channelsOf(bank).length > 0 && (
          <FilterSelect
            id="audit-channel"
            label={localizeUi('Channel')}
            value={String(channelFilter)}
            onChange={(value) => setChannelFilter(Number(value))}
            options={[
              { value: '0', label: localizeUi('All channels') },
              ...channelsOf(bank).map((channel) => ({
                value: String(channel),
                label:
                  channelNames.get(channel) === undefined
                    ? localizeUi('CH {channel}', { channel: number(channel) })
                    : localizeUi('CH {channel} · {name}', {
                        channel: number(channel),
                        name: channelNames.get(channel) ?? '',
                      }),
              })),
            ]}
          />
        )}
        <div className="cg-audit-field">
          <label htmlFor="audit-actor">{localizeUi('Actor')}</label>
          <TextInput
            id="audit-actor"
            placeholder={localizeUi('any')}
            value={actorFilter}
            onChange={setActorFilter}
          />
        </div>
        <div className="cg-audit-field cg-audit-field--date">
          <label htmlFor="audit-from">{localizeUi('From')}</label>
          <AuditDateInput
            key={dateReset}
            id="audit-from"
            label={localizeUi('Audit from date')}
            pickerLabel={localizeUi('Pick a start date')}
            value={fromDate}
            format={format}
            onChange={setFromDate}
            onInvalidChange={setFromInvalid}
            invalid={rangeReversed || fromInvalid}
          />
        </div>
        <div className="cg-audit-field cg-audit-field--date">
          <label htmlFor="audit-to">{localizeUi('To')}</label>
          <AuditDateInput
            key={dateReset}
            id="audit-to"
            label={localizeUi('Audit to date')}
            pickerLabel={localizeUi('Pick an end date')}
            value={toDate}
            format={format}
            onChange={setToDate}
            onInvalidChange={setToInvalid}
            invalid={rangeReversed || toInvalid}
          />
        </div>
        <AsyncButton variant="neutral" icon={RefreshCw} run={refresh}>
          {localizeUi('Refresh')}
        </AsyncButton>
        {canDownload && (
          <AsyncButton
            variant="neutral"
            icon={Download}
            run={downloadLogs}
            data-audit-download-logs=""
          >
            {localizeUi('Download logs')}
          </AsyncButton>
        )}
      </div>
      {canDownload && savedLogPath !== undefined && (
        <Notice
          noticeRole="notice"
          aria="status"
          text={localizeUi('Audit logs saved')}
          detail={savedLogPath}
        />
      )}
      {rangeError && (
        <p className="cg-audit-range-error" role="status" data-audit-range-error="">
          {localizeUi(rangeMessage)}
        </p>
      )}
      <div className="cg-audit-browser" data-audit-details-open={String(selected !== null)}>
        <div className="cg-audit-table" data-audit-table="" ref={tableRef}>
          <div className="cg-audit-head" data-audit-head="">
            <span data-audit-column="channel">{localizeUi('Channel')}</span>
            <span data-audit-column="time">{localizeUi('Time')}</span>
            <span
              data-audit-column="actor"
              data-audit-actor-head=""
              title={localizeUi(
                "The signed-in operator, as the bridge verified them. 'console': a console did it and nobody was signed in. 'unattributed': no console caused it.",
              )}
            >
              {localizeUi('Actor')}
            </span>
            <span data-audit-column="action">{localizeUi('Action')}</span>
            <span data-audit-column="item">{localizeUi('Item')}</span>
            <span data-audit-column="result">{localizeUi('Result')}</span>
          </div>
          {entries.length === 0 ? (
            <EmptyState health={health} filtered={filtered} read={read} rangeError={rangeError} />
          ) : (
            <div data-audit-rows="" data-audit-held={String(entries.length)}>
              {entries.map((entry) => {
                const key = rowIdentity(entry);
                return (
                  <AuditRow
                    key={key}
                    entry={entry}
                    selected={selectedKey === key}
                    templates={templates}
                    bank={bank}
                    channelNames={channelNames}
                    format={format}
                    onSelect={() => setSelectedKey((selected) => (selected === key ? null : key))}
                  />
                );
              })}
            </div>
          )}
        </div>
        {selected !== null && (
          <EventDetails
            entry={selected}
            format={format}
            templates={templates}
            bank={bank}
            onClose={() => setSelectedKey(null)}
          />
        )}
      </div>
    </Modal>
  );
}

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <div className="cg-audit-field">
      <label htmlFor={id}>{label}</label>
      <SelectInput id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectInput>
    </div>
  );
}

function EmptyState({
  health,
  filtered,
  read,
  rangeError,
}: {
  health: AuditHealth | null;
  filtered: boolean;
  read: ReadState;
  rangeError: boolean;
}): JSX.Element {
  const localizeUi = useUiText();
  const { interface: locale } = useLanguages();
  const number = (value: number): string => writeFieldDigits(String(value), AUDIT_DIGITS[locale]);
  if (rangeError)
    return <p className="cg-audit-empty">{localizeUi('Choose a possible date range.')}</p>;
  if (read.kind === 'failed') {
    return (
      <div className="cg-audit-fault">
        <Notice
          noticeRole="refusal"
          aria="status"
          text={localizeUi(READ_FAILED_TEXT)}
          detail={read.detail}
        />
      </div>
    );
  }
  if (read.kind === 'reading' || health === null) {
    return <p className="cg-audit-empty">{localizeUi('Reading the audit record…')}</p>;
  }
  if (!health.configured) {
    return (
      <div className="cg-audit-fault">
        <Notice
          noticeRole="refusal"
          aria="status"
          text={localizeUi('No audit record is configured, so nothing has been written.')}
          detail={localizeUi('Audit recording is unavailable.')}
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
          text={localizeUi(
            health.errorCount === 1
              ? 'Some audit entries may be missing ({count} write failure).'
              : 'Some audit entries may be missing ({count} write failures).',
            { count: number(health.errorCount) },
          )}
          detail={[health.lastError, health.path].filter((detail) => detail !== null).join(' — ')}
        />
      </div>
    );
  }
  return (
    <p className="cg-audit-empty">
      {localizeUi(filtered ? 'No audit entries match this filter.' : 'No audit entries yet.')}
    </p>
  );
}

function AuditRow({
  entry,
  selected,
  templates,
  bank,
  channelNames,
  format,
  onSelect,
}: {
  entry: AuditEntry;
  selected: boolean;
  templates: ReadonlyMap<string, TemplateInfo>;
  bank: readonly FixedLayerBank[] | null;
  channelNames: ReadonlyMap<number, string>;
  format: AuditCalendarFormat;
  onSelect: () => void;
}): JSX.Element {
  const localizeUi = useUiText();
  const time = auditTimeParts(entry.ts, undefined, format);
  const number = (value: number): string => writeFieldDigits(String(value), format.digits);
  const place = placeName(entry.slot, bank);
  const template = templateName(entry.templateId, templates);
  const names = [place, template].filter((name): name is string => name !== null);
  const channel = auditChannelOf(entry);
  const channelName = channel === undefined ? undefined : channelNames.get(channel);
  return (
    <Button
      variant="default"
      className="cg-audit-row"
      data-audit-row=""
      data-audit-item-id={entry.itemId ?? ''}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span
        className="cg-audit-channel"
        data-audit-cell="channel"
        data-audit-channel={channel === undefined ? '' : String(channel)}
      >
        {channel === undefined ? (
          '—'
        ) : (
          <>
            <bdi>{channelName ?? localizeUi('CH {channel}', { channel: number(channel) })}</bdi>
            {channelName !== undefined && (
              <small>{localizeUi('CH {channel}', { channel: number(channel) })}</small>
            )}
          </>
        )}
      </span>
      <span
        className="cg-audit-time"
        data-audit-cell="time"
        data-audit-time={time.utc}
        title={time.utc}
      >
        <strong>
          <bdi dir="ltr">{time.time}</bdi>
        </strong>
        <small>
          <bdi dir="ltr">{time.date}</bdi>
        </small>
      </span>
      <span
        className="cg-audit-actor"
        data-audit-cell="actor"
        data-audit-actor={entry.actor}
        {...(entry.consoleAddress === undefined
          ? {}
          : {
              title: localizeUi('From {address}', { address: entry.consoleAddress }),
              'data-audit-console': entry.consoleAddress,
            })}
      >
        <bdi>{entry.actor}</bdi>
      </span>
      <span data-audit-cell="action" data-audit-action={entry.action}>
        {localizeUi(entry.action)}
      </span>
      <span className="cg-audit-item" data-audit-cell="item">
        {names.length > 0 ? (
          <span className="cg-audit-names" data-audit-names="">
            <OperatorNames name={{ names, layer: null, title: '' }} />
          </span>
        ) : (
          <span className="cg-audit-names">{localizeUi('Station event')}</span>
        )}
        {entry.slot !== undefined && (
          <span
            className="cg-audit-slot"
            data-audit-slot={`${String(entry.slot.channel)}-${String(entry.slot.layer)}`}
          >
            {localizeUi('CH {channel} · layer {layer}', {
              channel: number(entry.slot.channel),
              layer: number(entry.slot.layer),
            })}
          </span>
        )}
      </span>
      <span className="cg-audit-outcome" data-audit-cell="result">
        <span className={outcomeTag(entry.outcome)} data-audit-outcome={entry.outcome}>
          {localizeUi(outcomeLabel(entry.outcome))}
        </span>
      </span>
    </Button>
  );
}

function EventDetails({
  entry,
  format,
  templates,
  bank,
  onClose,
}: {
  entry: AuditEntry;
  format: AuditCalendarFormat;
  templates: ReadonlyMap<string, TemplateInfo>;
  bank: readonly FixedLayerBank[] | null;
  onClose: () => void;
}): JSX.Element {
  const localizeUi = useUiText();
  const time = auditTimeParts(entry.ts, undefined, format);
  const number = (value: number): string => writeFieldDigits(String(value), format.digits);
  const place = placeName(entry.slot, bank);
  const template = templateName(entry.templateId, templates);
  const names = [place, template].filter((name): name is string => name !== null);
  const technical: { label: string; value: string; display?: string }[] = [];
  const add = (label: string, value: string | number | undefined, display?: string): void => {
    if (value !== undefined && value !== '')
      technical.push({
        label,
        value: String(value),
        ...(display === undefined ? {} : { display }),
      });
  };
  add('Item ID', entry.itemId);
  add('Template ID', entry.templateId);
  add('Actor ID', entry.actorSub);
  add('Console', entry.consoleAddress);
  add('Template hash', entry.templateHash);
  add('Data hash', entry.dataHash);
  const server = entry.server ?? entry.slot?.server;
  add('Server', server, server === undefined ? undefined : localizeUi(server));
  add('Acknowledged', entry.ackMs === undefined ? undefined : `${String(entry.ackMs)} ms`);
  add(
    'OSC confirmed',
    entry.oscConfirmMs === undefined ? undefined : `${String(entry.oscConfirmMs)} ms`,
  );
  add('Error code', entry.errorCode);
  add('Command', entry.command === undefined ? undefined : commandForDisplay(entry.command));
  add('Refused request', entry.refused?.channel);
  add('Refused channel', entry.refused?.casparChannel);
  const timing = entry.timing;
  const timingDisplay = [];
  if (timing?.passes !== undefined) {
    timingDisplay.push(
      timing.passes === 'infinite'
        ? localizeUi('until stop')
        : localizeUi('{count} passes', { count: number(timing.passes) }),
    );
  }
  if (timing?.delayMs !== undefined) {
    timingDisplay.push(
      localizeUi('gap {seconds} s', { seconds: number(Math.round(timing.delayMs / 100) / 10) }),
    );
  }
  add('Timing', timingClause(timing) ?? undefined, timingDisplay.join(' · '));
  const sound = entry.sound === undefined ? undefined : entry.sound.muted ? 'Muted' : 'Unmuted';
  add('Sound', sound, sound === undefined ? undefined : localizeUi(sound));
  if (entry.pageAdvance !== undefined) {
    const { field, mode } = entry.pageAdvance;
    add(
      'Page advance',
      `${field} · ${mode}`,
      `${field} · ${localizeUi(mode === 'auto' ? 'Auto' : 'Manual')}`,
    );
  }
  add('Media', entry.media === undefined ? undefined : JSON.stringify(entry.media));
  add(
    'Backup channels',
    entry.backupChannels === undefined ? undefined : JSON.stringify(entry.backupChannels),
  );
  if (entry.rebuild !== undefined) {
    const { from, to, reason } = entry.rebuild;
    const runtimes = localizeUi('Template runtime {from} → {to}', {
      from: from?.runtimeBuild ?? localizeUi('unrecorded'),
      to: to.runtimeBuild,
    });
    add(
      'Rebuild',
      rebuildDetail(entry.rebuild),
      reason === undefined ? runtimes : localizeUi('{runtimes}. {reason}', { runtimes, reason }),
    );
  }

  return (
    <aside
      className="cg-audit-details"
      aria-label={localizeUi('Event details')}
      data-audit-details=""
    >
      <div className="cg-audit-details__head">
        <strong>{localizeUi('Event details')}</strong>
        <Button variant="icon" aria-label={localizeUi('Close event details')} onClick={onClose}>
          <Icon icon={X} />
        </Button>
      </div>
      <span className={outcomeTag(entry.outcome)}>{localizeUi(outcomeLabel(entry.outcome))}</span>
      <div className="cg-audit-details__title">
        <strong>{localizeUi(entry.action)}</strong>
        {names.length > 0 && <OperatorNames name={{ names, layer: null, title: '' }} />}
      </div>
      {entry.errorCode !== undefined && (
        <Notice
          noticeRole="refusal"
          aria="status"
          text={entry.errorCode}
          {...(entry.command !== undefined ? { detail: commandForDisplay(entry.command) } : {})}
        />
      )}
      <dl className="cg-audit-details__facts">
        <dt>{localizeUi('Time')}</dt>
        <dd>
          <bdi dir="ltr">
            {time.date} {time.time}
          </bdi>
        </dd>
        <dt>UTC</dt>
        <dd>
          <bdi dir="ltr">{time.utc}</bdi>
        </dd>
        <dt>{localizeUi('Actor')}</dt>
        <dd>
          <bdi>{entry.actor}</bdi>
        </dd>
        <dt>{localizeUi('Action')}</dt>
        <dd>{localizeUi(entry.action)}</dd>
        {entry.inputPreview !== undefined && (
          <>
            <dt>{localizeUi('Input preview')}</dt>
            <dd>
              {localizeUi('CH {channel} · {name} · {operation}', {
                channel: number(entry.inputPreview.channel),
                name: entry.inputPreview.sourceName,
                operation: localizeUi(entry.inputPreview.operation),
              })}
            </dd>
          </>
        )}
        {entry.slot !== undefined && (
          <>
            <dt>{localizeUi('Channel / layer')}</dt>
            <dd>
              <bdi dir="ltr">
                {number(entry.slot.channel)} / {number(entry.slot.layer)}
              </bdi>
            </dd>
          </>
        )}
        {entry.rebuild !== undefined && (
          <>
            <dt>{localizeUi('Change')}</dt>
            <dd>
              {localizeUi('{from} → {to}', {
                from: entry.rebuild.from?.consoleVersion ?? localizeUi('earlier'),
                to: entry.rebuild.to.consoleVersion,
              })}
            </dd>
          </>
        )}
      </dl>
      {technical.length > 0 && (
        <section className="cg-audit-details__technical">
          <h3>{localizeUi('Technical details')}</h3>
          {technical.map((fact) => (
            <div
              key={fact.label}
              className="cg-audit-detail-value"
              data-audit-technical={fact.label}
            >
              <span>{localizeUi(fact.label)}</span>
              <code dir="auto" title={fact.value}>
                {fact.display ?? fact.value}
              </code>
              <CopyValue label={localizeUi(fact.label)} value={fact.value} />
            </div>
          ))}
        </section>
      )}
      <CopyValue
        label={localizeUi('event details')}
        value={JSON.stringify(entry, null, 2)}
        text={localizeUi('Copy event details')}
      />
    </aside>
  );
}

function CopyValue({
  label,
  value,
  text,
}: {
  label: string;
  value: string;
  text?: string | undefined;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  const t = useUiText();
  const copy = t('Copy {label}', { label });
  return (
    <Button
      variant="neutral"
      aria-label={copy}
      title={copy}
      onClick={() => {
        if (navigator.clipboard === undefined) return;
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      <Icon icon={copied ? Check : Copy} size={12} /> {text}
    </Button>
  );
}
