import { useEffect, useRef, type ReactNode } from 'react';
import { colors } from '../../theme.js';
import { sectionSpec, type StationSetupSection } from './sections.js';

/**
 * ONE frame for every Station setup section: the heading, the commit legend beside it, a
 * stable anchor for the deep link, and the body. The frame is what makes "which contract is
 * in force" legible per section (`R-054` correction 1) — a caller supplies its body and
 * says nothing about how the heading reads.
 *
 * ── THE DEEP LINK, AND WHO MOVES FOCUS ──────────────────────────────────────
 *
 * The REQUESTED section carries `data-modal-autofocus`, so the modal's focus trap lands
 * focus on it at open — ONE thing moves focus (`B-230`), and this is not a second mover.
 * A request that arrives while the dialog is ALREADY open (SOURCES pressed with the
 * dialog sitting at Servers) cannot re-arm the trap, so that case, and the scroll in both
 * cases, is this frame's own effect keyed on the request id. `scrollIntoView` is guarded:
 * jsdom does not implement it, and a deep link that threw in a test would hide a real one.
 */
const styles = {
  section: {
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.6rem 0.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
    // The section's own outline on focus is the deep link's cue; the primitive's body has
    // no other way to say "you were brought HERE".
    scrollMarginTop: '0.5rem',
  },
  heading: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '0.75rem',
    flexWrap: 'wrap' as const,
  },
  title: {
    fontSize: '0.78rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: colors.text,
    margin: 0,
  },
  legend: { fontSize: '0.72rem', color: colors.textMuted },
} as const;

export function SetupSection({
  id,
  requested,
  requestId,
  children,
}: {
  id: StationSetupSection;
  /** Is this the section the operator asked for? */
  requested: boolean;
  /** Changes on every request, so a repeat request while open still scrolls. */
  requestId: number;
  children: ReactNode;
}): JSX.Element {
  const spec = sectionSpec(id);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!requested) return;
    const el = ref.current;
    if (el === null) return;
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
    // The trap already focused us at open; on a REPEAT request nothing else will.
    if (document.activeElement !== el) el.focus({ preventScroll: true });
  }, [requested, requestId]);

  return (
    <section
      ref={ref}
      style={styles.section}
      aria-label={spec.title}
      id={`station-setup-${id}`}
      data-station-section={id}
      {...(requested ? { 'data-station-section-requested': '', 'data-modal-autofocus': '' } : {})}
      tabIndex={-1}
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
