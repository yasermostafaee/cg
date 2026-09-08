import { useEffect, useRef, type ReactNode } from 'react';
import { contractTag, sectionSpec, type StationSetupSection } from './sections.js';

/**
 * ONE frame for every Station setup section: the heading, the commit legend beside it, and
 * the body. The frame is what makes "which contract is in force" legible per section — a
 * caller supplies its body and says nothing about how the heading reads.
 *
 * ── `RUNTIME-REDESIGN-01` PHASE 7 — THE HEAD IS THE REFERENCE'S `.section-head` ─────────
 *
 * As rendered (`09-channel-settings.html`, 1280 × 800): the title as a 24 px `h2`, the legend
 * as the 14 px DESCRIPTION under it, and the commit contract as a TAG at the end of the row
 * (`Read only` · `Apply together` · `Auto-save`). Three pieces from ONE spec (`sections.ts`), so
 * the tag, the description and the footer's standing sentence are one fact told three ways
 * and cannot disagree. Geometry from `--r-setup-*` (`STATION_SETUP_PX`); no literal here.
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
    <section ref={ref} aria-label={spec.title} id={`station-setup-${id}`} data-station-section={id}>
      <div className="cg-setup-head">
        <div>
          <h2 className="cg-setup-title">{spec.title}</h2>
          <p className="cg-setup-description">{spec.legend}</p>
        </div>
        <span className="cg-setup-tag" data-section-commit={spec.commit}>
          {contractTag(spec.commit)}
        </span>
      </div>
      <div className="cg-setup-body">{children}</div>
    </section>
  );
}
