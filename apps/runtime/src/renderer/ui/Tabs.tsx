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
  dot: {
    width: '0.55rem',
    height: '0.55rem',
    borderRadius: '50%',
    background: '#FCD34D',
    flexShrink: 0,
  },
} as const satisfies Record<string, CSSProperties>;

export function Tabs({ tabs, activeId, onSelect, children, ariaLabel }: Props): JSX.Element {
  return (
    <>
      <div style={styles.strip} role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`tabpanel-${tab.id}`}
              style={active ? { ...styles.tab, ...styles.activeTab } : styles.tab}
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
        id={`tabpanel-${activeId}`}
        aria-labelledby={`tab-${activeId}`}
        style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
      >
        {children}
      </div>
    </>
  );
}
