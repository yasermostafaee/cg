import type { CSSProperties, ReactNode } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';
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

/*
 * THE BAR ITSELF LIVES IN `controls.css` (`.cg-panel-header` / `.cg-panel-title`
 * / `.cg-panel-actions`), not here.
 *
 * It used to be the inline objects below, and that was the mechanism behind the
 * owner's report that the Inspector's bar did not match the others'. Inline
 * styles gave every bar an INTRINSIC height — each one as tall as whatever
 * controls it happened to carry — so LAYERS stood ~52px on its 36px bulk verbs
 * and the Inspector stood ~39px on two small icon buttons. One stylesheet rule
 * with `min-height: var(--r-panel-bar-h)` is a bar that cannot drift, because
 * there is no second copy to tune.
 *
 * Only the panel's own BOX stays inline: it merges a caller's `style`, which is
 * how a panel sizes itself inside its parent's layout.
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
  /**
   * Show a CLOSE control and call this when it is pressed. Only for a panel that
   * genuinely has a closed state — today that is the Inspector, whose openness is
   * DERIVED from the selection, so closing means deselecting (see `App`). Omit it
   * and no close button renders, which is right for the panels that are always
   * present.
   */
  onClose?: (() => void) | undefined;
}

export function Panel({
  id,
  title,
  ariaLabel,
  actions,
  children,
  style,
  as: Root = 'section',
  onClose,
}: Props): JSX.Element {
  const layout = useShellLayoutContext();
  const focused = layout.focus === id;

  return (
    <Root aria-label={ariaLabel ?? title} style={{ ...styles.panel, ...style }}>
      <header className="cg-panel-header">
        <span className="cg-panel-title">{title}</span>
        <div className="cg-panel-actions">
          {actions}
          {/*
            FULLSCREEN — the affordance this primitive exists to guarantee.

            SHOWN AT EVERY WIDTH now, including narrow (owner request). It used to be
            hidden below the breakpoint on the reasoning that the workspace is a single
            column there, so fullscreen "would do nothing visible or fight the overlay".
            That was true of the WORKSPACE panels and wrong about the Inspector: as a
            right-pinned overlay it deliberately leaves the Layers list showing, so
            there is real room to grow into, and on a phone a field editor at 82vw is
            exactly where an operator wants the whole screen. The overlay honours it by
            going full-width (see `App`).

            `icon`, NOT `ghost` — and that is the answer to "the owner can see
            fullscreen on LAYERS and not on the INSPECTOR". The control was
            PRESENT on both; this primitive renders it, so it cannot be missing
            from one panel. It was INVISIBLE on one of them. `ghost` is
            transparent fill, transparent border and muted text, which
            `controls.css` permits only "where surrounding chrome already frames
            the control". On LAYERS that condition held — the bar is full of
            bordered bulk verbs, so a bare glyph beside them still reads as one
            of the row. On the INSPECTOR the bar carries nothing else, so two
            bare glyphs sat in an empty strip with nothing to frame them.

            The condition `ghost` depends on is a property of the CALLER's bar,
            and a primitive cannot know it — so a primitive must not depend on
            it. `icon` is the same neutral vocabulary with a visible boundary, a
            fill and a hover, at a fixed 28px square. No new palette and no new
            shape: NEUTRAL IS NOT INVISIBLE, which is `--ghost`'s own warning.
          */}
          <Button
            variant="icon"
            aria-label={focused ? `Exit fullscreen ${title}` : `Show ${title} fullscreen`}
            aria-pressed={focused}
            title={focused ? `Restore ${title} to the workspace` : `Give ${title} the whole shell`}
            onClick={() => layout.setFocus(focused ? 'none' : id)}
          >
            <Icon icon={focused ? Minimize2 : Maximize2} />
          </Button>
          {/*
            CLOSE — only for a panel that HAS a closed state (the Inspector). Rendered
            last, so the destructive-ish action is not the one the thumb lands on by
            accident, and after fullscreen so the control order never changes as the
            panel's state does.

            A closing panel must leave fullscreen behind it: a panel that is closed
            AND still holds the shell's focus would leave the workspace hidden behind
            nothing at all. That is handled here rather than in each caller, so no
            caller can forget it.
          */}
          {onClose !== undefined && (
            <Button
              variant="icon"
              aria-label={`Close ${title}`}
              title={`Close ${title}`}
              onClick={() => {
                if (focused) layout.setFocus('none');
                onClose();
              }}
            >
              <Icon icon={X} />
            </Button>
          )}
        </div>
      </header>
      <div style={styles.body}>{children}</div>
    </Root>
  );
}
