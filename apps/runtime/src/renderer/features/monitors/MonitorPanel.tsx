import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Columns2, MonitorOff, Rows2, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import type { PgmEngine } from '@cg/shared-ipc';
import { colors, cssVars } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Panel } from '../../ui/Panel.js';
import { Popover } from '../../ui/Popover.js';
import { RangeInput } from '../../ui/RangeInput.js';
import { MonitorHead, MonitorHeadFact, MonitorSignalStrip } from '../../ui/MonitorHead.js';
import { IsolatedName, isolateText } from '../../ui/OperatorNames.js';
import type { PanelId } from '../../hooks/useShellLayout.js';
import type { ProgramReturn, ProgramSignal } from '../../hooks/useProgramReturn.js';
import type { PgmAudio } from '../../hooks/usePgmAudio.js';
import { LoudnessBadge, VuMeter } from './VuMeter.js';
import { playlistTag, type ChannelAir } from '../channels/channelAir.js';
import type {
  ProgramAudioChoice,
  ProgramDisplayMode,
  ProgramMonitorPreferences,
} from './useProgramMonitorPreferences.js';

/**
 * The PROGRAM output box — `C-016`'s programme return: what the Playout is putting on air,
 * read by the bridge from the Playout's own `pgm` feed and relayed on this console's origin.
 *
 * 🔴 **A PICTURE ONLY WHILE THE BRIDGE VOUCHES FOR IT.** The picture is shown only while the
 * bridge reports the channel `live`. A stalled feed leaves the browser holding its last frame,
 * and a frozen frame on a PROGRAM monitor reads as "nothing is changing on air" — the worst
 * thing this box could say falsely. So any other state HIDES the picture and says what is true,
 * in the strip and on the screen: **No return signal** or **Return feed stalled**.
 *
 * WHY THE EMPTY BOX STILL NEEDS WORDS. A plain black rectangle in a broadcast UI is what a DEAD
 * FEED looks like. An operator glancing at it at 2 a.m. has to decide whether transmission just
 * died. The words are about the FEED, never about air — the Playout is very probably still
 * transmitting — which is why the strip keeps the rows-on-air count beside them (`MONITORS-01`).
 * The words are the only prose here: no sentence explains the feature (the design system's
 * operator-surface rule; the old "This will show what is on air…" line is gone with the gap it
 * described).
 *
 * ⚠ **THE `<img>` IS THE DEMAND.** The bridge holds the Playout feed open exactly as long as
 * some console holds the picture open, so the element is mounted only while this pane renders
 * (never while the monitors are hidden, the boot state), and on unmount its request is
 * ABORTED explicitly — a detached image may otherwise go on loading until it is collected.
 *
 * Item numbers live in this comment and NEVER in the visible copy. Fullscreen comes from
 * `Panel`, not from here.
 */

const styles = {
  /**
   * `PLAYOUT-FEATURES-01` E — the screen and the meter side by side. A size container, so the meter can
   * drop to two bars when the panel is too narrow for eight (`controls.css`).
   */
  stage: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    containerType: 'inline-size' as const,
  },
  pictures: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    gap: '0.35rem',
  },
  /** The video area. Black because that is what a video area is. */
  screen: {
    position: 'relative' as const,
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    background: cssVars['--r-video-ground'],
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.4rem',
    // A hairline inset so the black box reads as a SCREEN inside the panel
    // rather than a hole punched through it.
    boxShadow: `inset 0 0 0 1px ${colors.border}`,
    color: colors.offline,
    textAlign: 'center' as const,
    padding: '0.5rem',
    overflow: 'hidden',
  },
  /** The return, letterboxed inside the screen whatever its raster (640×360, or 640×512 PAL). */
  picture: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
  },
  label: {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  },
  tileLabel: {
    position: 'absolute' as const,
    insetBlockStart: '0.4rem',
    insetInlineStart: '0.45rem',
    zIndex: 2,
    borderRadius: '0.25rem',
    padding: '0.18rem 0.35rem',
    background: cssVars['--r-monitor-label-bg'],
    color: colors.text,
    fontSize: '0.68rem',
    fontWeight: 800,
    letterSpacing: '0.04em',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.2rem',
  },
  /** `RELEASE-0113-01` — this channel's backup line: one line under the screen, muted while it is mapped. */
  backupLine: {
    margin: 0,
    padding: '0.25rem 0.5rem 0',
    fontSize: '0.72rem',
    color: colors.textMuted,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  /** …and in the warning ink while nothing for this channel reaches the backup. */
  backupLineWarn: { color: colors.pending, fontWeight: 700 },
} as const satisfies Record<string, CSSProperties>;

