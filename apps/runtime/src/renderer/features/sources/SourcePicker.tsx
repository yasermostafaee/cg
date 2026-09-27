import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { Cable, Check, Film } from 'lucide-react';
import {
  sourceBindable,
  sourceShowableOn,
  type ConsoleMediaItem,
  type SourceDefinition,
} from '@cg/shared-ipc';
import { Button } from '../../ui/Button.js';
import { ComboField } from '../../ui/ComboField.js';
import { Icon } from '../../ui/Icon.js';
import { Popover } from '../../ui/Popover.js';
import { TabPanel, TabStrip } from '../../ui/Tabs.js';
import { Tag } from '../../ui/Tag.js';
import { TextInput } from '../../ui/TextInput.js';
import { VirtualList, type VirtualListHandle, type VirtualRow } from '../../ui/VirtualList.js';
import { SourceLabel, formatMediaDuration, labelledSource } from './SourceLabel.js';
import {
  currentSourceCatalog,
  refreshPlayoutSources,
  searchPlayoutMedia,
  sourcesVersion,
  subscribeSources,
} from './sourceStore.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §2.A — **ONE SOURCE PICKER, AT EVERY PLACE A PLATE IS BOUND.**
 *
 * The station's sources are the Playout's now: its INPUTS (a short list, in the Playout's own order)
 * and its MEDIA library (thousands of items, searched on the Playout's side). A native select over
 * `catalog.sources` could show neither honestly, so the three call sites — Template defaults, the
 * Inspector's Look inputs and the on-air swap — share this one picker. Each keeps its own commit
 * model (Save defaults · the draft with Update/Discard · the swap committing on change): the picker
 * only RETURNS A CHOICE, once, and closes.
 *
 * ── CLOSED ──────────────────────────────────────────────────────────────────────────────
 *
 * It is the select it replaces: the same field skin and height (`ComboField`), showing the bound
 * source as `SourceLabel` renders it everywhere — the kind's icon, the name, a media item's length,
 * `Unavailable` when the Playout stopped offering it — or the call site's own choice (`None`,
 * `Default (Studio 1)`).
 *
 * ── OPEN: AN ANCHORED PANEL, NOT A MODAL ────────────────────────────────────────────────
 *
 * Two of the call sites are dialogs already (`Popover`). The call site's special choices sit in
 * one row above the tabs, the same in both. `Inputs n` lists what the Playout offers, in its order,
 * by NAME only — never the kind, never an address; one this product cannot play, or not on this
 * row's channel (v1.3 rule 1), is listed DISABLED with the reason in its `title`, not hidden, so
 * nobody wonders where it went. `Media n` searches the library: pages of 50, a virtualised list, the
 * next page fetched near the end, typing debounced 250 ms, earlier results kept under a thin line
 * while the next ones load. Media never appear under Inputs and inputs never under Media — a media
 * item named `Studio 1` is a media row, with the media icon.
 */

export interface SourceChoice {
  /** What {@link SourcePickerProps.onChange} receives for it. */
  readonly value: string;
  /** Its words: `None`, `Default (Studio 1)`, `Use template assignment (Studio 1)`. */
  readonly label: string;
}

export interface SourcePickerProps {
  /** The bound catalogue id, or one of {@link choices}' values. */
  value: string;
  /** Called ONCE per choice, with the chosen catalogue id or special value. */
  onChange: (value: string) => void;
  /** The call site's own choices, shown above the tabs. */
  choices: readonly SourceChoice[];
  /** The channel of the row being bound, for v1.3's per-channel inputs. Absent: no gating. */
  channel?: number | undefined;
  'aria-label': string;
  id?: string | undefined;
  /** Appended to the closed field (`is-dirty`, a struck value). */
  className?: string | undefined;
  title?: string | undefined;
  /** The call site's finders, on the closed field. */
  data?: Readonly<Record<`data-${string}`, string>> | undefined;
}

/** The panel's size (§2.A): at least this wide, at most this tall. */
export const PICKER_MIN_WIDTH = 440;
export const PICKER_MAX_HEIGHT = 480;
/** How tall the list is inside the panel, and each kind of row. */
const LIST_HEIGHT = 300;
const INPUT_ROW = 34;
const MEDIA_ROW = 46;
/** A media page, and how near the end the next one is asked for. */
export const MEDIA_PAGE = 50;
const NEAR_END_ROWS = 10;
/** Typing settles for this long before the Playout is asked. */
export const SEARCH_DEBOUNCE_MS = 250;
/** The `Recent` group: the media bound most recently on this station. */
const RECENT_MAX = 8;
/** A filter field appears only past this many inputs. */
const FILTER_OVER = 10;

type Tab = 'inputs' | 'media';

const isMediaId = (id: string): boolean => id.startsWith('md-');

export function SourcePicker({
  value,
  onChange,
  choices,
  channel,
  'aria-label': ariaLabel,
  id,
  className,
  title,
  data,
}: SourcePickerProps): JSX.Element {
  useSyncExternalStore(subscribeSources, sourcesVersion);
  const field = useRef<HTMLButtonElement>(null);
  const base = useId();
  const panelId = `${base}-panel`;
  const [open, setOpen] = useState(false);

  const choice = choices.find((c) => c.value === value);
  const known = labelledSource(value) !== null;

  const close = useCallback(() => setOpen(false), []);
  const pick = (next: string): void => {
    setOpen(false);
    if (next !== value) onChange(next);
  };

  return (
    <>
      <ComboField
        ref={field}
        expanded={open}
        controls={panelId}
        onOpen={() => {
          refreshPlayoutSources();
          setOpen(true);
        }}
        aria-label={ariaLabel}
        id={id}
        className={className}
        title={title}
        // The bound value as a finder reads it — a catalogue id, never shown.
        data={{ ...data, 'data-picker-value': value }}
      >
        {choice !== undefined && (value === '' || !known) ? (
          <span className="cg-source-label" data-source-label="choice">
            {choice.label}
          </span>
        ) : (
          <SourceLabel sourceId={value} fallback={choices[0]?.label ?? 'None'} />
        )}
      </ComboField>
      {open && (
        <Popover
          anchor={field}
          onClose={close}
          id={panelId}
          aria-label="Choose a source"
          minWidth={PICKER_MIN_WIDTH}
          maxHeight={PICKER_MAX_HEIGHT}
          initialFocusSelector={isMediaId(value) ? '[data-picker-search]' : '[data-picker-list]'}
        >
          <PickerPanel
            base={base}
            value={value}
            choices={choices}
            channel={channel}
            onPick={pick}
            initialTab={isMediaId(value) ? 'media' : 'inputs'}
          />
        </Popover>
      )}
    </>
  );
}

function PickerPanel({
  base,
  value,
  choices,
  channel,
  onPick,
  initialTab,
}: {
  base: string;
  value: string;
  choices: readonly SourceChoice[];
  channel: number | undefined;
  onPick: (value: string) => void;
  initialTab: Tab;
}): JSX.Element {
  const [tab, setTab] = useState<Tab>(initialTab);
  const media = useMediaSearch();
  const catalog = currentSourceCatalog();
  const inputs = catalog.sources.filter((s) => s.origin !== 'media' && s.departed !== true);
  const tabs = [
    { id: 'inputs', label: `Inputs ${String(inputs.length)}` },
    {
      id: 'media',
      label: media.libraryTotal === null ? 'Media' : `Media ${String(media.libraryTotal)}`,
    },
  ];
  const prefix = `${base}-tab`;
  return (
    <div className="cg-picker" data-source-picker="">
      {choices.length > 0 && (
        <div className="cg-picker-choices" data-picker-choices="">
          {choices.map((c) => (
            <Button
              key={c.value}
              variant="ghost"
              className="cg-picker-choice"
              aria-pressed={value === c.value}
              data-picker-choice={c.value}
              onClick={() => onPick(c.value)}
            >
              {value === c.value && <Icon icon={Check} size={13} />}
              {c.label}
            </Button>
          ))}
        </div>
      )}
      <TabStrip
        tabs={tabs}
        activeId={tab}
        onSelect={(next) => setTab(next === 'media' ? 'media' : 'inputs')}
        ariaLabel="Source kind"
        idPrefix={prefix}
      />
      <TabPanel activeId={tab} idPrefix={prefix}>
        {tab === 'inputs' ? (
          <InputsTab
            listId={`${base}-inputs`}
            inputs={inputs}
            value={value}
            channel={channel}
            onPick={onPick}
          />
        ) : (
          <MediaTab listId={`${base}-media`} value={value} media={media} onPick={onPick} />
        )}
      </TabPanel>
    </div>
  );
}

// ── keyboard, shared by both tabs ────────────────────────────────────────────────────────

/** The next pickable option from `from` in direction `step`, or `from` when there is none. */
function nextPickable(
  rows: readonly VirtualRow[],
  from: number | null,
  step: 1 | -1,
): number | null {
  for (
    let i = (from ?? (step === 1 ? -1 : rows.length)) + step;
    i >= 0 && i < rows.length;
    i += step
  ) {
    const row = rows[i];
    if (row !== undefined && row.kind === 'option' && row.disabled !== true) return i;
  }
  return from;
}

function useListKeys(
  rows: readonly VirtualRow[],
  list: RefObject<VirtualListHandle>,
  pickAt: (index: number) => void,
): {
  active: number | null;
  setActive: (index: number) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>, fromField?: boolean) => void;
} {
  const [active, setActiveState] = useState<number | null>(null);
  const setActive = (index: number): void => {
    setActiveState(index);
    list.current?.scrollToIndex(index);
  };
  // A list that changed under the active row keeps a row that exists.
  useEffect(() => {
    if (active !== null && active >= rows.length) setActiveState(null);
  }, [rows.length, active]);
  const onKeyDown = (e: KeyboardEvent<HTMLElement>, fromField = false): void => {
    const move = (to: number | null): void => {
      e.preventDefault();
      if (to !== null) setActive(to);
    };
    switch (e.key) {
      case 'ArrowDown':
        move(nextPickable(rows, active, 1));
        return;
      case 'ArrowUp':
        move(nextPickable(rows, active, -1));
        return;
      case 'Home':
        if (fromField) return; // the field's own caret
        move(nextPickable(rows, null, 1));
        return;
      case 'End':
        if (fromField) return;
        move(nextPickable(rows, null, -1));
        return;
      case 'Enter':
        if (active !== null) {
          e.preventDefault();
          pickAt(active);
        }
        return;
      default:
        return;
    }
  };
  return { active, setActive, onKeyDown };
}

