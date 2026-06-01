import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';

interface MenuEntry {
  id: 'home' | 'file' | 'edit' | 'view' | 'help';
  label: string;
  onClick?: () => void;
}

const MENU: readonly MenuEntry[] = [
  { id: 'home', label: 'Home', onClick: () => designerStore.setScene(null, null) },
  { id: 'file', label: 'File' },
  { id: 'edit', label: 'Edit' },
  { id: 'view', label: 'View' },
  { id: 'help', label: 'Help' },
];

const styles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.3rem 0.6rem',
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.2rem',
  },
  menuItem: {
    background: 'transparent',
    color: colors.textMuted,
    border: '1px solid transparent',
    borderRadius: '0.22rem',
    padding: '0.18rem 0.55rem',
    fontSize: '0.74rem',
    cursor: 'pointer',
    letterSpacing: '0.01em',
  },
  menuItemHome: {
    color: colors.text,
    fontWeight: 600,
  },
} as const;

/**
 * D-008 top menu bar — Home / File / Edit / View / Help. Home returns
 * to the landing/project picker; the other items are placeholders for
 * future menus. The tool selector now lives in the canvas header.
 */
export function TopToolbar(): JSX.Element {
  return (
    <nav style={styles.bar} aria-label="Application menu">
      <div style={styles.group}>
        {MENU.map((m) => (
          <button
            key={m.id}
            type="button"
            style={
              m.id === 'home' ? { ...styles.menuItem, ...styles.menuItemHome } : styles.menuItem
            }
            onClick={() => m.onClick?.()}
            disabled={m.onClick === undefined}
            title={m.onClick === undefined ? `${m.label} (coming soon)` : m.label}
            aria-label={m.label}
          >
            {m.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