/** The ONE place the pane's signal is put into words — the strip and the screen both read it. */
export const PROGRAM_SIGNAL_WORDS: Readonly<Record<ProgramSignal, string>> = {
  live: 'Return signal',
  stalled: 'Return feed stalled',
  none: 'No return signal',
};

export interface ProgrammeMonitorTarget {
  readonly engine: PgmEngine;
  readonly physicalChannel: number | null;
  readonly name?: string;
  readonly resourceKey?: string;
  readonly meterEngine?: Extract<PgmEngine, 'A' | 'B'> | undefined;
  readonly active?: boolean;
}

interface Props {
  id: Extract<PanelId, 'pgm' | 'pvw'>;
  /** PROGRAM — the header text and the accessible name. */
  title: string;
  /** The output's word in the head — `PROGRAM`. `title` stays the accessible name. */
  word: string;
  /** The channel this pane shows, or `null` before the bank has answered. */
  channel: number | null;
  /**
   * 🔴 `CONSOLE-MATCH-03` §1 — how many rows this console believes are on air.
   *
   * It is passed in and never counted here: `airTally` owns that number (`B-213`), and a
   * second count on a second surface is precisely how two numbers about air come to disagree.
   */
  onAirRows: number;
  /** The visible physical returns, each keyed by stable engine identity. */
  returns: readonly (ProgrammeMonitorTarget & { readonly programReturn: ProgramReturn })[];
  /** Undefined for a legacy station using A/B configuration. */
  topologyTargets?: readonly ProgrammeMonitorTarget[] | undefined;
  /** `PLAYOUT-FEATURES-01` E — the programme's SOUND at this console, lifted beside the return. */
  programSound: PgmAudio;
  monitorPreferences: ProgramMonitorPreferences;
  backupAvailable: boolean;
  /**
   * 🔴 `UI-POLISH-01` G — the Playout's `output` and `playlist` for `channel` (`NO_AIR` when it said
   * nothing). `output` alone colours the head; the playlist is a neutral tag and never a colour.
   */
  air: ChannelAir;
  /**
   * 🔴 `RELEASE-0113-01` (`B-316`, `R-089`) — THIS channel's backup line (`Backup: CH M on <host>`, or that
   * nothing reaches the backup), with its reason on `title`; `null` with no server B. Only this channel's.
   */
  backupLine?: {
    readonly text: string;
    readonly title?: string;
    readonly mapped: boolean;
    readonly channel?: number;
  } | null;
  /** R-111 — session-only layout choices while this monitor is maximized. */
  companionActions?: ReactNode;
}

/** The head's neutral tags: `Output unknown` when it is, then the playlist's state in its words. */
export function programHeadTags(air: ChannelAir): string[] {
  return [
    ...(air.output === 'unknown' ? ['Output unknown'] : []),
    ...(air.playlist !== null ? [playlistTag(air.playlist)] : []),
  ];
}

function ProgramVolume({ sound }: { sound: PgmAudio }): JSX.Element {
  const anchor = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        ref={anchor}
        variant="ghost"
        aria-label="Monitor volume"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={`Monitor volume ${String(sound.volume)}% · this console only`}
        onClick={() => setOpen(!open)}
      >
        <Icon icon={SlidersHorizontal} size={13} />
      </Button>
      {open && (
        <Popover
          anchor={anchor}
          onClose={() => setOpen(false)}
          id={id}
          aria-label="Monitor volume"
          minWidth={192}
          maxHeight={100}
          initialFocusSelector="input"
        >
          <label className="cg-pgm-volume">
            <span>
              Volume <output>{String(sound.volume)}%</output>
            </span>
            <RangeInput
              min={0}
              max={100}
              value={sound.volume}
              aria-label="Volume"
              onChange={(event) => sound.setVolume(event.currentTarget.valueAsNumber)}
            />
          </label>
        </Popover>
      )}
    </>
  );
}

