import type { CSSProperties, ReactNode } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { colors } from '../theme.js';
import { Button } from './Button.js';
import { Icon } from './Icon.js';
import { useShellLayoutContext } from '../hooks/shellLayoutContext.js';
import type { PanelId } from '../hooks/useShellLayout.js';

/**
 * THE panel primitive: chrome, a header, and — the reason it exists — a
 * FULLSCREEN affordance every panel gets for free.
 *
 * Layers had a fullscreen button; the Inspector did not. That gap was not an
 * oversight anybody could have caught by reading either file, because each panel
 * was assembled by hand and neither one was wrong on its own. The fix is
 * structural: fullscreen is a property of being a panel, so the PGM and Preview
 * panels below — and whatever is added next — cannot miss it. Same architectural
 * point as the single global `Tooltip`.
 *
 * WHAT A PANEL OWNS: its border, background, clipping, and the invariant that
 * the PAGE never scrolls and the panel's BODY does (`layout.ts`). A caller that
 * wants a scrolling body puts `overflow: auto` on its own content — the panel
 * clips, so that scroll is finally bounded.
 */

const styles = {
  panel: {
    background: colors.panel,
    borderRadius: '0.25rem',
    border: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: 0,
    overflow: 'hidden',
  },
  header: {
    padding: '0.5rem 1rem',
    borderBottom: `1px solid ${colors.border}`,
    fontSize: '0.85rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
    flexShrink: 0,
  },
  title: { whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  actions: { display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 },
  body: { display: 'flex', flexDirection: 'column' as const, minHeight: 0, flex: 1 },
} as const satisfies Record<string, CSSProperties>;

interface Props {
  /** Identity in the focus model — what "fullscreen" targets. */
  id: PanelId;
  /** The header's visible text. Also the region's accessible name by default. */
  title: string;
  /** Override the region's accessible name when the visible title is decorative. */
  ariaLabel?: string;
  /** Panel-specific header controls, rendered BEFORE the shared fullscreen one. */
  actions?: ReactNode;
  children: ReactNode;
  /** Extra style on the panel root (how it sizes inside its parent's layout). */
  style?: CSSProperties;
  /**
   * The landmark element. `section` (→ `region`) is right for a panel that is
   * the main work surface; the Inspector is `aside` (→ `complementary`) because
   * it supports the Layers list rather than standing beside it as an equal — and
   * that role is what the E2E suite already addresses it by.
   */
  as?: 'section' | 'aside';
}

export function Panel({
  id,
  title,
  ariaLabel,
  actions,
  children,
  style,
  as: Root = 'section',
}: Props): JSX.Element {
  const layout = useShellLayoutContext();
  const focused = layout.focus === id;

  return (
    <Root aria-label={ariaLabel ?? title} style={{ ...styles.panel, ...style }}>
      <header style={styles.header}>
        <span style={styles.title}>{title}</span>
        <div style={styles.actions}>
          {actions}
          {/*
            FULLSCREEN — the affordance this primitive exists to guarantee.

            Hidden while NARROW: below the breakpoint the Inspector is already an
            overlay and the workspace is a single column, so "fullscreen" would
            either do nothing visible or fight the overlay for the same space.
          */}
          {!layout.narrow && (
            <Button
              variant="ghost"
              aria-label={focused ? `Exit fullscreen ${title}` : `Show ${title} fullscreen`}
              aria-pressed={focused}
              title={
                focused ? `Restore ${title} to the workspace` : `Give ${title} the whole shell`
              }
              onClick={() => layout.setFocus(focused ? 'none' : id)}
            >
              <Icon icon={focused ? Minimize2 : Maximize2} />
            </Button>
          )}
        </div>
      </header>
      <div style={styles.body}>{children}</div>
    </Root>
  );
}
