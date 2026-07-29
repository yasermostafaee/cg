import type { CSSProperties, ReactNode } from 'react';
import { colors } from '../theme.js';

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
  /** Optional attention marker, rendered after the label. */
  badge?: { tone: 'warn'; label: string } | undefined;
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
    background: '#FCD34D',
    flexShrink: 0,
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
}: Props): JSX.Element {
  const outer = level === 'outer';
  return (
    <>
      <div
        style={outer ? { ...styles.strip, ...styles.outerStrip } : styles.strip}
        role="tablist"
        aria-label={ariaLabel}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          const base = outer ? { ...styles.tab, ...styles.outerTab } : styles.tab;
          const activeStyle = outer ? styles.outerActiveTab : styles.activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${idPrefix}-${tab.id}`}
              aria-selected={active}
              aria-controls={`${idPrefix}panel-${tab.id}`}
              style={active ? { ...base, ...activeStyle } : base}
              onClick={() => onSelect(tab.id)}
            >
              {tab.label}
              {tab.badge !== undefined && (
                // The dot is decorative; the LABEL beside it is what a screen
                // reader announces, so the signal never depends on colour.
                <>
                  <span style={styles.dot} aria-hidden="true" />
                  <span className="cg-visually-hidden">{tab.badge.label}</span>
                </>
              )}
            </button>
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
