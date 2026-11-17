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
import { Cable, Check, Film, LayoutGrid, List, Play } from 'lucide-react';
import {
  canCheckLiveInput,
  INPUT_GONE_REASON,
  isPlaylistOutput,
  ownOutputTitle,
  sourceBindable,
  sourceLoopsOn,
  sourceShowableOn,
  type ConsoleMediaItem,
  type SourceDefinition,
} from '@cg/shared-ipc';
import { Button } from '../../ui/Button.js';
import { ComboField } from '../../ui/ComboField.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { directionOf } from '../../ui/OperatorNames.js';
import { TabPanel, TabStrip } from '../../ui/Tabs.js';
import { Tag } from '../../ui/Tag.js';
import { TextInput } from '../../ui/TextInput.js';
import { VirtualList, type VirtualListHandle, type VirtualRow } from '../../ui/VirtualList.js';
import { inputAudioSource } from './InputAudioMeter.js';
import { InputCatalogueServer } from './InputCatalogueServer.js';
import { InputThumbnail } from './InputThumbnail.js';
import {
  createMediaThumbnailLoader,
  MediaThumbnail,
  type MediaThumbnailLoader,
} from './MediaThumbnail.js';
import { SourceLabel, formatMediaDuration, labelledSource } from './SourceLabel.js';
import { SourceMediaPreview } from './SourceMediaPreview.js';
import {
  currentSourceCatalog,
  playoutInputsForDisplay,
  refreshPlayoutSources,
  searchPlayoutMedia,
  sourcesVersion,
  subscribeSources,
} from './sourceStore.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §2.A — **ONE SOURCE PICKER, AT EVERY PLACE A PLATE IS BOUND.**
 *
 * The station's sources are the Playout's now: its INPUTS (a short list whose playlist outputs lead,
 * with the Playout's order preserved inside both groups) and its MEDIA library (thousands of items,
 * searched on the Playout's side). A native select over `catalog.sources` could show neither
 * honestly, so the three call sites — Template defaults, the Inspector's Plate inputs and the on-air
 * swap — share this one picker. Each keeps its own commit model (Save defaults · the draft with
 * Update/Discard · the swap committing on change): the picker only RETURNS A CHOICE, once, and
 * closes.
 *
 * ── CLOSED ──────────────────────────────────────────────────────────────────────────────
 *
 * It is the select it replaces: the same field skin and height (`ComboField`), showing the bound
 * source as `SourceLabel` renders it everywhere — the kind's icon, the name, a media item's length,
 * `Unavailable` when the Playout stopped offering it — or the call site's own choice (`None`,
 * `Default (Studio 1)`).
 *
 * ── OPEN: A SOURCE LIBRARY DIALOG ───────────────────────────────────────────────────────
 *
 * A picker opened from an existing dialog uses the shared nested modal focus trap. Its choices sit in
 * one row above the tabs, the same in both. `Inputs n` puts playlist outputs first, then everything
 * else, preserving the Playout's order inside each group. It lists each source by NAME only — never
 * the kind, never an address; one this product cannot play, or not on this row's channel (v1.3 rule
 * 1), is listed DISABLED with the reason in its `title`, not hidden, so nobody wonders where it went.
 * `Media n` searches the library: pages of 50, a virtualised list, the next page fetched near the end,
 * typing debounced 250 ms, earlier results kept under a thin line while the next ones load. Media
 * never appear under Inputs. Previewing a media row in the adjacent player leaves the assignment
 * intact until the operator chooses the row.
 */

export interface SourceChoice {
  /** What {@link SourcePickerProps.onChange} receives for it. */
  readonly value: string;
  /** Its WORDS, and only its words: `None`, `Default`, `Use template assignment`. */
  readonly label: string;
  /**
   * 🔴 `B-303` — **THE SOURCE IT NAMES, KEPT APART FROM ITS WORDS.** A catalogue id: the choice reads
   * `<label> (<name>)`, the name in its own isolate and its own direction ({@link ChoiceLabel}), with
   * `Unavailable` when the Playout no longer offers it. `null` — it names nothing (`(none set)`).
   * Absent — the words alone. It used to be one string, `Default (${name})`, so the owner's
   * `NDI کانالِ ۱ (APASAI)` was laid out inside the English and read `NDI ۱ کانال (APASAI)`.
   */
  readonly names?: string | null | undefined;
}

