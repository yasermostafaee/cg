import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { colors } from '../../theme.js';
import { Icon } from '../../ui/Icon.js';
import { Panel } from '../../ui/Panel.js';
import type { PanelId } from '../../hooks/useShellLayout.js';

/**
 * One output box — PROGRAM or PREVIEW — reserved in its final position now, so the
 * layout the operator learns is the layout they keep.
 *
 * WHY A BLACK BOX NEEDS WORDS ON IT. A plain black rectangle in a broadcast UI is
 * not a neutral placeholder — it is what a DEAD FEED looks like. An operator
 * glancing at a black PGM box at 2 a.m. has to decide whether transmission just
 * died, and the cost of getting that wrong is a false alarm that pulls people out
 * of bed. An empty box that says what it is costs nothing.
 *
 * It is equally careful NOT to read as an ERROR: nothing is broken here, the
 * feature is unbuilt. The treatment is MUTED (the offline grey, never the error
 * red or the caution amber) and the wording names the reason rather than implying
 * a fault to go and fix.
 *
 * THE TWO BOXES ARE EMPTY FOR DIFFERENT REASONS, and the copy must not blur them.
 * The first draft labelled both "NOT CONNECTED", which is a category error for
 * PREVIEW:
 *
 *   - PROGRAM is genuinely awaiting a FEED. It shows the program-channel return
 *     from the playout server, which does not exist yet — owned by `C-016`
 *     (operator PGM confidence view: periodic program-channel grabs served over
 *     the bridge's HTTP server). "Not connected" is the literal truth.
 *   - PREVIEW will never connect to anything. `R-022` specifies it as a LOCAL
 *     browser render of the loaded template through `@cg/template-runtime` — "no
 *     CasparCG involvement, no second channel", and "nothing is ever sent to
 *     CasparCG". There is no feed to be disconnected from, so a connection state
 *     is meaningless here; what it is waiting for is a graphic to render.
 *
 * Telling an operator that PREVIEW is "not connected" would send them looking for
 * a link that is not part of the design.
 *
 * Item numbers live in this comment and NEVER in the visible copy — an operator
 * has no idea what a C- or R- number is (and the retired Electron-era M0–M12
 * milestones the copy first cited do not drive work at all any more).
 *
 * Fullscreen comes from `Panel`, not from here. That is the point of the
 * primitive: these two panels were the first test of it, and they needed no code
 * to get the affordance.
 */

const styles = {
  /** The video area. Black because that is what a video area is. */
  screen: {
    flex: 1,
    minHeight: 0,
    background: '#000',
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
  label: {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  },
  detail: { fontSize: '0.68rem', color: colors.textMuted, maxWidth: '18rem', lineHeight: 1.35 },
} as const satisfies Record<string, CSSProperties>;

interface Props {
  id: Extract<PanelId, 'pgm' | 'pvw'>;
  /** PROGRAM / PREVIEW — the header text and the accessible name. */
  title: string;
  /** The mark for this box's empty state — see `emptyLabel`. */
  icon: LucideIcon;
  /**
   * WHY this box is empty, in two or three words. Per-panel, not shared: PROGRAM
   * has no feed yet, PREVIEW has nothing to render — see the header comment for
   * why conflating those two is a category error.
   */
  emptyLabel: string;
  /** What this output will show, in the operator's terms. */
  detail: string;
}

export function MonitorPanel({ id, title, icon, emptyLabel, detail }: Props): JSX.Element {
  return (
    <Panel id={id} title={title} style={{ flex: 1, minWidth: 0 }}>
      {/*
        `role="img"` with a name, NOT a bare decorative box: a screen reader user
        needs the same fact a sighted operator gets from the label — there is an
        output here, and this is why it is blank.
      */}
      <div style={styles.screen} role="img" aria-label={`${title} — ${emptyLabel}. ${detail}`}>
        <Icon icon={icon} size={22} />
        <span style={styles.label}>{emptyLabel}</span>
        <span style={styles.detail}>{detail}</span>
      </div>
    </Panel>
  );
}