export function MonitorPanel({
  id,
  title,
  word,
  channel,
  onAirRows,
  returns,
  programSound,
  monitorPreferences,
  backupAvailable,
  topologyTargets,
  air,
  backupLine = null,
  companionActions,
}: Props): JSX.Element {
  const liveCount = returns.filter((item) => item.programReturn.signal === 'live').length;
  const stalled = returns.some((item) => item.programReturn.signal === 'stalled');
  const overallSignal: ProgramSignal =
    liveCount === returns.length && returns.length > 0 ? 'live' : stalled ? 'stalled' : 'none';
  const words =
    returns.length > 1
      ? `${String(liveCount)} of ${String(returns.length)} return signals`
      : PROGRAM_SIGNAL_WORDS[returns[0]?.programReturn.signal ?? 'none'];
  const legacy = topologyTargets === undefined;
  const pictureModes = new Set<ProgramDisplayMode>(
    legacy ? ['A', 'B'] : topologyTargets.map(({ engine }) => engine),
  );
  if (legacy || pictureModes.size > 1) {
    if (monitorPreferences.display !== 'both') pictureModes.add(monitorPreferences.display);
    pictureModes.add('both');
  }
  const selectName = (engine: PgmEngine): string => {
    const name = topologyTargets?.find((target) => target.engine === engine)?.name;
    return name === undefined ? engine : `${engine} · ${isolateText(name)}`;
  };
  const selectedAudio = monitorPreferences.audioEngine;
  const audioModes = new Set<PgmEngine>(
    legacy ? ['A', 'B'] : topologyTargets.map(({ engine }) => engine),
  );
  if (monitorPreferences.audio !== 'follow') audioModes.add(monitorPreferences.audio);
  const grid = returns.length > 2;
  const displayControls = (
    <div
      style={styles.controls}
      className="cg-pgm-source-controls"
      data-pgm-topology-controls={legacy ? undefined : ''}
    >
      <div style={styles.controls} role="group" aria-label="Programme picture source">
        {[...pictureModes].map((mode) => (
          <Button
            key={mode}
            variant="ghost"
            aria-pressed={monitorPreferences.display === mode}
            data-toggle-on={monitorPreferences.display === mode ? '' : undefined}
            data-pgm-display-mode={mode}
            title={
              mode === 'both'
                ? legacy
                  ? 'Show A and B'
                  : 'Show all programme returns'
                : `Show server ${selectName(mode)}`
            }
            onClick={() => monitorPreferences.setDisplay(mode)}
          >
            {mode === 'both' ? (legacy ? 'A+B' : 'All') : mode}
          </Button>
        ))}
      </div>
      {monitorPreferences.display === 'both' && (legacy || returns.length === 2) && (
        <div style={styles.controls} role="group" aria-label="Programme picture layout">
          {(['horizontal', 'vertical'] as const).map((layout) => (
            <Button
              key={layout}
              variant="ghost"
              aria-label={`${layout === 'horizontal' ? 'Horizontal' : 'Vertical'} programme layout`}
              aria-pressed={monitorPreferences.layout === layout}
              data-toggle-on={monitorPreferences.layout === layout ? '' : undefined}
              data-pgm-layout-choice={layout}
              title={`${layout === 'horizontal' ? 'Horizontal' : 'Vertical'} ${legacy ? 'A+B' : 'programme'} layout`}
              onClick={() => monitorPreferences.setLayout(layout)}
            >
              <Icon icon={layout === 'horizontal' ? Columns2 : Rows2} size={13} />
            </Button>
          ))}
        </div>
      )}
    </div>
  );
  const audioControls = (
    <div style={styles.controls} className="cg-pgm-source-controls">
      <select
        className="cg-pgm-audio-select"
        aria-label="Programme sound source"
        title={legacy ? 'Local programme sound and meter source' : 'Local programme sound source'}
        value={monitorPreferences.audio}
        onChange={(event) =>
          monitorPreferences.setAudio(event.currentTarget.value as ProgramAudioChoice)
        }
      >
        <option value="follow">Follow</option>
        {[...audioModes].map((engine) => (
          <option key={engine} value={engine}>
            {selectName(engine)}
          </option>
        ))}
      </select>
      <Button
        variant="ghost"
        aria-pressed={programSound.on}
        data-toggle-on={programSound.on ? '' : undefined}
        data-pgm-audio={programSound.status}
        aria-label="Programme sound"
        title={
          selectedAudio === null
            ? 'No active programme sound source'
            : `Programme sound from ${selectName(selectedAudio)} — this console only`
        }
        onClick={programSound.toggle}
      >
        <Icon icon={programSound.on ? Volume2 : VolumeX} size={13} />
      </Button>
      <ProgramVolume sound={programSound} />
    </div>
  );
  const meterMember = topologyTargets?.find(
    ({ engine, physicalChannel }) => engine === selectedAudio && physicalChannel !== null,
  );
  const meterEngine = legacy ? (selectedAudio ?? 'A') : (meterMember?.meterEngine ?? null);
  const meterChannel = (legacy ? selectedAudio === 'A' || backupAvailable : meterEngine !== null)
    ? channel
    : null;
  return (
    <Panel
      id={id}
      title={title}
      compactHead
      /*
        🔴 `UI-POLISH-01` G — the head is GREEN ONLY WHILE the Playout says the channel is on air, and
        the playlist is a neutral tag beside it: the owner's multi-box case (playlist STOPPED, output
        ON AIR) keeps the green. The return-feed words below are about the FEED and stay as they are.
      */
      heading={
        <MonitorHead
          word={word}
          channel={channel}
          tone="pgm"
          output={air.output}
          tags={programHeadTags(air)}
        />
      }
      /*
        `Server return` — the reference's standing label for what this pane is FOR. It is not
        a state (the state is on the strip below); it names the source, so an operator reading
        a black box knows what would have filled it.
      */
      actions={
        <>
          {displayControls}
          {companionActions}
        </>
      }
      /* REPAIR-03 A1, audit row 38 — the monitor box's own ground (--r-monitor-bg), a
         shade below the panels around it so the screen reads as inset. */
      style={{
        flex: 1,
        minWidth: 0,
        background: cssVars['--r-monitor-bg'],
        borderRadius: cssVars['--r-monitor-card-radius'],
      }}
    >
      {/*
        🔴 THE STRIP, and the reason its two facts sit side by side.

        The signal is about the FEED and `N rows on air` is about AIR, and the whole point of
        showing them together is that an operator must never read the first as the second.
      */}
      <MonitorSignalStrip
        signal={words}
        tone={overallSignal}
        /*
          `PLAYOUT-FEATURES-01` E — the selected Playout engine's short-term loudness for this channel.
          An unmapped B stays unknown because it is not read — never a reading at the floor.
        */
        reading={
          meterEngine !== null && <LoudnessBadge channel={meterChannel} engine={meterEngine} />
        }
        /*
          🔴 `PLAYOUT-FEATURES-01` E — THE PROGRAMME'S SOUND, at THIS console only: off by default, a
          pressed toggle while on (`data-toggle-on`, as PVW's guides), remembered per console.
          An unmapped B opens no sound resource; selecting it never silently plays A.
        */
        action={audioControls}
        fact={
          <MonitorHeadFact
            testId="data-monitor-air-count"
            title="What this console believes is on air on this channel. It is the same count the layer table's header carries."
          >
            {onAirRows} {onAirRows === 1 ? 'row' : 'rows'} on air
          </MonitorHeadFact>
        }
      />
      {/*
        `role="img"` with a name, NOT a bare decorative box: a screen reader user needs the same
        fact a sighted operator gets — there is an output here, and what state its return is in.
      */}
      <div style={styles.stage} data-pgm-stage="">
        <div
          style={{
            ...styles.pictures,
            ...(grid
              ? {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
                }
              : { flexDirection: monitorPreferences.layout === 'vertical' ? 'column' : 'row' }),
          }}
          className="cg-pgm-pictures"
          data-pgm-picture-count={returns.length}
          data-pgm-layout={grid ? 'grid' : monitorPreferences.layout}
        >
          {returns.map(({ engine, physicalChannel, programReturn, name, active }) => {
            const { src, signal, onError } = programReturn;
            const tileWords = PROGRAM_SIGNAL_WORDS[signal];
            return (
              <div
                key={engine}
                style={styles.screen}
                role="img"
                aria-label={`${title} ${selectName(engine)} CH ${String(physicalChannel ?? '—')}${active === true ? ' Active' : ''} — ${tileWords}`}
                data-pgm-screen={engine}
                data-pgm-active={active === true ? '' : undefined}
              >
                <span style={styles.tileLabel} className="cg-pgm-tile-label" dir="ltr">
                  {engine} · CH {physicalChannel ?? '—'}
                  {name !== undefined && (
                    <>
                      {' '}
                      · <IsolatedName title={name}>{name}</IsolatedName>
                    </>
                  )}
                  {active === true && <span className="cg-pgm-tile-active">Active</span>}
                </span>
                {src !== null && (
                  <ProgramPicture
                    key={src}
                    src={src}
                    visible={signal === 'live'}
                    onError={onError}
                  />
                )}
                {signal !== 'live' && (
                  <>
                    <Icon icon={MonitorOff} size={22} />
                    <span style={styles.label}>{tileWords}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {/* `PLAYOUT-FEATURES-01` E — the programme meter, the Playout's own levels, beside the picture. */}
        {meterEngine !== null && <VuMeter channel={meterChannel} engine={meterEngine} />}
      </div>
      {/*
        🔴 `RELEASE-0113-01` (`B-316`, `R-089`) — WHERE THIS CHANNEL'S LINES GO ON THE BACKUP ENGINE, in this
        channel's own view and nobody else's: its mirror's own number and host, or that nothing reaches the
        backup. Words only; the reason rides the `title`.
      */}
      {backupLine !== null && (
        <p
          style={
            backupLine.mapped
              ? styles.backupLine
              : { ...styles.backupLine, ...styles.backupLineWarn }
          }
          data-backup-channel-line={backupLine.mapped ? 'mapped' : 'not-mapped'}
          {...(backupLine.title !== undefined ? { title: backupLine.title } : {})}
        >
          {backupLine.text}
        </p>
      )}
    </Panel>
  );
}

/**
 * The relayed picture: an `<img>` on a `multipart/x-mixed-replace` stream, which the browser
 * repaints part by part with no script involved. Mounted whenever there is a URL (its request
 * IS the watch), VISIBLE only while `live`.
 *
 * ⚠ The request is aborted on unmount by removing `src` — the HTML spec's "abort the image
 * request" path. An element React has let go of is otherwise still an image loading a stream,
 * and the bridge would go on pulling the Playout's feed for a picture nobody can see.
 */
function ProgramPicture({
  src,
  visible,
  onError,
}: {
  src: string;
  visible: boolean;
  onError: () => void;
}): JSX.Element {
  const ref = useRef<HTMLImageElement>(null);
  /*
    🔴 `FIELD-FIXES-01` H — **THE EFFECT OWNS `src`, BOTH HALVES.** It used to be a prop, with only
    its removal in the cleanup. React's StrictMode — every DEVELOPMENT build, which is what the dev
    station's Vite serves — mounts, unmounts and mounts again, and never re-applies an unchanged
    prop: the simulated unmount removed `src`, nothing put it back, and the pane requested NOTHING,
    so the relay had no viewer and the pane read "No return signal" beside a working feed. A
    production build (the installed app, and every e2e on `dist`) runs the effect once, which is
    why nothing that loaded `dist` could see it. Set on every mount, removed on every unmount.
  */
  useLayoutEffect(() => {
    const img = ref.current;
    if (img === null) return undefined;
    img.setAttribute('src', src);
    return () => {
      img.removeAttribute('src');
    };
  }, [src]);
  return (
    <img
      ref={ref}
      alt=""
      data-pgm-picture=""
      onError={onError}
      style={{ ...styles.picture, visibility: visible ? 'visible' : 'hidden' }}
    />
  );
}