/** `B-303` — what a choice names when the catalogue does not know its id at all. */
export const NOT_LISTED = 'Not listed';

/** A choice as plain text — `Default (Studio 1)` — for a fallback, a title or a finder. */
export function choiceText(choice: SourceChoice): string {
  if (choice.names === undefined) return choice.label;
  if (choice.names === null) return `${choice.label} (none set)`;
  return `${choice.label} (${labelledSource(choice.names)?.name ?? NOT_LISTED})`;
}

/**
 * 🔴 `B-303` — **A CHOICE'S WORDS, AND THE NAME APART.** `Default (` and `)` are this console's
 * English, laid out in the line's own direction; the name between them is the Playout's, in an
 * inline isolate in ITS direction (`directionOf`), so a Persian name reads right to left whatever
 * letter it starts with. A source the Playout no longer offers — kept as departed, or not in the
 * catalogue at all — wears the `Unavailable` tag every bound source wears (`SourceLabel`); one the
 * catalogue does not know reads `Not listed`, its id on the `title` (golden rule 11).
 */
export function ChoiceLabel({
  choice,
  meterChannel,
}: {
  choice: SourceChoice;
  meterChannel?: number | undefined;
}): JSX.Element {
  if (choice.names === undefined) return <span className="cg-choice-label">{choice.label}</span>;
  if (choice.names === null) {
    return <span className="cg-choice-label">{`${choice.label} (none set)`}</span>;
  }
  const source = labelledSource(choice.names);
  const name = source?.name ?? NOT_LISTED;
  const offered = source !== null && !source.unavailable;
  const input = meterChannel === undefined ? undefined : inputAudioSource(choice.names);
  return (
    <span
      className="cg-choice-label"
      data-choice-names={choice.names}
      {...(source === null ? { title: choice.names } : {})}
    >
      <span className="cg-choice-label__words">
        {`${choice.label} (`}
        <bdi dir={directionOf(name)} data-choice-name="">
          {name}
        </bdi>
        {')'}
      </span>
      {input !== undefined && (
        <InputThumbnail source={input} channel={meterChannel} meterChannel={meterChannel} compact />
      )}
      {!offered && (
        <Tag
          className="cg-source-tag cg-source-tag--unavailable"
          title={source?.reason ?? INPUT_GONE_REASON}
        >
          Unavailable
        </Tag>
      )}
    </span>
  );
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
  /** Snapshot authority when the choices themselves do not have channel gating. */
  previewChannel?: number | undefined;
  inputCheck?: { channel: number; start: (source: SourceDefinition) => void } | undefined;
  'aria-label': string;
  id?: string | undefined;
  /** Appended to the closed field (`is-dirty`, a struck value). */
  className?: string | undefined;
  title?: string | undefined;
  /** The call site's finders, on the closed field. */
  data?: Readonly<Record<`data-${string}`, string>> | undefined;
}

const LIST_HEIGHT = 420;
const INPUT_ROW = 116;
const INPUT_GRID_HEIGHT = 520;
const MEDIA_ROW = 88;
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
type InputView = 'grid' | 'list';

const isMediaId = (id: string): boolean => id.startsWith('md-');

