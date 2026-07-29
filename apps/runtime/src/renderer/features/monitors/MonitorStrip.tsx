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
      {showPvw && (
        <MonitorPanel
          id="pvw"
          title="PREVIEW"
          detail="The next graphic, before it reaches air. Frame grabs arrive with the full monitor (M9)."
        />
      )}
      {showPgm && (
        <MonitorPanel
          id="pgm"
          title="PROGRAM"
          detail="What is on air right now. Frame grabs arrive with the full monitor (M9)."
        />
      )}
    </div>
  );
}
