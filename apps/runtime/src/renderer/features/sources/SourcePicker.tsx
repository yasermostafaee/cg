import { sourceDisplayName } from '../../ui/operatorNaming.js';
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
import { Cable, Check, ChevronDown, Film, Play } from 'lucide-react';
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
  type SourcePresenceView,
} from '@cg/shared-ipc';
import { Button } from '../../ui/Button.js';
import { ComboField } from '../../ui/ComboField.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { Popover } from '../../ui/Popover.js';
import { directionOf } from '../../ui/OperatorNames.js';
import { TabPanel, TabStrip } from '../../ui/Tabs.js';
import { Tag } from '../../ui/Tag.js';
import { TextInput } from '../../ui/TextInput.js';
import { VirtualList, type VirtualListHandle, type VirtualRow } from '../../ui/VirtualList.js';
import { InputAudioMeter, inputAudioSource } from './InputAudioMeter.js';
import { InputCatalogueServer } from './InputCatalogueServer.js';
import { InputThumbnail } from './InputThumbnail.js';
import { InputViewSwitch, type InputView } from './InputViewSwitch.js';
import {
  createMediaThumbnailLoader,
  MediaThumbnail,
  type MediaThumbnailLoader,
} from './MediaThumbnail.js';
import { SourceLabel, formatMediaDuration, labelledSource } from './SourceLabel.js';
import { useElementWidth } from '../../hooks/useElementWidth.js';
import { useSourcePreviewRoute } from '../../hooks/useProgramTopology.js';
import { useSourcePresence } from '../../hooks/useSourcePresence.js';
import { SourcePresenceBadges, sourcePresenceDescription } from './SourcePresenceBadges.js';
import {
  usePreviewOrigins,
  type PreviewEngine,
  type PreviewOriginChanged,
} from './usePreviewOrigins.js';
import { useInputCheckSurface, type InputCheckSurface } from '../monitors/liveInputCheckContext.js';
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
 * swap — share this picker. An option click stages a selection in the modal. Select returns the
 * choice to its host, where Save defaults, Update/Discard or the on-air swap has its normal scope.
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
 * typing debounced 250 ms, earlier results kept under a thin line while the next ones load. The
 * previews and the draft live inside the modal so Cancel leaves the host's binding intact.
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
  mediaThumbnail,
  showPicture = true,
  presence = null,
  presenceAccessible = true,
}: {
  choice: SourceChoice;
  meterChannel?: number | undefined;
  mediaThumbnail?: MediaThumbnailLoader | undefined;
  showPicture?: boolean;
  presence?: SourcePresenceView | null;
  presenceAccessible?: boolean;
}): JSX.Element {
  const { origins, publish } = usePreviewOrigins();
  if (choice.names === undefined) return <span className="cg-choice-label">{choice.label}</span>;
  if (choice.names === null) {
    return <span className="cg-choice-label">{`${choice.label} (none set)`}</span>;
  }
  const sourceId = choice.names;
  const source = labelledSource(choice.names);
  const name = source?.name ?? NOT_LISTED;
  const offered = source !== null && !source.unavailable;
  const input = meterChannel === undefined ? undefined : inputAudioSource(choice.names);
  return (
    <span className="cg-choice-label" data-choice-names={choice.names}>
      <span className="cg-choice-label__words">
        {`${choice.label} (`}
        <bdi dir={directionOf(name)} data-choice-name="">
          {name}
        </bdi>
        {')'}
      </span>
      {input !== undefined && showPicture && (
        <InputThumbnail
          source={input}
          channel={meterChannel}
          meterChannel={meterChannel}
          compact
          onPreviewEngineChange={(engine) => publish(input.id, engine)}
        />
      )}
      {input !== undefined && !showPicture && (
        <InputAudioMeter sourceId={sourceId} channel={meterChannel} name={name} />
      )}
      {source?.origin === 'media' && mediaThumbnail !== undefined && (
        <MediaThumbnail
          id={choice.names}
          load={mediaThumbnail}
          compact
          onPreviewEngineChange={(engine) => publish(sourceId, engine)}
        />
      )}
      <SourcePresenceBadges
        presence={presence}
        sourceId={choice.names}
        accessible={presenceAccessible}
        previewEngine={origins.get(choice.names)}
      />
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
  /** Called only when Select confirms a changed catalogue id or special value. */
  onChange: (value: string) => void;
  /** The call site's own choices, shown above the tabs. */
  choices: readonly SourceChoice[];
  /** The channel of the row being bound, for v1.3's per-channel inputs. Absent: no gating. */
  channel?: number | undefined;
  /** Snapshot authority when the choices themselves do not have channel gating. */
  previewChannel?: number | undefined;
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
const MEDIA_HEADING_HEIGHT = 28;
const MEDIA_TILE_GAP = 10;

/** A media page, and how near the end the next one is asked for. */
export const MEDIA_PAGE = 50;
const NEAR_END_ROWS = 10;
/** Typing settles for this long before the Playout is asked. */
export const SEARCH_DEBOUNCE_MS = 250;
/** A filter field appears only past this many inputs. */
const FILTER_OVER = 10;

type Tab = 'inputs' | 'media';
const isMediaId = (id: string): boolean => id.startsWith('md-');

export function SourcePicker({
  value,
  onChange,
  choices,
  channel,
  previewChannel,
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
  const [draft, setDraft] = useState<string | null>(null);

  const choice = choices.find((c) => c.value === value);
  const known = labelledSource(value) !== null;

  const close = useCallback(() => {
    setDraft(null);
    setOpen(false);
  }, []);
  const select = (): void => {
    if (draft === null) return;
    close();
    if (draft !== value) onChange(draft);
  };
  const thumbnailChannel = previewChannel ?? channel;
  const previewRoute = useSourcePreviewRoute(thumbnailChannel);
  const showingChoice = choice !== undefined && (value === '' || !known);
  const selectedSource = showingChoice ? choice.names : value;
  const posterIdentity = JSON.stringify(
    currentSourceCatalog().sources.find((source) => source.id === selectedSource),
  );
  // Keep the modal's poster cache across reopenings. A route or binding change gets a fresh cache.
  const loadThumbnail = useMemo(
    () => createMediaThumbnailLoader(thumbnailChannel),
    [thumbnailChannel, selectedSource, posterIdentity, previewRoute],
  );
  const selectedPresence = useSourcePresence(
    thumbnailChannel,
    selectedSource ? [selectedSource] : [],
  );
  const presenceDescription = sourcePresenceDescription(selectedPresence, selectedSource);
  const presenceDescriptionId = `${base}-source-presence`;

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
        aria-describedby={presenceDescription === undefined ? undefined : presenceDescriptionId}
        id={id}
        className={className}
        title={title}
        // The bound value as a finder reads it — a catalogue id, never shown.
        data={{ ...data, 'data-picker-value': value }}
      >
        {showingChoice ? (
          <span className="cg-source-label" data-source-label="choice">
            <ChoiceLabel
              choice={choice}
              meterChannel={thumbnailChannel}
              showPicture={false}
              presence={selectedPresence}
              presenceAccessible={false}
            />
          </span>
        ) : (
          <SourceLabel
            sourceId={value}
            meterChannel={thumbnailChannel}
            presence={selectedPresence}
            presenceAccessible={false}
            fallback={choices[0] !== undefined ? choiceText(choices[0]) : 'None'}
          />
        )}
      </ComboField>
      {presenceDescription !== undefined && (
        <span id={presenceDescriptionId} hidden>
          {presenceDescription}
        </span>
      )}
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
            <>
              <ModalAction actionRole="cancel" onClick={close}>
                Cancel
              </ModalAction>
              <ModalAction actionRole="primary" disabled={draft === null} onClick={select}>
                Select
              </ModalAction>
            </>
          }
        >
          <PickerPanel
            base={base}
            value={draft ?? value}
            choices={choices}
            channel={channel}
            previewChannel={thumbnailChannel}
            loadThumbnail={loadThumbnail}
            onPick={setDraft}
            initialTab={isMediaId(selectedSource ?? '') ? 'media' : 'inputs'}
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
  loadThumbnail,
}: {
  base: string;
  value: string;
  choices: readonly SourceChoice[];
  channel: number | undefined;
  previewChannel: number | undefined;
  onPick: (value: string) => void;
  initialTab: Tab;
  loadThumbnail: MediaThumbnailLoader;
}): JSX.Element {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [inputView, setInputView] = useState<InputView>('grid');
  const [mediaView, setMediaView] = useState<InputView>('grid');
  const tabChanged = useRef(false);
  const media = useMediaSearch();
  const catalog = currentSourceCatalog();
  const inputs = playoutInputsForDisplay(catalog.sources);
  const choice = choices.find((entry) => entry.value === value);
  const effectiveSource =
    choice !== undefined && (value === '' || labelledSource(value) === null)
      ? (choice.names ?? '')
      : value;
  const choicePresence = useSourcePresence(
    previewChannel,
    choices.flatMap(({ names }) => (names ? [names] : [])),
  );
  const { inputCheck } = useInputCheckSurface(previewChannel, tab === 'inputs');
  const chooseInput = (value: string, sourceId = value): void => {
    onPick(value);
    const source = inputs.find(({ id }) => id === sourceId);
    if (inputCheck === undefined) return;
    if (source !== undefined && canCheckLiveInput(source, inputCheck.channel)) {
      inputCheck.start(source);
    } else {
      inputCheck.stop();
    }
  };
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
              active={value === c.value}
              aria-pressed={value === c.value}
              data-picker-choice={c.value}
              onClick={() => chooseInput(c.value, c.names ?? '')}
            >
              {value === c.value && <Icon icon={Check} size={13} />}
              <ChoiceLabel
                choice={c}
                meterChannel={previewChannel}
                mediaThumbnail={loadThumbnail}
                presence={choicePresence}
              />
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
          inputCheck?.stop();
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
            value={effectiveSource}
            channel={channel}
            previewChannel={previewChannel}
            onPick={chooseInput}
            inputCheck={inputCheck}
            view={inputView}
            onViewChange={setInputView}
          />
        ) : (
          <MediaTab
            listId={`${base}-media`}
            value={effectiveSource}
            media={media}
            previewChannel={previewChannel}
            focusSearch={tabChanged.current}
            onPick={onPick}
            loadThumbnail={loadThumbnail}
            view={mediaView}
            onViewChange={setMediaView}
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
  setPointerActive: (index: number) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>, fromField?: boolean) => void;
} {
  const [active, setActiveState] = useState<number | null>(null);
  const selectedIndex = rows.findIndex((row) => row.kind === 'option' && row.selected === true);
  useEffect(() => {
    if (selectedIndex < 0) return;
    setActiveState(selectedIndex);
    list.current?.scrollToIndex(selectedIndex);
  }, [selectedIndex, tiled]);
  // A list that changed under the active row keeps a row that exists.
  useEffect(() => {
    if (active !== null && active >= rows.length) setActiveState(null);
  }, [rows.length, active]);
  const onKeyDown = (e: KeyboardEvent<HTMLElement>, fromField = false): void => {
    const verticalStep = tiled && !fromField ? (list.current?.columnCount() ?? 1) : 1;
    const move = (to: number | null): void => {
      e.preventDefault();
      if (to === null) return;
      setActiveState(to);
      list.current?.scrollToIndex(to);
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
      case ' ':
      case 'Enter':
        if (e.key === ' ' && fromField) return;
        if (active !== null) {
          e.preventDefault();
          pickAt(active);
        }
        return;
      default:
        return;
    }
  };
  // Pointer activation must keep row actions in place until the click is delivered.
  return { active, setPointerActive: setActiveState, onKeyDown };
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
  inputCheck?: InputCheckSurface | undefined;
  view: InputView;
  onViewChange: (view: InputView) => void;
}): JSX.Element {
  const [filter, setFilter] = useState('');
  const { origins, publish } = usePreviewOrigins();
  const list = useRef<VirtualListHandle>(null);
  const tiled = view === 'grid';
  const needle = filter.trim().toLowerCase();
  const shown =
    needle === ''
      ? inputs
      : inputs.filter((s) => sourceDisplayName(s.name, 'input').toLowerCase().includes(needle));
  const presence = useSourcePresence(
    previewChannel,
    shown.map(({ id }) => id),
  );
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
    const name = sourceDisplayName(source.name, 'input');
    const checkable = canCheckLiveInput(source, inputCheck?.channel ?? channel ?? 0);
    const disabled = !bindable || offChannel || loops || playlistDown;
    return {
      kind: 'option',
      key: source.id,
      ariaLabel: source.status === 'unavailable' ? `${name} Unavailable` : name,
      ariaDescription: sourcePresenceDescription(presence, source.id),
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
          onPreviewEngineChange={(engine) => publish(source.id, engine)}
          channel={previewChannel}
          meterChannel={offChannel ? undefined : previewChannel}
          inputCheck={checkable ? inputCheck : undefined}
          onCheck={checkable && !disabled ? () => onPick(source.id) : undefined}
        />
      ),
      content: (
        <span className="cg-picker-row">
          <Icon icon={Cable} size={14} />
          {/* `B-303` — the name in its own direction (`directionOf`), as `SourceLabel` draws it. */}
          <bdi className="cg-picker-row__name" dir={directionOf(name)}>
            {name}
          </bdi>
          <SourcePresenceBadges
            presence={presence}
            sourceId={source.id}
            accessible={false}
            previewEngine={origins.get(source.id)}
          />
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
        <InputViewSwitch view={view} onChange={onViewChange} />
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
          onActiveChange={keys.setPointerActive}
          onPick={pick}
          onKeyDown={(e) => {
            if (e.target instanceof Element && e.target.closest('button') !== null) return;
            keys.onKeyDown(e);
          }}
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

interface MediaPreviewSelection {
  readonly key: string;
  readonly item: MediaChoice;
  /** An explicit row Play action, distinct from merely selecting a source. */
  readonly playRequest?: number;
}

function mediaRow(
  key: string,
  item: MediaChoice,
  value: string,
  loadThumbnail: MediaThumbnailLoader,
  preview: MediaPreviewSelection | undefined,
  setPreview: (selection: MediaPreviewSelection) => void,
  presence: SourcePresenceView | null,
  grid: boolean,
  previewChannel: number | undefined,
  previewEngine: PreviewEngine | undefined,
  onPreviewEngineChange: PreviewOriginChanged,
): VirtualRow {
  const selected = item.id === value;
  const name = sourceDisplayName(item.name, 'media');
  const facts = [
    item.durationMs !== undefined ? formatMediaDuration(item.durationMs) : null,
    item.width !== undefined && item.height !== undefined
      ? `${String(item.width)}×${String(item.height)}`
      : null,
  ].filter((f): f is string => f !== null);
  const previewing = preview?.key === key;
  const canPreview = item.unavailable !== true || presence?.sources[item.id]?.B === 'present';
  const poster = (
    <MediaThumbnail
      id={item.id}
      load={loadThumbnail}
      onPreviewEngineChange={onPreviewEngineChange}
    />
  );
  const canPlay = previewChannel !== undefined && (item.durationMs ?? 0) > 1;
  const previewButton = canPreview && (!grid || canPlay) && (
    <Button
      variant={grid ? 'icon' : 'neutral'}
      className="cg-picker-preview-button"
      aria-label={`Preview · ${name}`}
      aria-pressed={previewing}
      title={grid ? 'Play preview' : undefined}
      data-picker-preview={item.id}
      onClick={() => setPreview({ key, item })}
    >
      <Icon icon={Play} size={14} />
      {!grid && <span>Preview</span>}
    </Button>
  );
  return {
    kind: 'option',
    key,
    selected,
    ariaDescription: sourcePresenceDescription(presence, item.id),
    data: { 'data-picker-media': item.id },
    trailing: grid ? (
      <div className="cg-picker-media-tile-picture">
        {previewing ? (
          <SourceMediaPreview
            key={item.id}
            id={item.id}
            name={name}
            durationMs={item.durationMs}
            channel={previewChannel}
            loadThumbnail={loadThumbnail}
            inline
            playRequest={preview.playRequest}
            onPreviewEngineChange={onPreviewEngineChange}
          />
        ) : (
          <>
            {poster}
            {previewButton}
          </>
        )}
      </div>
    ) : (
      previewButton
    ),
    content: (
      <span className="cg-picker-media">
        {!grid && poster}
        <span className="cg-picker-media__text">
          <span className="cg-picker-row">
            <Icon icon={Film} size={14} />
            <bdi className="cg-picker-row__name" dir={directionOf(name)}>
              {name}
            </bdi>
            <SourcePresenceBadges
              presence={presence}
              sourceId={item.id}
              accessible={false}
              previewEngine={previewEngine}
            />
            {item.unavailable === true && (
              <Tag className="cg-source-tag cg-source-tag--unavailable">Unavailable</Tag>
            )}
            {selected && <Icon icon={Check} size={14} />}
          </span>
          <span className="cg-picker-media__facts">
            {facts.map((f, i) => (
              <span key={f}>
                {i > 0 && ' · '}
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
  view,
  onViewChange,
}: {
  listId: string;
  value: string;
  media: MediaState;
  previewChannel: number | undefined;
  focusSearch: boolean;
  onPick: (value: string) => void;
  loadThumbnail: MediaThumbnailLoader;
  view: InputView;
  onViewChange: (view: InputView) => void;
}): JSX.Element {
  const list = useRef<VirtualListHandle>(null);
  const search = useRef<HTMLInputElement>(null);
  const sortAnchor = useRef<HTMLButtonElement>(null);
  const sortMenuId = useId();
  const [sortOpen, setSortOpen] = useState(false);
  const [preview, setPreview] = useState<MediaPreviewSelection>();
  const playSequence = useRef(0);
  const requestPreview = useCallback((selection: MediaPreviewSelection): void => {
    setPreview({ ...selection, playRequest: ++playSequence.current });
  }, []);
  const { origins, publish } = usePreviewOrigins();
  const grid = view === 'grid';
  const { ref: resultsRef, width } = useElementWidth<HTMLDivElement>();
  const resultsWidth = width ?? 1100;
  const columns = resultsWidth < 560 ? 1 : resultsWidth < 880 ? 2 : 3;
  const tileWidth = (resultsWidth - 16 - (columns - 1) * MEDIA_TILE_GAP) / columns;
  const tileHeight = Math.max(132, Math.round((tileWidth * 9) / 16 + 54));
  const catalog = currentSourceCatalog();

  // On initial open the modal's trap records and restores the launcher before moving focus.
  useEffect(() => {
    if (focusSearch) search.current?.focus();
  }, [focusSearch]);

  const bound = useMemo(
    () => catalog.sources.filter((source) => source.origin === 'media'),
    [catalog],
  );
  const presence = useSourcePresence(previewChannel, [
    ...media.items.map(({ id }) => id),
    ...(isMediaId(value) ? [value] : []),
  ]);

  const { rows, mediaByKey } = useMemo(() => {
    const out: VirtualRow[] = [];
    const mediaByKey = new Map<string, MediaChoice>();
    const addMedia = (key: string, item: MediaChoice): void => {
      mediaByKey.set(key, item);
      out.push(
        mediaRow(
          key,
          item,
          value,
          loadThumbnail,
          preview,
          requestPreview,
          presence,
          grid,
          previewChannel,
          origins.get(item.id),
          (engine) => publish(item.id, engine),
        ),
      );
    };
    const inResults = new Map(media.items.map((item) => [item.id, item]));
    // The current binding, pinned at the top when it is not otherwise in view.
    if (isMediaId(value) && !inResults.has(value)) {
      const current = labelledSource(value);
      const entry = bound.find((s) => s.id === value);
      out.push({ kind: 'heading', key: 'Current', content: 'Current' });
      addMedia(`current:${value}`, {
        id: value,
        name: current?.name ?? NOT_LISTED,
        durationMs: current?.durationMs,
        folder: entry?.media?.folder,
        width: entry?.media?.width,
        height: entry?.media?.height,
        unavailable: current?.unavailable ?? true,
      });
    }
    for (const item of media.items) addMedia(`all:${item.id}`, item);
    return { rows: out, mediaByKey };
  }, [
    media.items,
    bound,
    value,
    loadThumbnail,
    preview,
    requestPreview,
    presence,
    grid,
    previewChannel,
    origins,
    publish,
  ]);

  const chooseMedia = (index: number): void => {
    const key = rows[index]?.key;
    const item = key === undefined ? undefined : mediaByKey.get(key);
    if (key === undefined || item === undefined) return;
    onPick(item.id);
    if (!grid)
      setPreview(
        item.unavailable === true && presence?.sources[item.id]?.B !== 'present'
          ? undefined
          : { key, item },
      );
  };
  const keys = useListKeys(rows, list, chooseMedia, grid);

  const empty = !media.loading && media.failed === null && media.items.length === 0;
  return (
    <div
      className={
        grid ? 'cg-picker-tab cg-picker-tab--media-grid' : 'cg-picker-tab cg-picker-tab--media'
      }
      data-picker-tab="media"
      data-media-view={view}
    >
      <div className="cg-picker-media-results" ref={resultsRef}>
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
          <Button
            ref={sortAnchor}
            variant="neutral"
            aria-label="Sort media"
            aria-haspopup="dialog"
            aria-expanded={sortOpen}
            aria-controls={sortOpen ? sortMenuId : undefined}
            data-picker-sort={media.sort}
            onClick={() => setSortOpen(!sortOpen)}
          >
            {media.sort === 'name' ? 'Name' : 'Recent'}
            <Icon icon={ChevronDown} size={14} />
          </Button>
          {sortOpen && (
            <Popover
              anchor={sortAnchor}
              onClose={() => setSortOpen(false)}
              id={sortMenuId}
              aria-label="Sort media"
              minWidth={160}
              maxHeight={140}
              initialFocusSelector="[aria-checked=true]"
            >
              <div
                className="cg-picker-sort-options"
                role="menu"
                tabIndex={-1}
                aria-label="Media order"
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                  event.preventDefault();
                  const options = [
                    ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
                  ];
                  const current = options.indexOf(document.activeElement as HTMLButtonElement);
                  const step = event.key === 'ArrowDown' ? 1 : -1;
                  options[(current + step + options.length) % options.length]?.focus();
                }}
              >
                {(['name', 'recent'] as const).map((order) => (
                  <Button
                    key={order}
                    variant="ghost"
                    role="menuitemradio"
                    aria-checked={media.sort === order}
                    onClick={() => {
                      media.setSort(order);
                      setSortOpen(false);
                    }}
                  >
                    {order === 'name' ? 'Name' : 'Recent'}
                    {media.sort === order && <Icon icon={Check} size={14} />}
                  </Button>
                ))}
              </div>
            </Popover>
          )}
          <InputViewSwitch
            ariaLabel="Media view"
            view={view}
            onChange={(next) => {
              if (next === view) return;
              setPreview(undefined);
              onViewChange(next);
            }}
          />
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
            key={view}
            ref={list}
            id={listId}
            aria-label="Media"
            rows={rows}
            rowHeight={grid ? tileHeight : MEDIA_ROW}
            {...(grid && { columns, gap: MEDIA_TILE_GAP })}
            headingHeight={MEDIA_HEADING_HEIGHT}
            height={LIST_HEIGHT}
            activeIndex={keys.active}
            onActiveChange={keys.setPointerActive}
            onPick={chooseMedia}
            onKeyDown={(e) => {
              if (e.target instanceof Element && e.target.closest('button, input') !== null) return;
              // Typing in the list goes to the search field.
              if (e.key !== ' ' && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
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
      {!grid && (
        <section className="cg-picker-player" aria-label="Media preview">
          {preview === undefined ? (
            <div className="cg-picker-player__empty" data-picker-preview-empty="">
              <Icon icon={Film} size={28} />
              <p>Use Preview on a media item to watch it here.</p>
            </div>
          ) : (
            <SourceMediaPreview
              key={preview.key}
              id={preview.item.id}
              name={sourceDisplayName(preview.item.name, 'media')}
              durationMs={preview.item.durationMs}
              channel={previewChannel}
              loadThumbnail={loadThumbnail}
              playRequest={preview.playRequest}
            />
          )}
        </section>
      )}
    </div>
  );
}