// ── Inputs ───────────────────────────────────────────────────────────────────────────────

function InputsTab({
  listId,
  inputs,
  value,
  channel,
  onPick,
}: {
  listId: string;
  inputs: readonly SourceDefinition[];
  value: string;
  channel: number | undefined;
  onPick: (value: string) => void;
}): JSX.Element {
  const [filter, setFilter] = useState('');
  const list = useRef<VirtualListHandle>(null);
  const needle = filter.trim().toLowerCase();
  const shown =
    needle === '' ? inputs : inputs.filter((s) => s.name.toLowerCase().includes(needle));
  const rows: VirtualRow[] = shown.map((source) => {
    // `ROUTE-PLATES-01` — v1.3 rule 1, asked of the one predicate the bridge's refusal asks.
    const offChannel = channel !== undefined && !sourceShowableOn(source, channel);
    const bindable = sourceBindable(source);
    const selected = source.id === value;
    return {
      kind: 'option',
      key: source.id,
      disabled: !bindable || offChannel,
      selected,
      ...(offChannel
        ? { title: `Not available on CH ${String(channel)}` }
        : !bindable && source.reason !== undefined
          ? { title: source.reason }
          : {}),
      data: { 'data-picker-input': source.id },
      content: (
        <span className="cg-picker-row">
          <Icon icon={Cable} size={14} />
          <bdi className="cg-picker-row__name">{source.name}</bdi>
          {source.status === 'unavailable' && (
            <Tag className="cg-source-tag cg-source-tag--unavailable">Unavailable</Tag>
          )}
          {selected && <Icon icon={Check} size={14} />}
        </span>
      ),
    };
  });
  const keys = useListKeys(rows, list, (index) => {
    const row = rows[index];
    if (row !== undefined) onPick(row.key);
  });
  return (
    <div className="cg-picker-tab" data-picker-tab="inputs">
      {inputs.length > FILTER_OVER && (
        <div className="cg-picker-controls">
          <TextInput
            value={filter}
            onChange={setFilter}
            placeholder="Filter inputs"
            aria-label="Filter inputs"
            dir="auto"
            onKeyDown={(e) => keys.onKeyDown(e, true)}
          />
        </div>
      )}
      {inputs.length === 0 ? (
        <p className="cg-picker-empty" data-picker-empty="inputs">
          No inputs from the Playout.
        </p>
      ) : (
        <VirtualList
          ref={list}
          id={listId}
          aria-label="Inputs"
          rows={rows}
          rowHeight={INPUT_ROW}
          height={Math.min(LIST_HEIGHT, Math.max(rows.length, 1) * INPUT_ROW)}
          activeIndex={keys.active}
          onActiveChange={keys.setActive}
          onPick={(index) => {
            const row = rows[index];
            if (row !== undefined) onPick(row.key);
          }}
          onKeyDown={(e) => keys.onKeyDown(e)}
          data={{ 'data-picker-list': '' }}
        />
      )}
    </div>
  );
}

