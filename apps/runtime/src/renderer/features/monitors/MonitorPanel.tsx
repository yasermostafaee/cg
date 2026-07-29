import type { CSSProperties } from 'react';
import { MonitorOff } from 'lucide-react';
import { colors } from '../../theme.js';
import { Icon } from '../../ui/Icon.js';
import { Panel } from '../../ui/Panel.js';
import type { PanelId } from '../../hooks/useShellLayout.js';

/**
 * PGM and PREVIEW — reserved in their final positions now, so the layout the
 * operator learns is the layout they keep. The video itself (frame grabs over
 * the bridge) is M9.
 *
 * WHY THESE SAY "NOT CONNECTED" IN WORDS. A plain black rectangle in a broadcast
 * UI is not a neutral placeholder — it is what a DEAD FEED looks like. An
 * operator glancing at a black PGM box at 2 a.m. has to decide whether
 * transmission just died, and the cost of getting that wrong is a false alarm
 * that pulls people out of bed. An empty box that says what it is costs nothing.
 *
 * It is equally careful NOT to read as an ERROR: nothing is broken here, the
 * feature is unbuilt. So the treatment is MUTED (the offline grey, never the
 * error red or the caution amber) and the wording names the reason — no source
 * is attached yet — rather than implying a fault to go and fix.
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
  /** PGM / PREVIEW — the header text and the accessible name. */
  title: string;
  /** What this output would be showing once a source is attached. */
  detail: string;
}

export function MonitorPanel({ id, title, detail }: Props): JSX.Element {
  return (
    <Panel id={id} title={title} style={{ flex: 1, minWidth: 0 }}>
      {/*
        `role="img"` with a name, NOT a bare decorative box: a screen reader user
        needs the same fact a sighted operator gets from the label — there is an
        output here and it is not connected.
      */}
      <div style={styles.screen} role="img" aria-label={`${title} — not connected. ${detail}`}>
        <Icon icon={MonitorOff} size={22} />
        <span style={styles.label}>Not connected</span>
        <span style={styles.detail}>{detail}</span>
      </div>
    </Panel>
  );
}
