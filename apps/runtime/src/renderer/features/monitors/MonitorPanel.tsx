import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { MonitorOff } from 'lucide-react';
import { colors, cssVars } from '../../theme.js';
import { Icon } from '../../ui/Icon.js';
import { Panel } from '../../ui/Panel.js';
import { MonitorHead, MonitorHeadFact, MonitorSignalStrip } from '../../ui/MonitorHead.js';
import type { PanelId } from '../../hooks/useShellLayout.js';
import type { ProgramReturn, ProgramSignal } from '../../hooks/useProgramReturn.js';

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
  /** The video area. Black because that is what a video area is. */
  screen: {
    position: 'relative' as const,
    flex: 1,
    minHeight: 0,
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
} as const satisfies Record<string, CSSProperties>;

/** The ONE place the pane's signal is put into words — the strip and the screen both read it. */
export const PROGRAM_SIGNAL_WORDS: Readonly<Record<ProgramSignal, string>> = {
  live: 'Return signal',
  stalled: 'Return feed stalled',
  none: 'No return signal',
};

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
  /** The programme return for `channel` — lifted to the strip, like the air count. */
  programReturn: ProgramReturn;
}

export function MonitorPanel({
  id,
  title,
  word,
  channel,
  onAirRows,
  programReturn,
}: Props): JSX.Element {
  const { src, signal, onError } = programReturn;
  const words = PROGRAM_SIGNAL_WORDS[signal];
  return (
    <Panel
      id={id}
      title={title}
      compactHead
      heading={<MonitorHead word={word} channel={channel} tone="pgm" />}
      /*
        `Server return` — the reference's standing label for what this pane is FOR. It is not
        a state (the state is on the strip below); it names the source, so an operator reading
        a black box knows what would have filled it.
      */
      actions={<MonitorHeadFact>Server return</MonitorHeadFact>}
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
        tone={signal}
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
      <div style={styles.screen} role="img" aria-label={`${title} — ${words}`} data-pgm-screen="">
        {src !== null && (
          <ProgramPicture key={src} src={src} visible={signal === 'live'} onError={onError} />
        )}
        {signal !== 'live' && (
          <>
            <Icon icon={MonitorOff} size={22} />
            <span style={styles.label}>{words}</span>
          </>
        )}
      </div>
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