// ── Media ────────────────────────────────────────────────────────────────────────────────

interface MediaState {
  readonly q: string;
  readonly sort: 'name' | 'recent';
  readonly items: readonly ConsoleMediaItem[];
  readonly total: number;
  readonly nextCursor: string | null;
  readonly loading: boolean;
  readonly failed: string | null;
  /** The library's size, from the last answer to an empty query — the tab's count. */
  readonly libraryTotal: number | null;
  setQuery: (q: string) => void;
  setSort: (sort: 'name' | 'recent') => void;
  loadMore: () => void;
  retry: () => void;
}

/**
 * The Media tab's state, held by the PANEL so the tab's count is known before the tab is opened.
 * One request in flight per query: an answer to a query the operator has typed past is dropped, a
 * changed query or sort starts again from the first page, and a page is only ever asked once.
 */
function useMediaSearch(): MediaState {
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState('');
  const [sort, setSortState] = useState<'name' | 'recent'>('name');
  const [items, setItems] = useState<readonly ConsoleMediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [libraryTotal, setLibraryTotal] = useState<number | null>(null);
  const seq = useRef(0);

  // Typing settles, then the Playout is asked.
  useEffect(() => {
    if (q === asked) return undefined;
    const timer = setTimeout(() => setAsked(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, asked]);

  const run = useCallback((query: string, order: 'name' | 'recent', cursor: string | null) => {
    const mine = ++seq.current;
    setLoading(true);
    setFailed(null);
    void searchPlayoutMedia({
      q: query,
      sort: order,
      limit: MEDIA_PAGE,
      ...(cursor !== null ? { cursor } : {}),
    }).then((res) => {
      if (mine !== seq.current) return; // an answer to a query already typed past
      setLoading(false);
      if (!res.ok) {
        setFailed(res.message);
        return;
      }
      setItems((prev) => (cursor === null ? res.items : [...prev, ...res.items]));
      setTotal(res.total);
      setNextCursor(res.nextCursor);
      if (query === '') setLibraryTotal(res.total);
    });
  }, []);

  // A new query or order starts from the first page; earlier results stay until it answers.
  useEffect(() => {
    run(asked, sort, null);
  }, [asked, sort, run]);

  return {
    q,
    sort,
    items,
    total,
    nextCursor,
    loading,
    failed,
    libraryTotal,
    setQuery: setQ,
    setSort: setSortState,
    loadMore: () => {
      if (!loading && nextCursor !== null) run(asked, sort, nextCursor);
    },
    retry: () => run(asked, sort, null),
  };
}

function mediaRow(
  key: string,
  item: {
    readonly id: string;
    readonly name: string;
    readonly folder?: string | undefined;
    readonly durationMs?: number | undefined;
    readonly width?: number | undefined;
    readonly height?: number | undefined;
    readonly unavailable?: boolean | undefined;
  },
  value: string,
): VirtualRow {
  const selected = item.id === value;
  const facts = [
    item.durationMs !== undefined ? formatMediaDuration(item.durationMs) : null,
    item.width !== undefined && item.height !== undefined
      ? `${String(item.width)}×${String(item.height)}`
      : null,
  ].filter((f): f is string => f !== null);
  return {
    kind: 'option',
    key,
    selected,
    data: { 'data-picker-media': item.id },
    content: (
      <span className="cg-picker-media">
        <span className="cg-picker-row">
          <Icon icon={Film} size={14} />
          <bdi className="cg-picker-row__name">{item.name}</bdi>
          {item.unavailable === true && (
            <Tag className="cg-source-tag cg-source-tag--unavailable">Unavailable</Tag>
          )}
          {selected && <Icon icon={Check} size={14} />}
        </span>
        <span className="cg-picker-media__facts">
          {item.folder !== undefined && item.folder !== '' && <bdi>{item.folder}</bdi>}
          {facts.map((f, i) => (
            <span key={f}>
              {(i > 0 || (item.folder !== undefined && item.folder !== '')) && ' · '}
              {f}
            </span>
          ))}
        </span>
      </span>
    ),
  };
}

function MediaTab({
  listId,
  value,
  media,
  onPick,
}: {
  listId: string;
  value: string;
  media: MediaState;
  onPick: (value: string) => void;
}): JSX.Element {
  const list = useRef<VirtualListHandle>(null);
  const search = useRef<HTMLInputElement>(null);
  const catalog = currentSourceCatalog();

  // The search field takes focus when the tab opens.
  useEffect(() => {
    search.current?.focus();
  }, []);

  const rows = useMemo<VirtualRow[]>(() => {
    const out: VirtualRow[] = [];
    const inResults = new Set(media.items.map((m) => m.id));
    // `Recent`: the media bound most recently on this station, for an empty query only.
    const bound = catalog.sources.filter((s) => s.origin === 'media');
    const recent =
      media.q === ''
        ? [...bound]
            .sort((a, b) => (b.media?.lastBoundAt ?? '').localeCompare(a.media?.lastBoundAt ?? ''))
            .slice(0, RECENT_MAX)
        : [];
    const shownIds = new Set([...inResults, ...recent.map((r) => r.id)]);
    // The current binding, pinned at the top when it is not otherwise in view.
    if (isMediaId(value) && !shownIds.has(value)) {
      const current = labelledSource(value);
      const entry = bound.find((s) => s.id === value);
      if (current !== null) {
        out.push({ kind: 'heading', key: 'Current', content: 'Current' });
        out.push(
          mediaRow(
            `current:${value}`,
            {
              id: value,
              name: current.name,
              durationMs: current.durationMs,
              folder: entry?.media?.folder,
              width: entry?.media?.width,
              height: entry?.media?.height,
              unavailable: current.unavailable,
            },
            value,
          ),
        );
      }
    }
    if (recent.length > 0) {
      out.push({ kind: 'heading', key: 'Recent', content: 'Recent' });
      for (const r of recent) {
        out.push(
          mediaRow(
            `recent:${r.id}`,
            {
              id: r.id,
              name: r.name,
              durationMs: r.media?.durationMs,
              folder: r.media?.folder,
              width: r.media?.width,
              height: r.media?.height,
              unavailable: r.status === 'unavailable',
            },
            value,
          ),
        );
      }
      out.push({ kind: 'heading', key: 'All media', content: 'All media' });
    }
    for (const item of media.items) out.push(mediaRow(`all:${item.id}`, item, value));
    return out;
  }, [media.items, media.q, catalog, value]);

  const idOf = (index: number): string | null => {
    const key = rows[index]?.key;
    return key === undefined ? null : key.slice(key.indexOf(':') + 1);
  };
  const keys = useListKeys(rows, list, (index) => {
    const picked = idOf(index);
    if (picked !== null) onPick(picked);
  });

  const empty = !media.loading && media.failed === null && media.items.length === 0;
  return (
    <div className="cg-picker-tab" data-picker-tab="media">
      <div className="cg-picker-controls">
        <TextInput
          ref={search}
          value={media.q}
          onChange={media.setQuery}
          placeholder="Search media"
          aria-label="Search media"
          dir="auto"
          className="cg-picker-search"
          onKeyDown={(e) => keys.onKeyDown(e, true)}
          data={{ 'data-picker-search': '' }}
        />
        <div className="cg-picker-sort" role="group" aria-label="Sort">
          {(['name', 'recent'] as const).map((order) => (
            <Button
              key={order}
              variant="neutral"
              active={media.sort === order}
              aria-pressed={media.sort === order}
              data-picker-sort={order}
              onClick={() => media.setSort(order)}
            >
              {order === 'name' ? 'Name' : 'Recent'}
            </Button>
          ))}
        </div>
      </div>
      {media.loading && (
        <div
          className="cg-picker-progress"
          role="progressbar"
          aria-label="Loading media"
          data-picker-loading=""
        />
      )}
      {media.failed !== null ? (
        <div className="cg-picker-empty" data-picker-failed="">
          <span>{media.failed}</span>
          <Button variant="neutral" data-picker-retry="" onClick={media.retry}>
            Retry
          </Button>
        </div>
      ) : empty && rows.length === 0 ? (
        <p className="cg-picker-empty" data-picker-empty="media">
          {media.q === '' ? 'No media from the Playout.' : `No media matches “${media.q}”.`}
        </p>
      ) : (
        <VirtualList
          ref={list}
          id={listId}
          aria-label="Media"
          rows={rows}
          rowHeight={MEDIA_ROW}
          height={LIST_HEIGHT}
          activeIndex={keys.active}
          onActiveChange={keys.setActive}
          onPick={(index) => {
            const picked = idOf(index);
            if (picked !== null) onPick(picked);
          }}
          onKeyDown={(e) => {
            // Typing in the list goes to the search field.
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              search.current?.focus();
              return;
            }
            keys.onKeyDown(e);
          }}
          onNearEnd={media.loadMore}
          nearEndRows={NEAR_END_ROWS}
          data={{ 'data-picker-list': '' }}
        />
      )}
    </div>
  );
}
