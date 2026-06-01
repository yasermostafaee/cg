import type { Scene } from '@cg/shared-schema';
import type { ExportIssue } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';

interface MenuEntry {
  id: 'home' | 'file' | 'edit' | 'view' | 'help';
  label: string;
  onClick?: () => void;
}

interface Props {
  scene: Scene | null;
  projectPath: string | null;
  issues: readonly ExportIssue[];
}

const MENU: readonly MenuEntry[] = [
  // Home flips back to the landing view but KEEPS the active scene in
  // memory — the landing screen offers a "Resume" affordance so the
  // operator can return to it. Opening another project from landing
  // is gated by SaveBeforeSwitchModal.
  { id: 'home', label: 'Home', onClick: () => designerStore.setView('landing') },
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
  spacer: { flex: 1 },
  saveButton: {
    background: colors.accent,
    color: '#000',
    border: 'none',
    padding: '0.2rem 0.6rem',
    borderRadius: '0.22rem',
    fontSize: '0.74rem',
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.02em',
  },
  exportButton: {
    background: 'transparent',
    color: colors.text,
    border: `1px solid ${colors.border}`,
    padding: '0.2rem 0.6rem',
    borderRadius: '0.22rem',
    fontSize: '0.74rem',
    cursor: 'pointer',
    letterSpacing: '0.02em',
  },
} as const;

/**
 * D-008 top menu bar — Home / File / Edit / View / Help. Home returns
 * to the landing/project picker; the other items are placeholders for
 * future menus. SAVE / EXPORT live on the right side (moved from the
 * status bar so the operator's primary actions stay in the chrome).
 */
export function TopToolbar({ scene, projectPath, issues }: Props): JSX.Element {
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const exportBlocked = scene === null || errorCount > 0;

  async function save(): Promise<void> {
    if (scene === null) return;
    const path = projectPath ?? window.prompt('Save scene as (full path, .scene.json):');
    if (path === null || path === '') return;
    await window.cg.projects.save({ scene, path });
  }

  async function exportVcg(): Promise<void> {
    if (scene === null) return;
    if (errorCount > 0) {
      window.alert(`Export blocked: ${String(errorCount)} validation error(s) in Issues panel.`);
      return;
    }
    const outputPath = window.prompt('Output .vcg path:');
    if (outputPath === null || outputPath === '') return;
    await window.cg.export.run({ scene, outputPath });
  }

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
      <span style={styles.spacer} />
      <button
        type="button"
        style={styles.exportButton}
        disabled={exportBlocked}
        onClick={() => void exportVcg()}
        title={errorCount > 0 ? 'Resolve validation errors first' : 'Export to .vcg'}
      >
        EXPORT
      </button>
      <button
        type="button"
        style={styles.saveButton}
        disabled={scene === null}
        onClick={() => void save()}
      >
        SAVE
      </button>
    </nav>
  );
}
