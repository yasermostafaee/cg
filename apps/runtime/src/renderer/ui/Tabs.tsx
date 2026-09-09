import { Fragment, type CSSProperties, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { STATION_SETUP_PX, colors, cssVars } from '../theme.js';
import { Icon } from './Icon.js';

/**
 * R-028 part B — a minimal tab strip, for the Layers / Playout split.
 *
 * Deliberately small: this exists because the operator surface now has two
 * genuinely different territories — OUR declared rows, and the PLAYOUT
 * system's layers — and mixing them in one list would be the very confusion
 * the reservation exists to prevent. It is not a general tab framework.
 *
 * The `badge` is the tab's own attention signal (the playout tab's yellow dot
 * when something is on a reserved layer), so the operator learns there is
 * something to look at WITHOUT opening the tab. It carries an accessible
 * label rather than colour alone — colour is never the only channel.
 */
export interface TabSpec {
  id: string;
  label: string;
  /**
   * Optional attention marker, rendered after the label.
   *
   * `warn` (amber) — this tab is BLOCKED: something in it was refused.
   * `edited` (sky) — this tab has UNAPPLIED changes.
   *
   * `STATION-CHROME-01` §2 — these two are what let a tabbed dialog keep the promise the
   * scroll was protecting. The old argument against tabs was that a tab HIDES the section a
   * refusal came from; a dot in the rail means every blocked section announces itself from
   * every tab, and one press lands on the sentence that says why. That is strictly more than
   * the scroll gave, which only ever showed the refusal you happened to be standing beside.
   */
  badge?: { tone: 'warn' | 'edited'; label: string } | undefined;
  /**
   * Rail heading this tab sits under (vertical orientation only). Consecutive tabs sharing a
   * group render one heading; a tab with no group renders none.
   */
  group?: string | undefined;
  /**
   * `RUNTIME-REDESIGN-01` Phase 7 — the rail item's glyph (vertical orientation only), the
   * reference's `.tab>svg`: 18 px, muted at rest, the accent when selected. DECORATIVE — the
   * label beside it is the name (see `Icon`), so a tab without one loses nothing.
   */
  icon?: LucideIcon | undefined;
}

interface StripProps {
  tabs: readonly TabSpec[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Accessible name for the tab strip. */
  ariaLabel: string;
  /**
   * Namespace for the generated `tab-*` / `tabpanel-*` element ids.
   *
   * Required once tab strips NEST — the channel strip outside, LAYERS/PLAYOUT
   * inside it. Without a prefix a channel and an inner tab that happened to share
   * an id would emit duplicate DOM ids and cross-wire each other's
   * `aria-controls`, which is the kind of a11y defect that never shows up
   * visually.
   */
  idPrefix?: string;
  /**
   * `outer` marks the CHANNEL level: a heavier, boxed treatment so the hierarchy
   * is visible at a glance. Channel and layers-vs-playout are different axes and
   * must never look like peers in one strip.
   */
  level?: 'inner' | 'outer';
  /**
   * `vertical` is the RAIL — a column of tabs beside the panel rather than a strip above
   * it. Station setup's five sections do not fit a strip at a readable size, and a rail is
   * also where a per-section status dot can live without competing with the section's own
   * chrome. The caller lays the two out (rail | panel) in a row flex container.
   */
  orientation?: 'horizontal' | 'vertical';
  /** Fixed rail width, vertical only. */
  railWidth?: string;
  /**
   * 🔴 `AUDIT-CLOSE-01` B3 — THE STRIP IS SITTING IN A PANEL BAR, not above one.
   *
   * The reference draws the layers card's tabs and its bulk verbs on ONE 40 px line; the app
   * spent a 53 px panel bar and a 40 px strip on the same job, and the audit measured what
   * the two cost together. Hoisting the strip into the bar is what removes the second line,
   * so the strip has to stop being a band: no rule under it (the BAR has one), no stretch,
   * and it lays itself out as a flex item beside the actions.
   *
   * ⚠ It is a placement flag, NOT a second visual vocabulary. The tabs keep their own
   * padding, weight and selected underline; what changes is only what the CONTAINER does.
   */
  inPanelBar?: boolean;
}

interface Props extends StripProps {
  /** Rendered below the strip — the caller owns the panel body. */
  children: ReactNode;
}

const styles = {
  strip: {
    display: 'flex',
    alignItems: 'stretch',
    gap: '0.25rem',
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.45rem 0.9rem',
    fontSize: '0.85rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: colors.textMuted,
    cursor: 'pointer',
  },
  activeTab: { color: colors.text, borderBottomColor: colors.ready },
  /**
   * The CHANNEL level. Distinguished by SHAPE (a raised, boxed tab that sits on a
   * sunken strip) rather than by colour alone, so the outer axis is obvious even
   * when only one channel exists — the point being that adding a second channel
   * changes nothing structural.
   */
  outerStrip: { background: colors.background, padding: '0.25rem 0.25rem 0', gap: '0.25rem' },
  /**
   * `AUDIT-CLOSE-01` B3 — the strip AS A FLEX ITEM inside a panel bar.
   *
   * The bar already draws the rule and the ground, so the strip drops both; `alignSelf`
   * stretches it so a tab's selected underline still lands on the bar's own bottom edge,
   * which is what makes it read as a tab rather than as a button with a line under it.
   */
  stripInBar: {
    borderBottom: 'none',
    alignSelf: 'stretch',
    marginBlock: `calc(-1 * ${cssVars['--r-space-3']})`,
    minWidth: 0,
  },
  outerTab: {
    fontSize: '0.72rem',
    padding: '0.35rem 0.85rem',
    borderRadius: '0.25rem 0.25rem 0 0',
    border: `1px solid transparent`,
    borderBottom: 'none',
  },
  outerActiveTab: {
    color: colors.text,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderBottom: 'none',
  },
  dot: {
    width: '0.55rem',
    height: '0.55rem',
    borderRadius: '50%',
    background: cssVars['--r-caution-text'],
    flexShrink: 0,
  },
  /** UNAPPLIED CHANGES. The sky, never the amber — amber is "you are blocked". */
  dotEdited: { background: cssVars['--r-accent'] },
} as const satisfies Record<string, CSSProperties>;

/*
 * 🔴 `STATION-CHROME-02` §3 — **THE RAIL'S STYLES LEFT THIS FILE, AND THAT IS A BUG FIX.**
 *
 * They were four inline style objects here (`rail`, `railTab`, `railActiveTab`,
 * `railGroup`). The selected tab merged a `borderColor` LONGHAND over the `border`
 * SHORTHAND, and on deselect React removes the longhand — which deletes the
 * border-*-color declarations the shorthand contributed too, leaving a width and a style
 * with no colour. Chrome paints that WHITE, so every tab the operator had visited kept a
 * white box around it. The source said `1px solid transparent` throughout and explained
 * nothing; only a computed-style reading found it.
 *
 * `.cg-rail*` in `controls.css` is the fix: the selected state is a SELECTOR, so there is
 * no diff to get wrong, and the rail gains the quiet HOVER that inline styles could never
 * have expressed. `railWhiteBox.dom.test.ts` is the regression.
 */

/**
 * `AUDIT-CLOSE-01` B — THE STRIP AND THE PANEL, SEPARABLE.
 *
 * They used to be one component that always rendered both, one above the other, and that
 * shape is what made "the tabs must sit in the panel BAR" and "the channel tabs must sit in
 * the APP HEADER" impossible to express without duplicating the tablist. Splitting them is a
 * pure refactor — `Tabs` below still composes exactly what it composed before — and it is the
 * seam the two B items are built on.
 *
 * ⚠ The two halves are joined by `idPrefix` + `activeId` and by nothing else, so a caller that
 * places them apart MUST pass the same pair to both or `aria-controls` will point at nothing.
 * That is the price of separating them and it is why they are not two unrelated components.
 */
export function TabStrip({
  tabs,
  activeId,
  onSelect,
  ariaLabel,
  idPrefix = 'tab',
  level = 'inner',
  orientation = 'horizontal',
  railWidth = cssVars['--r-setup-rail-w'],
  inPanelBar = false,
}: StripProps): JSX.Element {
  const outer = level === 'outer';
  const vertical = orientation === 'vertical';
  let lastGroup: string | undefined;
  return (
    <div
      {...(vertical
        ? { className: 'cg-rail', style: { width: railWidth } }
        : {
            style: {
              ...styles.strip,
              ...(outer ? styles.outerStrip : {}),
              ...(inPanelBar ? styles.stripInBar : {}),
            },
          })}
      role="tablist"
      aria-label={ariaLabel}
      {...(vertical ? { 'aria-orientation': 'vertical' as const } : {})}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const base = outer ? { ...styles.tab, ...styles.outerTab } : styles.tab;
        const activeStyle = outer ? styles.outerActiveTab : styles.activeTab;
        const heading = vertical && tab.group !== undefined && tab.group !== lastGroup;
        if (vertical) lastGroup = tab.group;
        return (
          <Fragment key={tab.id}>
            {heading && (
              <span className="cg-rail-group" aria-hidden="true">
                {tab.group}
              </span>
            )}
            <button
              type="button"
              role="tab"
              id={`${idPrefix}-${tab.id}`}
              aria-selected={active}
              aria-controls={`${idPrefix}panel-${tab.id}`}
              {...(vertical
                ? { className: 'cg-rail-tab' }
                : { style: active ? { ...base, ...activeStyle } : base })}
              onClick={() => onSelect(tab.id)}
            >
              {/* A bare `<svg>`, not a wrapper: the tab's FIRST span stays its label, which is
                    what `stationSetupTabs.dom.test.ts` reads off the rail. `.cg-rail-tab > svg`
                    styles it. */}
              {vertical && tab.icon !== undefined && (
                <Icon icon={tab.icon} size={STATION_SETUP_PX.tabIcon} />
              )}
              {vertical ? <span className="cg-rail-tab__label">{tab.label}</span> : tab.label}
              {tab.badge !== undefined && (
                // The dot is decorative; the LABEL beside it is what a screen
                // reader announces, so the signal never depends on colour.
                <>
                  <span
                    style={
                      tab.badge.tone === 'edited'
                        ? { ...styles.dot, ...styles.dotEdited }
                        : styles.dot
                    }
                    aria-hidden="true"
                    data-tab-badge={tab.badge.tone}
                  />
                  <span className="cg-visually-hidden">{tab.badge.label}</span>
                </>
              )}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

/** The panel half — addressed by the same `idPrefix` + `activeId` the strip was given. */
export function TabPanel({
  activeId,
  idPrefix = 'tab',
  children,
}: {
  activeId: string;
  idPrefix?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}panel-${activeId}`}
      aria-labelledby={`${idPrefix}-${activeId}`}
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
    >
      {children}
    </div>
  );
}

/** The two together, one above the other — what every caller had before the split. */
export function Tabs({ children, ...strip }: Props): JSX.Element {
  return (
    <>
      <TabStrip {...strip} />
      <TabPanel
        activeId={strip.activeId}
        {...(strip.idPrefix !== undefined ? { idPrefix: strip.idPrefix } : {})}
      >
        {children}
      </TabPanel>
    </>
  );
}
