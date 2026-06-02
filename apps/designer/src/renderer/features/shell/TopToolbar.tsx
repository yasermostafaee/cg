import { useEffect, useRef, useState } from 'react';
import type { Scene } from '@cg/shared-schema';
import type { ExportIssue } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { NewProjectModal } from './NewProjectModal.js';
import { SaveBeforeSwitchModal } from './SaveBeforeSwitchModal.js';

interface Props {
  scene: Scene | null;
  projectPath: string | null;
  issues: readonly ExportIssue[];
}

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
  menuItemWrap: {
    position: 'relative' as const,
  },
  dropdown: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    marginTop: 2,
    minWidth: 160,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
    padding: '0.25rem 0',
    zIndex: 60,
  },
  dropdownItem: {
    display: 'block',
    width: '100%',
    background: 'transparent',
    color: colors.text,
    border: 'none',
    textAlign: 'left' as const,
    padding: '0.35rem 0.7rem',
    fontSize: '0.76rem',
    cursor: 'pointer',
    letterSpacing: '0.01em',
  },
  dropdownItemDisabled: {
    color: colors.textMuted,
    cursor: 'default' as const,
  },
  dropdownDivider: {
    height: 1,
    background: colors.border,
    margin: '0.2rem 0',
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
  const [openMenu, setOpenMenu] = useState<'file' | null>(null);
  const [newModalOpen, setNewModalOpen] = useState(false);
  // Queues a switch action (Close / New / Open) when there's already a
  // scene loaded — the SaveBeforeSwitchModal runs first and only then
  // does the action proceed. `() => () => Promise<void>` is React's
  // "store a function in state" pattern.
  const [pendingSwitch, setPendingSwitch] = useState<(() => Promise<void>) | null>(null);
  const fileBtnRef = useRef<HTMLButtonElement | null>(null);

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (openMenu === null) return;
    function close(): void {
      setOpenMenu(null);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  async function save(): Promise<void> {
    if (scene === null) return;
    await window.cg.projects.saveDisk({ scene, askPath: false });
  }

  async function saveAs(): Promise<void> {
    if (scene === null) return;
    await window.cg.projects.saveDisk({ scene, askPath: true });
  }

  function newProject(): void {
    // Mirrors the LandingView entry point — the New Project modal
    // collects name, resolution, and frame rate, then calls
    // projects.create and setScene itself.
    setNewModalOpen(true);
  }

  async function openProject(): Promise<void> {
    const result = await window.cg.projects.open({});
    if (result.scene !== null) designerStore.setScene(result.scene, result.path);
  }

  function closeProject(): void {
    designerStore.setScene(null, null);
  }

  /**
   * Run `action` immediately when nothing is loaded, otherwise queue
   * it behind the save-before-switch modal. Matches the LandingView
   * `guardedSwitch` pattern so the operator has a single, consistent
   * "you have unsaved work" prompt no matter where the switch is
   * triggered from.
   */
  function guardedSwitch(action: () => void | Promise<void>): void {
    if (scene === null) {
      void Promise.resolve(action());
      return;
    }
    setPendingSwitch(() => async () => {
      await Promise.resolve(action());
    });
  }

  async function exportVcg(): Promise<void> {
    if (scene === null) return;
    if (errorCount > 0) {
      window.alert(`Export blocked: ${String(errorCount)} validation error(s) in Issues panel.`);
      return;
    }
    await window.cg.export.runDisk({ scene });
  }

  function runFileAction(fn: () => void | Promise<void>): void {
    setOpenMenu(null);
    void Promise.resolve(fn());
  }

  function runFileSwitch(fn: () => void | Promise<void>): void {
    setOpenMenu(null);
    guardedSwitch(fn);
  }

  return (
    <nav style={styles.bar} aria-label="Application menu">
      <div style={styles.group}>
        <button
          type="button"
          style={{ ...styles.menuItem, ...styles.menuItemHome }}
          onClick={() => designerStore.setView('landing')}
          title="Home"
          aria-label="Home"
        >
          Home
        </button>
        <div
          style={styles.menuItemWrap}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            ref={fileBtnRef}
            type="button"
            style={styles.menuItem}
            onClick={() => setOpenMenu((m) => (m === 'file' ? null : 'file'))}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'file'}
          >
            File
          </button>
          {openMenu === 'file' && (
            <div style={styles.dropdown} role="menu">
              <FileMenuItem label="New" onClick={() => runFileSwitch(newProject)} />
              <FileMenuItem label="Open…" onClick={() => runFileSwitch(openProject)} />
              <div style={styles.dropdownDivider} aria-hidden />
              <FileMenuItem
                label="Save"
                disabled={scene === null}
                onClick={() => runFileAction(save)}
              />
              <FileMenuItem
                label="Save As…"
                disabled={scene === null}
                onClick={() => runFileAction(saveAs)}
              />
              <div style={styles.dropdownDivider} aria-hidden />
              <FileMenuItem
                label="Export…"
                disabled={exportBlocked}
                onClick={() => runFileAction(exportVcg)}
              />
              <div style={styles.dropdownDivider} aria-hidden />
              <FileMenuItem
                label="Close project"
                disabled={scene === null}
                onClick={() => runFileSwitch(closeProject)}
              />
            </div>
          )}
        </div>
        {(['edit', 'view', 'help'] as const).map((id) => (
          <button
            key={id}
            type="button"
            style={styles.menuItem}
            disabled
            title={`${capitalize(id)} (coming soon)`}
            aria-label={capitalize(id)}
          >
            {capitalize(id)}
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
      {newModalOpen && <NewProjectModal onClose={() => setNewModalOpen(false)} />}
      {pendingSwitch !== null && scene !== null && (
        <SaveBeforeSwitchModal
          scene={scene}
          projectPath={projectPath}
          onCancel={() => setPendingSwitch(null)}
          onProceed={async () => {
            const action = pendingSwitch;
            setPendingSwitch(null);
            await action();
          }}
        />
      )}
    </nav>
  );
}

function FileMenuItem({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      style={{
        ...styles.dropdownItem,
        ...(disabled ? styles.dropdownItemDisabled : {}),
      }}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function capitalize(s: string): string {
  const first = s.charAt(0);
  return first === '' ? s : first.toUpperCase() + s.slice(1);
}
