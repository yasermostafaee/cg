import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { colors, cssVars } from '../theme.js';

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
}

interface Props {
  tabs: readonly TabSpec[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Rendered below the strip — the caller owns the panel body. */
  children: ReactNode;
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
  // ── the RAIL (vertical) ──────────────────────────────────────────────────
  rail: {
    flexDirection: 'column' as const,
    alignItems: 'stretch',
    gap: '0.1rem',
    borderBottom: 'none',
    borderRight: `1px solid ${colors.border}`,
    background: colors.background,
    padding: '0.4rem 0.35rem',
    overflowY: 'auto' as const,
  },
  railTab: {
    justifyContent: 'flex-start',
    textAlign: 'start' as const,
    padding: '0.4rem 0.5rem',
    borderRadius: '0.25rem',
    border: '1px solid transparent',
    borderBottom: '1px solid transparent',
    fontWeight: 600,
    letterSpacing: 0,
    fontSize: '0.85rem',
  },
  railActiveTab: {
    color: colors.text,
    background: cssVars['--r-row-selected-fill'],
    borderColor: colors.border,
  },
  railLabel: { flex: 1, minWidth: 0 },
  railGroup: {
    padding: '0.6rem 0.5rem 0.25rem',
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
} as const satisfies Record<string, CSSProperties>;

export function Tabs({
  tabs,
  activeId,
  onSelect,
  children,
  ariaLabel,
  idPrefix = 'tab',
  level = 'inner',
  orientation = 'horizontal',
  railWidth = '13rem',
}: Props): JSX.Element {
  const outer = level === 'outer';
  const vertical = orientation === 'vertical';
  let lastGroup: string | undefined;
  return (
    <>
      <div
        style={
          vertical
            ? { ...styles.strip, ...styles.rail, width: railWidth, flexShrink: 0 }
            : outer
              ? { ...styles.strip, ...styles.outerStrip }
              : styles.strip
        }
        role="tablist"
        aria-label={ariaLabel}
        {...(vertical ? { 'aria-orientation': 'vertical' as const } : {})}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          const base = vertical
            ? { ...styles.tab, ...styles.railTab }
            : outer
              ? { ...styles.tab, ...styles.outerTab }
              : styles.tab;
          const activeStyle = vertical
            ? styles.railActiveTab
            : outer
              ? styles.outerActiveTab
              : styles.activeTab;
          const heading = vertical && tab.group !== undefined && tab.group !== lastGroup;
          if (vertical) lastGroup = tab.group;
          return (
            <Fragment key={tab.id}>
              {heading && (
                <span style={styles.railGroup} aria-hidden="true">
                  {tab.group}
                </span>
              )}
              <button
                type="button"
                role="tab"
                id={`${idPrefix}-${tab.id}`}
                aria-selected={active}
                aria-controls={`${idPrefix}panel-${tab.id}`}
                style={active ? { ...base, ...activeStyle } : base}
                onClick={() => onSelect(tab.id)}
              >
                {vertical ? <span style={styles.railLabel}>{tab.label}</span> : tab.label}
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
      <div
        role="tabpanel"
        id={`${idPrefix}panel-${activeId}`}
        aria-labelledby={`${idPrefix}-${activeId}`}
        style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
      >
        {children}
      </div>
    </>
  );
}
