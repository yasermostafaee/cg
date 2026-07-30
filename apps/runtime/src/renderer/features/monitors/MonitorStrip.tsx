import { MonitorOff } from 'lucide-react';
import { useShellLayoutContext } from '../../hooks/shellLayoutContext.js';
import { MonitorPanel } from './MonitorPanel.js';
import { PreviewPanel } from './PreviewPanel.js';

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
export function MonitorStrip({ selectedId }: { selectedId: string | null }): JSX.Element {
  const { focus } = useShellLayoutContext();
  const showPvw = focus !== 'pgm';
  const showPgm = focus !== 'pvw';

  return (
    /*
      `minWidth: 0` IS LOad-BEARING, not defensive tidying.

      The rehearsal iframe is sized to the CHANNEL RASTER (1920px) on purpose —
      that is what makes the page inside compute its real on-air placement — and a
      CSS `transform: scale()` shrinks how it LOOKS without changing what it
      OCCUPIES. Without a floor of zero here the strip takes its width FROM that
      1920px child instead of from its column, and two things follow: PROGRAM is
      pushed off the right of the viewport, and `RehearsalStage` then measures its
      fit against the blown-out box and computes a scale of ~1 — so the rehearsal
      renders unscaled until some unrelated re-render happens to re-measure it
      against a settled box. One missing floor, both symptoms.
    */
    <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minHeight: 0, minWidth: 0 }}>
      {/*
        The copy says what each output IS and why it is blank, in the operator's
        terms, naming no internal item number — the visible surface is not where
        the roadmap gets tracked. The pointers live in `MonitorPanel`'s comment.

        The two empty states are DIFFERENT ON PURPOSE. PREVIEW is a local browser
        render with no server involvement, so it has nothing to connect to and a
        "not connected" label would send an operator hunting for a link that is
        not part of the design. Only PROGRAM is genuinely waiting for a feed.
      */}
      {/*
        R-022 — PREVIEW is no longer a reserved empty box: it renders the rehearsal
        for a row the operator has put into REHEARSE. It gets its own component
        rather than props on `MonitorPanel`, because it now has behaviour (which
        rehearsal to show, the retained page, the channel raster, the operator's
        staged values) while PROGRAM is still genuinely awaiting a feed (C-016).
      */}
      {showPvw && <PreviewPanel selectedId={selectedId} />}
      {showPgm && (
        <MonitorPanel
          id="pgm"
          title="PROGRAM"
          icon={MonitorOff}
          emptyLabel="No program return"
          detail="This will show what is on air, returned from the playout server. No return feed is arriving yet."
        />
      )}
    </div>
  );
}
