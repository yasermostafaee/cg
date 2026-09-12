import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { Lock, type LucideIcon } from 'lucide-react';
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
   * `warn` — this tab is BLOCKED: something in it was refused.
   * `edited` — this tab has UNAPPLIED changes.
   *
   * `STATION-CHROME-01` §2 — these two are what let a tabbed dialog keep the promise the
   * scroll was protecting. The old argument against tabs was that a tab HIDES the section a
   * refusal came from; a mark in the rail means every blocked section announces itself from
   * every tab, and one press lands on the sentence that says why. That is strictly more than
   * the scroll gave, which only ever showed the refusal you happened to be standing beside.
   *
   * 🔴 `SETTINGS-MATCH-02` — **THE TWO MARKS ARE NO LONGER TWO DOTS, and that is defect 2.**
   * Both were a 0.55 rem circle that differed only in hue, against a reference that draws a
   * filled COUNT CHIP and an amber LOCK — so the rail item the owner reported as "half
   * painted" was one whose mark rendered at a fifth of the drawn size. The `count` is what the
   * chip says; a `warn` tab draws the lock. The screen-reader `label` is unchanged: it was
   * never the weak half, and colour was never the only channel.
   */
  badge?: { tone: 'warn' | 'edited'; label: string; count?: number } | undefined;
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
  /**
   * `SETTINGS-MATCH-02` — what sits at the BOTTOM of a vertical rail, under the items.
   *
   * The reference's `.sidebar` is a shell holding `.tabs[role=tablist]` and a `.sidebar-foot`,
   * and it has to be: a `tablist` may not carry a non-tab child, so a station card inside the
   * list would be an ARIA defect as well as a layout one. The shell is `.cg-rail` (ground,
   * edge, inset, full height) and the list inside it is `.cg-rail-tabs`.
   */
  foot?: ReactNode;
}

interface Props extends StripProps {
  /** Rendered below the strip — the caller owns the panel body. */
  children: ReactNode;
}

const styles = {
  /*
   * 🔴 `CONSOLE-LOOK-06` §3 — THE TABS SPACE THEMSELVES BY GAP, NOT BY PADDING.
   *
   * Measured in Chromium: `.layer-tabs{gap:22px}` with `.layer-tabs button{padding:12px 0 9px}`
   * — the buttons have NO horizontal padding at all and the strip's gap does the separating.
   * The difference is visible: a padded tab's underline runs wider than its word, so the
   * selected mark reads as a block; an unpadded one underlines exactly the label.
   */
  strip: {
    display: 'flex',
    alignItems: 'stretch',
    gap: '22px',
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '12px 0 9px',
    fontSize: '13px',
    fontWeight: 550,
    /*
     * The reference tracks `normal` — and its labels are sentence case (`Layers`) where ours
     * are upper (`LAYERS`). Upper-case at `normal` tracking sets tight enough to read as one
     * word, so a small track is KEPT here rather than adopted-to-zero. The deviation is the
     * casing, not the spacing, and it is the casing that keeps the three tabs looking like a
     * set beside the rest of this console's chrome.
     */
    letterSpacing: '0.04em',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: colors.textMuted,
    cursor: 'pointer',
  },
  /*
   * 🔴 THE SELECTED TAB IS BLUE, not white-with-a-blue-line.
   *
   * Ours coloured the label `--r-text` and only the underline `--r-ready`; the reference
   * colours BOTH the same blue, which is what makes the selected tab read as selected in one
   * glance rather than as "the bright one". The underline was already this exact hue
   * (`rgb(116 205 246)`), so this is one property moving to join it, not a new colour.
   */
  activeTab: { color: colors.ready, borderBottomColor: colors.ready },
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
  foot,
}: StripProps): JSX.Element {
  const outer = level === 'outer';
  const vertical = orientation === 'vertical';
  let lastGroup: string | undefined;
  const list = (
    <div
      {...(vertical
        ? { className: 'cg-rail-tabs' }
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
                /*
                  The mark is decorative; the sentence beside it is what a screen reader
                  announces, so the signal never depends on colour.

                  `SETTINGS-MATCH-02` — EDITED is a filled count chip (the reference's
                  `.nav-count`) and BLOCKED is the amber lock (its `.nav-symbol`). `data-tab-badge`
                  is unchanged and still carries the tone, so every spec that reads the rail's
                  state reads it exactly as before.
                */
                <>
                  {tab.badge.tone === 'warn' ? (
                    <span className="cg-rail-lock" aria-hidden="true" data-tab-badge="warn">
                      <Icon icon={Lock} size={STATION_SETUP_PX.navSymbolIcon} />
                    </span>
                  ) : (
                    <span className="cg-rail-count" aria-hidden="true" data-tab-badge="edited">
                      {String(tab.badge.count ?? 1)}
                    </span>
                  )}
                  <span className="cg-visually-hidden">{tab.badge.label}</span>
                </>
              )}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
  if (!vertical) return list;
  /*
    The RAIL is the shell — see the `foot` prop. It carries the ground, the edge, the inset and
    the full height; the tablist inside it carries only the items, and the foot sits under them
    at `margin-top:auto`.
  */
  return (
    <div className="cg-rail" style={{ width: railWidth }} data-setup-rail="">
      {list}
      {foot}
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

/**
 * `SETTINGS-MATCH-02` — the rail's own foot: the station this console is pointed at.
 *
 * ⚠ OUR primary and OUR host, read from the bridge's health — never the prototype's
 * `192.168.21.114` (§0). With no health reading yet it renders NOTHING rather than a
 * placeholder: an address is a fact, and a dash where one should be is a worse answer than
 * the space it would have filled.
 */
export function RailStationCard({
  label,
  name,
  host,
}: {
  label: string;
  name: string;
  host: string | null;
}): JSX.Element {
  return (
    <div className="cg-rail-foot">
      <div className="cg-rail-station" data-rail-station="">
        <span className="cg-rail-station__avatar" aria-hidden="true">
          {label}
        </span>
        <span className="cg-rail-station__text">
          <span className="cg-rail-station__name">{name}</span>
          {host !== null && (
            <bdi className="cg-rail-station__host" dir="ltr">
              {host}
            </bdi>
          )}
        </span>
      </div>
    </div>
  );
}