export function SourcePicker({
  value,
  onChange,
  choices,
  channel,
  previewChannel,
  inputCheck,
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
  const check =
    inputCheck === undefined
      ? undefined
      : {
          channel: inputCheck.channel,
          start: (source: SourceDefinition): void => {
            close();
            inputCheck.start(source);
          },
        };
  const thumbnailChannel = previewChannel ?? inputCheck?.channel ?? channel;

  return (
    <>
      <ComboField
        ref={field}
        expanded={open}
        controls={panelId}
        onOpen={() => {
          field.current?.focus();
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
            <ChoiceLabel choice={choice} meterChannel={thumbnailChannel} />
          </span>
        ) : (
          <SourceLabel
            sourceId={value}
            meterChannel={thumbnailChannel}
            fallback={choices[0] !== undefined ? choiceText(choices[0]) : 'None'}
          />
        )}
      </ComboField>
      {open && (
        <Modal
          id={panelId}
          title="Choose a source"
          subtitle={ariaLabel}
          emblem={Cable}
          size="library"
          layer="sub"
          onClose={close}
          footer={
            <ModalAction actionRole="cancel" onClick={close}>
              Cancel
            </ModalAction>
          }
        >
          <PickerPanel
            base={base}
            value={value}
            choices={choices}
            channel={channel}
            previewChannel={thumbnailChannel}
            onPick={pick}
            initialTab={isMediaId(value) ? 'media' : 'inputs'}
            inputCheck={check}
          />
        </Modal>
      )}
    </>
  );
}

function PickerPanel({
  base,
  value,
  choices,
  channel,
  previewChannel,
  onPick,
  initialTab,
  inputCheck,
}: {
  base: string;
  value: string;
  choices: readonly SourceChoice[];
  channel: number | undefined;
  previewChannel: number | undefined;
  onPick: (value: string) => void;
  initialTab: Tab;
  inputCheck: SourcePickerProps['inputCheck'];
}): JSX.Element {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [inputView, setInputView] = useState<InputView>('grid');
  const tabChanged = useRef(false);
  const media = useMediaSearch();
  const loadThumbnail = useMemo(createMediaThumbnailLoader, []);
  const catalog = currentSourceCatalog();
  const inputs = playoutInputsForDisplay(catalog.sources);
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
              <ChoiceLabel choice={c} meterChannel={previewChannel} />
            </Button>
          ))}
        </div>
      )}
      <TabStrip
        tabs={tabs}
        activeId={tab}
        onSelect={(next) => {
          if (next === tab) return;
          tabChanged.current = true;
          setTab(next === 'media' ? 'media' : 'inputs');
        }}
        ariaLabel="Source kind"
        idPrefix={prefix}
      />
      <TabPanel activeId={tab} idPrefix={prefix}>
        {tab === 'inputs' ? (
          <InputsTab
            listId={`${base}-inputs`}
            inputs={inputs}
            server={catalog.inputsServer}
            value={value}
            channel={channel}
            previewChannel={previewChannel}
            onPick={onPick}
            inputCheck={inputCheck}
            view={inputView}
            onViewChange={setInputView}
          />
        ) : (
          <MediaTab
            listId={`${base}-media`}
            value={value}
            media={media}
            previewChannel={previewChannel}
            focusSearch={tabChanged.current}
            onPick={onPick}
            loadThumbnail={loadThumbnail}
          />
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
  step: number,
): number | null {
  for (
    let i = from === null ? (step > 0 ? 0 : rows.length - 1) : from + step;
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
  tiled = false,
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
    const verticalStep = tiled && !fromField ? (list.current?.columnCount() ?? 1) : 1;
    const move = (to: number | null): void => {
      e.preventDefault();
      if (to !== null) setActive(to);
    };
    switch (e.key) {
      case 'ArrowDown':
        move(nextPickable(rows, active, active === null ? 1 : verticalStep));
        return;
      case 'ArrowUp':
        move(nextPickable(rows, active, active === null ? -1 : -verticalStep));
        return;
      case 'ArrowLeft':
      case 'ArrowRight':
        if (tiled && !fromField) {
          const forward =
            (e.key === 'ArrowRight') !== (getComputedStyle(e.currentTarget).direction === 'rtl');
          move(nextPickable(rows, active, forward ? 1 : -1));
        }
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
  server,
  value,
  channel,
  previewChannel,
  onPick,
  inputCheck,
  view,
  onViewChange,
}: {
  listId: string;
  inputs: readonly SourceDefinition[];
  server: string | undefined;
  value: string;
  channel: number | undefined;
  previewChannel: number | undefined;
  onPick: (value: string) => void;
  inputCheck?: SourcePickerProps['inputCheck'];
  view: InputView;
  onViewChange: (view: InputView) => void;
}): JSX.Element {
  const [filter, setFilter] = useState('');
  const list = useRef<VirtualListHandle>(null);
  const tiled = view === 'grid';
  const needle = filter.trim().toLowerCase();
  const shown =
    needle === '' ? inputs : inputs.filter((s) => s.name.toLowerCase().includes(needle));
  const rows: VirtualRow[] = shown.map((source) => {
    // `ROUTE-PLATES-01` — v1.3 rule 1, asked of the one predicate the bridge's refusal asks.
    const offChannel = channel !== undefined && !sourceShowableOn(source, channel);
    // `PLAYOUT-FEATURES-01` B (`B-298`) — the row channel's own output: it would loop there.
    const loops = channel !== undefined && sourceLoopsOn(source, channel);
    /*
      `PLAYOUT-FEATURES-01` C (`R-075`) — the Playout's PLAYLIST OUTPUT that it marks `available: false` is
      shown DISABLED with its reason in words (`not-running`, `pending-restart`, `unlicensed` — the last
      saying the Playout clears that channel). Another unavailable input keeps its rule: bindable, tagged.
    */
    const playlistDown = isPlaylistOutput(source) && source.status === 'unavailable';
    const bindable = sourceBindable(source);
    const selected = source.id === value;
    const checkable = canCheckLiveInput(source, inputCheck?.channel ?? channel ?? 0);
    const disabled = !bindable || offChannel || loops || playlistDown;
    return {
      kind: 'option',
      key: source.id,
      ariaLabel: source.status === 'unavailable' ? `${source.name} Unavailable` : source.name,
      disabled,
      selected,
      ...(loops
        ? { title: ownOutputTitle(channel) }
        : offChannel
          ? { title: `Not available on CH ${String(channel)}` }
          : disabled && source.reason !== undefined
            ? { title: source.reason }
            : {}),
      data: { 'data-picker-input': source.id },
      trailingAccessible: true,
      trailing: (
        <InputThumbnail
          source={source}
          channel={previewChannel}
          meterChannel={offChannel ? undefined : previewChannel}
          onCheck={checkable ? inputCheck?.start : undefined}
        />
      ),
      content: (
        <span className="cg-picker-row">
          <Icon icon={Cable} size={14} />
          {/* `B-303` — the name in its own direction (`directionOf`), as `SourceLabel` draws it. */}
          <bdi className="cg-picker-row__name" dir={directionOf(source.name)}>
            {source.name}
          </bdi>
          {source.status === 'unavailable' && (
            <Tag className="cg-source-tag cg-source-tag--unavailable">Unavailable</Tag>
          )}
          {selected && <Icon icon={Check} size={14} />}
        </span>
      ),
    };
  });
  const pick = (index: number): void => {
    const row = rows[index];
    if (row !== undefined && row.disabled !== true) onPick(row.key);
  };
  const keys = useListKeys(rows, list, pick, tiled);
  return (
    <div className="cg-picker-tab" data-picker-tab="inputs" data-input-view={view}>
      <div className="cg-picker-input-bar">
        <InputCatalogueServer server={server} />
        <div className="cg-picker-input-view" role="group" aria-label="Input view">
          <Button
            aria-label="Grid view"
            aria-pressed={tiled}
            active={tiled}
            onClick={() => onViewChange('grid')}
          >
            <Icon icon={LayoutGrid} size={15} /> Grid
          </Button>
          <Button
            aria-label="List view"
            aria-pressed={!tiled}
            active={!tiled}
            onClick={() => onViewChange('list')}
          >
            <Icon icon={List} size={15} /> List
          </Button>
        </div>
      </div>
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
          key={view}
          ref={list}
          id={listId}
          aria-label="Inputs"
          rows={rows}
          rowHeight={INPUT_ROW}
          height={
            tiled ? INPUT_GRID_HEIGHT : Math.min(LIST_HEIGHT, Math.max(rows.length, 1) * INPUT_ROW)
          }
          activeIndex={keys.active}
          onActiveChange={keys.setActive}
          onPick={pick}
          onKeyDown={(e) => keys.onKeyDown(e)}
          data={{ 'data-picker-list': '', 'data-modal-autofocus': '' }}
          withActions={inputCheck !== undefined}
          tiled={tiled}
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

interface MediaChoice {
  readonly id: string;
  readonly name: string;
  readonly folder?: string | undefined;
  readonly durationMs?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly unavailable?: boolean | undefined;
}

function mediaRow(
  key: string,
  item: MediaChoice,
  value: string,
  loadThumbnail: MediaThumbnailLoader,
  preview: MediaChoice | undefined,
  setPreview: (item: MediaChoice) => void,
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
    trailing: item.unavailable !== true && (
      <Button
        variant="neutral"
        className="cg-picker-preview-button"
        aria-label={`Preview · ${item.name}`}
        aria-pressed={preview?.id === item.id}
        data-picker-preview={item.id}
        onClick={() => setPreview(item)}
      >
        <Icon icon={Play} size={14} />
        <span>Preview</span>
      </Button>
    ),
    content: (
      <span className="cg-picker-media">
        <MediaThumbnail id={item.unavailable === true ? undefined : item.id} load={loadThumbnail} />
        <span className="cg-picker-media__text">
          <span className="cg-picker-row">
            <Icon icon={Film} size={14} />
            <bdi className="cg-picker-row__name" dir={directionOf(item.name)}>
              {item.name}
            </bdi>
            {item.unavailable === true && (
              <Tag className="cg-source-tag cg-source-tag--unavailable">Unavailable</Tag>
            )}
            {selected && <Icon icon={Check} size={14} />}
          </span>
          <span className="cg-picker-media__facts">
            {item.folder !== undefined && item.folder !== '' && (
              <bdi dir={directionOf(item.folder)}>{item.folder}</bdi>
            )}
            {facts.map((f, i) => (
              <span key={f}>
                {(i > 0 || (item.folder !== undefined && item.folder !== '')) && ' · '}
                {f}
              </span>
            ))}
          </span>
        </span>
      </span>
    ),
  };
}

function MediaTab({
  listId,
  value,
  media,
  previewChannel,
  focusSearch,
  onPick,
  loadThumbnail,
}: {
  listId: string;
  value: string;
  media: MediaState;
  previewChannel: number | undefined;
  focusSearch: boolean;
  onPick: (value: string) => void;
  loadThumbnail: MediaThumbnailLoader;
}): JSX.Element {
  const list = useRef<VirtualListHandle>(null);
  const search = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<MediaChoice>();
  const catalog = currentSourceCatalog();

  // On initial open the modal's trap records and restores the launcher before moving focus.
  useEffect(() => {
    if (focusSearch) search.current?.focus();
  }, [focusSearch]);

  const rows = useMemo<VirtualRow[]>(() => {
    const out: VirtualRow[] = [];
    const inResults = new Map(media.items.map((item) => [item.id, item]));
    // `Recent`: the media bound most recently on this station, for an empty query only.
    const bound = catalog.sources.filter((s) => s.origin === 'media');
    const recent =
      media.q === ''
        ? [...bound]
            .sort((a, b) => (b.media?.lastBoundAt ?? '').localeCompare(a.media?.lastBoundAt ?? ''))
            .slice(0, RECENT_MAX)
        : [];
    const shownIds = new Set([...inResults.keys(), ...recent.map((r) => r.id)]);
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
            loadThumbnail,
            preview,
            setPreview,
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
            inResults.get(r.id) ?? {
              id: r.id,
              name: r.name,
              durationMs: r.media?.durationMs,
              folder: r.media?.folder,
              width: r.media?.width,
              height: r.media?.height,
              unavailable: r.status === 'unavailable',
            },
            value,
            loadThumbnail,
            preview,
            setPreview,
          ),
        );
      }
      out.push({ kind: 'heading', key: 'All media', content: 'All media' });
    }
    for (const item of media.items) {
      out.push(mediaRow(`all:${item.id}`, item, value, loadThumbnail, preview, setPreview));
    }
    return out;
  }, [media.items, media.q, catalog, value, loadThumbnail, preview]);

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
    <div className="cg-picker-tab cg-picker-tab--media" data-picker-tab="media">
      <div className="cg-picker-media-results">
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
            data={{ 'data-picker-search': '', 'data-modal-autofocus': '' }}
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
              if (e.target instanceof Element && e.target.closest('button') !== null) return;
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
            withActions
          />
        )}
      </div>
      <section className="cg-picker-player" aria-label="Media preview">
        {preview === undefined ? (
          <div className="cg-picker-player__empty" data-picker-preview-empty="">
            <Icon icon={Film} size={28} />
            <p>Use Preview on a media item to watch it here.</p>
          </div>
        ) : (
          <SourceMediaPreview
            key={preview.id}
            id={preview.id}
            name={preview.name}
            durationMs={preview.durationMs}
            channel={previewChannel}
          />
        )}
      </section>
    </div>
  );
}
