import { useShellLayoutContext } from '../../hooks/shellLayoutContext.js';
import { MonitorPanel } from './MonitorPanel.js';

/**
 * The monitor strip: PREVIEW beside PROGRAM, in their final positions.
 *
 * ORDER IS PREVIEW-THEN-PROGRAM, left to right, which is the vision-mixer
 * convention every gallery already reads: what is NEXT on the left, what is ON
 * AIR on the right. Getting this backwards in a broadcast UI is not a cosmetic
 * complaint — an operator who reaches for the wrong box under time pressure is
 * looking at the wrong output.
 *
 * DELIBERATELY NOT RTL-FLIPPED. Persian/RTL is a core requirement of this
 * product and text throughout reverses, but PGM/PVW placement is a hardware
 * convention shared with the mixer, the multiviewer and the rack — those do not
 * flip, so neither does this. Recorded under "Decisions taken fast".
 *
 * When one of the two is taken FULLSCREEN the strip shows only that one. The
 * strip reads the focus itself rather than making the shell special-case a
 * monitor: the shell's job is "the workspace is fullscreen-ing something", and
 * which box that is belongs here.
 */
export function MonitorStrip(): JSX.Element {
  const { focus } = useShellLayoutContext();
  const showPvw = focus !== 'pgm';
  const showPgm = focus !== 'pvw';

  return (
    <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minHeight: 0 }}>
      {/*
        The copy below says what each output IS, in the operator's terms, and
        names no internal milestone or item number. An operator has no idea what
        an M- or C- number is, and the visible surface is not where the roadmap
        gets tracked. The pointer lives in `MonitorPanel`'s comment instead.
      */}
      {showPvw && (
        <MonitorPanel
          id="pvw"
          title="PREVIEW"
          detail="This is where the next graphic will appear, before it reaches air."
        />
      )}
      {showPgm && (
        <MonitorPanel
          id="pgm"
          title="PROGRAM"
          detail="This is where the on-air output will appear."
        />
      )}
    </div>
  );
}
