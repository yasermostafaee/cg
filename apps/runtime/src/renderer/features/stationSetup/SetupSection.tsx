import { useEffect, useRef, type ReactNode } from 'react';
import { colors } from '../../theme.js';
import { sectionSpec, type StationSetupSection } from './sections.js';

/**
 * ONE frame for every Station setup section: the heading, the commit legend beside it, and
 * the body. The frame is what makes "which contract is in force" legible per section — a
 * caller supplies its body and says nothing about how the heading reads.
 *
 * ── WHAT `STATION-CHROME-01` §2 TOOK OUT OF THIS FILE ───────────────────────
 *
 * The deep-link machinery. It used to carry `requested` / `requestId` and scroll itself into
 * view, because every section was rendered at once in one long list and a deep link had to
 * FIND its section. With a rail, the deep link SELECTS the tab and this is the only section
 * on screen — there is nothing to scroll to and nothing to hunt for. The dialog owns the
 * selection (`useEffect` on `requestId`), which keeps the number of things that move focus at
 * one (`B-230`): the modal's focus trap, at open.
 */
const styles = {
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.6rem',
  },
  heading: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '0.75rem',
    flexWrap: 'wrap' as const,
  },
  title: {
    fontSize: '0.95rem',
    fontWeight: 700,
    color: colors.text,
    margin: 0,
  },
  legend: { fontSize: '0.72rem', color: colors.textMuted },
} as const;

export function SetupSection({
  id,
  children,
}: {
  id: StationSetupSection;
  children: ReactNode;
}): JSX.Element {
  const spec = sectionSpec(id);
  const ref = useRef<HTMLElement>(null);

  /*
    A tab switch resets the pane's scroll. Without this, selecting a short tab after a long
    one leaves the pane scrolled to a position the new section does not have, which reads as
    a section rendered blank. Guarded: jsdom implements neither `scrollTo` on the element nor
    a layout to scroll.
  */
  useEffect(() => {
    const pane = ref.current?.parentElement;
    if (pane != null && typeof pane.scrollTo === 'function') pane.scrollTo({ top: 0 });
  }, [id]);

  return (
    <section
      ref={ref}
      style={styles.section}
      aria-label={spec.title}
      id={`station-setup-${id}`}
      data-station-section={id}
    >
      <div style={styles.heading}>
        <h3 style={styles.title}>{spec.title}</h3>
        <span style={styles.legend} data-section-commit={spec.commit}>
          {spec.legend}
        </span>
      </div>
      {children}
    </section>
  );
}
