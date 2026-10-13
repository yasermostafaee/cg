import { Fragment, type KeyboardEvent, type ReactNode } from 'react';
import { Lock, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import { STATION_SETUP_PX, cssVars } from '../theme.js';
import { Icon } from './Icon.js';
import { Tag } from './Tag.js';

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
  /**
   * The tab's text. Markup is allowed for ONE reason: a piece of OPERATOR DATA inside it — a
   * Persian channel name from the Playout's catalogue — has to sit in its own `<bdi>`, with the
   * chrome around it (` · READ ONLY`) outside the isolate (golden rule 11). Plain chrome is a
   * string, as it always was.
   */
  label: ReactNode;
  /**
   * The long form, on hover — golden rule 11's RELOCATION: when a label shows a name, the id it
   * replaced (the channel number) lives here rather than disappearing.
   */
  title?: string | undefined;
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
   * 🔴 `MULTI-CHANNEL-01` §2 L — **THIS TAB'S VIEW HOLDS A WARNING OR AN ALARM.** Only the channel
   * strip sets it: a channel's messages stay in that channel's view, and this small mark is the one
   * thing another channel's view says about them. AMBER for a warning, RED for an alarm — the
   * colour the message wears in its own view (`design.md` §29). Kept apart from `badge`, whose two
   * tones already mean "blocked" and "unapplied" in the settings rail.
   */
  signal?: { tone: 'warning' | 'alarm'; label: string } | undefined;
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

/*
 * 🔴 `UI-POLISH-01` A — THE OUTER (CHANNEL) LEVEL'S INLINE STYLE OBJECTS LEFT THIS FILE TOO.
 *
 * `CONSOLE-LOOK-06` DELTA D2 moved the INNER tab here to `.cg-tab` and `STATION-CHROME-02` moved
 * the RAIL to `.cg-rail*`, each fixing a style-diff hole a selector cannot have. The channel level
 * was the last one on inline objects, and it is what the owner saw as unfinished: a rule under both
 * tabs and an active fill one unit off the header's ground. It is `.cg-tab-strip--outer` /
 * `.cg-tab--outer` in `controls.css` now — the selected state a SELECTOR, the colours tokens.
 */

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
  /*
    `UI-POLISH-01` A — the CHANNEL tabs answer the arrow keys: ← / → move focus to the previous /
    next tab (wrapping), Home / End to the ends. MANUAL activation — focus moves, and the channel
    changes only on Enter or Space — because switching channels changes what every verb on the
    screen addresses, and an arrow press is not the moment to do that. Every tab stays its own
    Tab stop, as before. Outer level only: the inner strips and the rail are unchanged.
  */
  const moveFocus = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const step =
      e.key === 'ArrowRight'
        ? 1
        : e.key === 'ArrowLeft'
          ? -1
          : e.key === 'Home' || e.key === 'End'
            ? 0
            : null;
    if (step === null) return;
    const list = e.currentTarget.parentElement;
    if (list === null) return;
    const tabs = [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const at = tabs.indexOf(e.currentTarget);
    if (at < 0 || tabs.length === 0) return;
    e.preventDefault();
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? tabs.length - 1
          : (at + step + tabs.length) % tabs.length;
    tabs[next]?.focus();
  };
  const list = (
    <div
      {...(vertical
        ? { className: 'cg-rail-tabs' }
        : outer
          ? { className: 'cg-tab-strip cg-tab-strip--outer' }
          : { className: `cg-tab-strip${inPanelBar ? ' cg-tab-strip--in-bar' : ''}` })}
      role="tablist"
      aria-label={ariaLabel}
      {...(vertical ? { 'aria-orientation': 'vertical' as const } : {})}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
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
              {...(tab.title !== undefined ? { title: tab.title } : {})}
              {...(vertical
                ? { className: 'cg-rail-tab' }
                : outer
                  ? { className: 'cg-tab cg-tab--outer', onKeyDown: moveFocus }
                  : { className: 'cg-tab' })}
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
              {tab.signal !== undefined && (
                <>
                  <span
                    className={`cg-tab-signal cg-tab-signal--${tab.signal.tone}`}
                    aria-hidden="true"
                    data-tab-signal={tab.signal.tone}
                  >
                    <Icon
                      icon={tab.signal.tone === 'alarm' ? OctagonAlert : TriangleAlert}
                      size={12}
                    />
                  </span>
                  <span className="cg-visually-hidden">{tab.signal.label}</span>
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
  version,
}: {
  label: string;
  name: string;
  host: string | null;
  /**
   * 🔴 `CLIENT-TEST-RELEASE-01` B1 — the app's release version, in one line under the station, and
   * the exact build (`0.9.0 · 5f3c2a1 · 2026-09-29`) in its `title`. A fact, so a `Tag`.
   */
  version?: { readonly release: string; readonly build: string } | undefined;
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
      {version !== undefined && (
        <Tag className="cg-rail-foot__version" title={version.build} data-testid="app-version">
          Version {version.release}
        </Tag>
      )}
    </div>
  );
}
