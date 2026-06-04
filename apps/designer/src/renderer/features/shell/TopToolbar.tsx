import { useEffect, useRef, useState } from 'react';
import type { Scene } from '@cg/shared-schema';
import type { ExportIssue } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { designerStore, useDesignerStore } from '../../state/store.js';
import { NewProjectModal } from './NewProjectModal.js';
import { SaveBeforeSwitchModal } from './SaveBeforeSwitchModal.js';
import { ShortcutsModal } from './ShortcutsModal.js';

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
  // Hover / open feedback for the top-level menu buttons and dropdown
  // rows — a solid slate fill, matching the Loopic reference's menu bar.
  menuItemActive: {
    background: colors.menuHover,
    color: colors.text,
  },
  dropdownItemActive: {
    background: colors.menuHover,
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
  const { canUndo, canRedo, rulerVisible, snappingEnabled } = useDesignerStore();
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const exportBlocked = scene === null || errorCount > 0;
  const [openMenu, setOpenMenu] = useState<'file' | 'edit' | 'view' | 'help' | null>(null);
  const [hoverNav, setHoverNav] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
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

  // Top-level menu button style — tinted when its dropdown is open or
  // the pointer is over it.
  function navStyle(key: string): React.CSSProperties {
    const active = openMenu === key || hoverNav === key;
    return {
      ...styles.menuItem,
      ...(active ? styles.menuItemActive : {}),
    };
  }

  // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo. Capture phase
  // so we see the event before anything else can call preventDefault.
  // Skip when the operator is typing into a regular text input so the
  // browser's per-field history still works for editing scenarios; in
  // every other context (canvas, timeline, blank focus) the shortcuts
  // route to the scene-level undo stack.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      if (target !== null) {
        const tag = target.tagName;
        const isTextInput =
          tag === 'TEXTAREA' ||
          target.isContentEditable ||
          (tag === 'INPUT' &&
            ['text', 'search', 'url', 'email', 'tel', 'password'].includes(
              ((target as HTMLInputElement).type || 'text').toLowerCase(),
            ));
        if (isTextInput) return;
      }
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        designerStore.undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        designerStore.redo();
      }
    }
    // `pointerup` closes the current history-coalescing window so an
    // immediately-following unrelated edit starts its own undo entry.
    function onPointerUp(): void {
      designerStore.markHistoryBoundary();
    }
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerup', onPointerUp, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerup', onPointerUp, true);
    };
  }, []);

  return (
    <nav style={styles.bar} aria-label="Application menu">
      <div style={styles.group}>
        <button
          type="button"
          style={navStyle('home')}
          onClick={() => designerStore.setView('landing')}
          onMouseEnter={() => setHoverNav('home')}
          onMouseLeave={() => setHoverNav(null)}
          title="Home"
          aria-label="Home"
        >
          Home
        </button>
        <div style={styles.menuItemWrap} onPointerDown={(e) => e.stopPropagation()}>
          <button
            ref={fileBtnRef}
            type="button"
            style={navStyle('file')}
            onClick={() => setOpenMenu((m) => (m === 'file' ? null : 'file'))}
            onMouseEnter={() => setHoverNav('file')}
            onMouseLeave={() => setHoverNav(null)}
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
        <div style={styles.menuItemWrap} onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            style={navStyle('edit')}
            onClick={() => setOpenMenu((m) => (m === 'edit' ? null : 'edit'))}
            onMouseEnter={() => setHoverNav('edit')}
            onMouseLeave={() => setHoverNav(null)}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'edit'}
          >
            Edit
          </button>
          {openMenu === 'edit' && (
            <div style={styles.dropdown} role="menu">
              <FileMenuItem
                label={isMac() ? 'Undo  ⌘Z' : 'Undo  Ctrl+Z'}
                disabled={!canUndo}
                onClick={() => runFileAction(() => designerStore.undo())}
              />
              <FileMenuItem
                label={isMac() ? 'Redo  ⇧⌘Z' : 'Redo  Ctrl+Shift+Z'}
                disabled={!canRedo}
                onClick={() => runFileAction(() => designerStore.redo())}
              />
            </div>
          )}
        </div>
        <div style={styles.menuItemWrap} onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            style={navStyle('view')}
            onClick={() => setOpenMenu((m) => (m === 'view' ? null : 'view'))}
            onMouseEnter={() => setHoverNav('view')}
            onMouseLeave={() => setHoverNav(null)}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'view'}
          >
            View
          </button>
          {openMenu === 'view' && (
            <div style={styles.dropdown} role="menu">
              <ToggleMenuItem
                label="Ruler"
                checked={rulerVisible}
                onClick={() => {
                  setOpenMenu(null);
                  designerStore.toggleRuler();
                }}
              />
              <ToggleMenuItem
                label="Snapping"
                checked={snappingEnabled}
                onClick={() => {
                  setOpenMenu(null);
                  designerStore.toggleSnapping();
                }}
              />
            </div>
          )}
        </div>
        <div style={styles.menuItemWrap} onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            style={navStyle('help')}
            onClick={() => setOpenMenu((m) => (m === 'help' ? null : 'help'))}
            onMouseEnter={() => setHoverNav('help')}
            onMouseLeave={() => setHoverNav(null)}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'help'}
          >
            Help
          </button>
          {openMenu === 'help' && (
            <div style={styles.dropdown} role="menu">
              <FileMenuItem label="Start Tutorial" disabled onClick={() => undefined} />
              <FileMenuItem
                label="Keyboard Shortcuts"
                onClick={() => {
                  setOpenMenu(null);
                  setShortcutsOpen(true);
                }}
              />
              <FileMenuItem label="Documentation" disabled onClick={() => undefined} />
              <FileMenuItem label="About" disabled onClick={() => undefined} />
              <FileMenuItem label="Changelog" disabled onClick={() => undefined} />
            </div>
          )}
        </div>
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
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
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
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      role="menuitem"
      style={{
        ...styles.dropdownItem,
        ...(disabled ? styles.dropdownItemDisabled : {}),
        ...(hover && !disabled ? styles.dropdownItemActive : {}),
      }}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** Dropdown item with a leading checkmark for on/off View options. */
function ToggleMenuItem({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}): JSX.Element {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      style={{ ...styles.dropdownItem, ...(hover ? styles.dropdownItemActive : {}) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      <span style={{ display: 'inline-block', width: 14 }} aria-hidden>
        {checked ? '✓' : ''}
      </span>
      {label}
    </button>
  );
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}
