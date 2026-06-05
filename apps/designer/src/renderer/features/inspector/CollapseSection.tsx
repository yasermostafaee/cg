import { useState, type ReactNode } from 'react';
import { colors } from '../../theme.js';

interface Props {
  title: string;
  defaultExpanded?: boolean;
  /** Optional trailing element shown right of the chevron (e.g. a star). */
  trailing?: ReactNode;
  /**
   * Always open and not collapsible — renders a plain header with no chevron /
   * toggle. For sections that should never be hidden (Transform, Path Style).
   */
  pinned?: boolean;
  children: ReactNode;
}

const styles = {
  section: {
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    padding: '0.3rem 0.1rem',
    color: colors.textMuted,
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    textAlign: 'left' as const,
    width: '100%',
  },
  chevron: {
    width: 16,
    display: 'inline-block',
    color: colors.textMuted,
    fontSize: '0.95rem',
    lineHeight: 1,
    textAlign: 'center' as const,
  },
  trailing: {
    marginLeft: 'auto',
    color: colors.textMuted,
  },
  body: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.1rem',
    paddingBottom: '0.25rem',
  },
} as const;

/**
 * Collapsible section with a chevron toggle. Mirrors the Loopic right
 * panel: `▾ TRANSFORM`, `▸ DROP SHADOW`, etc. Sections own their own
 * expand/collapse state.
 */
export function CollapseSection({
  title,
  defaultExpanded = false,
  trailing,
  pinned = false,
  children,
}: Props): JSX.Element {
  const [open, setOpen] = useState(defaultExpanded);
  const expanded = pinned || open;
  return (
    <div style={styles.section}>
      {pinned ? (
        <div style={{ ...styles.header, cursor: 'default' }}>
          <span>{title}</span>
          {trailing !== undefined && <span style={styles.trailing}>{trailing}</span>}
        </div>
      ) : (
        <button
          type="button"
          style={styles.header}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`Toggle ${title}`}
        >
          <span style={styles.chevron}>{open ? '▾' : '▸'}</span>
          <span>{title}</span>
          {trailing !== undefined && <span style={styles.trailing}>{trailing}</span>}
        </button>
      )}
      {expanded && <div style={styles.body}>{children}</div>}
    </div>
  );
}
