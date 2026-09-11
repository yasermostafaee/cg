import type { ReactNode } from 'react';
import { Icon } from './Icon.js';
import { Circle } from 'lucide-react';

/**
 * 🔴 `CONSOLE-MATCH-03` §1 — THE MONITOR HEAD, AND WHY IT IS ONE COMPOSITION.
 *
 * The reference draws both panes' heads to the same rule — an `h2` naming the output with the
 * CHANNEL in a nested span, a spacer, one right-hand fact, and the expand control — and it
 * accents them differently (PVW purple, PGM mint) so a glance tells the two apart before a word
 * is read. Measured in Chromium at 1280 × 800 on `04-playout-layers.html` (never off the
 * stylesheet — four waves, last one paints, `PROMPT.md` §0):
 *
 *   `.monitor-head`   626 × 32   `padding: 3px 9px`, `gap: 8px`, ground `rgb(32 43 58)`
 *   `.pvw-label`      11 px / 650 / `letter-spacing: .825px`, `rgb(195 172 255)`
 *   `.pgm-label`      the same box in `rgb(133 228 182)`
 *   `.pvw-count`      11 px / 400
 *
 * ⚠ ONE composition and not two, for the reason golden rule 11 gives about naming: two heads
 * that must look alike and are written twice are two heads that will stop looking alike. What
 * DIFFERS between them is passed in — the word, the accent, the right-hand fact — and what is
 * shared cannot drift.
 *
 * The channel rides INSIDE the label because that is what it qualifies: this is PREVIEW *of
 * channel 1*, not PREVIEW beside an unrelated number.
 */
export function MonitorHead({
  word,
  channel,
  tone,
}: {
  /** `PREVIEW` / `PROGRAM` — the output, in the operator's word. */
  word: string;
  /** The channel this pane is showing. `null` before the bank has answered. */
  channel: number | null;
  tone: 'pvw' | 'pgm';
}): JSX.Element {
  return (
    <span className={`cg-monitor-label cg-monitor-label--${tone}`}>
      {word}
      {channel !== null && <span className="cg-monitor-ch">CH {channel}</span>}
    </span>
  );
}

/**
 * The right-hand fact in a monitor head — a count, or a standing label.
 *
 * `title` is where the DETAIL goes (golden rule 11's relocation): the head says `2 layers on
 * PVW` and the hover names the rows, because the sentence the operator reads under pressure
 * is the count and the names are what he asks for second.
 */
export function MonitorHeadFact({
  children,
  title,
  testId,
}: {
  children: ReactNode;
  title?: string | undefined;
  testId?: string | undefined;
}): JSX.Element {
  return (
    <span
      className="cg-monitor-fact"
      {...(title !== undefined ? { title } : {})}
      {...(testId !== undefined ? { [testId]: '' } : {})}
    >
      {children}
    </span>
  );
}

/**
 * 🔴 `CONSOLE-MATCH-03` §1 — THE PGM SIGNAL STRIP: what the return signal is doing, and how many
 * rows this console believes are on air.
 *
 * The reference's `.pgm-strip` is the same 31 px `monitor-controls` row the PVW transport
 * sits in, carrying a signal dot, its state in words, a spacer, and the air count. The two
 * facts are DELIBERATELY on one line and DELIBERATELY not merged: the left is about the
 * RETURN FEED (which does not exist — `MONITORS-01`/`C-016`) and the right is about AIR, and
 * an operator who reads "no signal" must not conclude "nothing is on air". That is exactly
 * what the reference's own `Playout may still be active.` says on the stage below it.
 */
export function MonitorSignalStrip({
  signal,
  fact,
}: {
  signal: string;
  fact: ReactNode;
}): JSX.Element {
  return (
    <div className="cg-monitor-strip" data-monitor-pgm-strip="">
      <span className="cg-monitor-signal">
        <Icon icon={Circle} size={7} />
        {signal}
      </span>
      <span className="cg-monitor-strip__spacer" />
      {fact}
    </div>
  );
}
