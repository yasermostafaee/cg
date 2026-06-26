import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { Scene } from '@cg/shared-schema';
import { designerStore, shallowEqual, useDesignerSelector } from '../../state/store.js';
import { cx } from '../../cx.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { NewProjectModal } from './NewProjectModal.js';
import { SaveBeforeSwitchModal } from './SaveBeforeSwitchModal.js';
import { ShortcutsModal } from './ShortcutsModal.js';
import * as s from './TopToolbar.css.js';

interface Props {
  scene: Scene | null;
  projectPath: string | null;
}

/**
 * D-008 top menu bar — Home / File / Edit / View / Help. Home returns
 * to the landing/project picker; the other items are placeholders for
 * future menus. D-095/D-086 — the centered project name + adjacent SAVE sit in
 * the middle; Preview / Export moved to the per-composition bar above the canvas
 * (`CompositionActionBar`), since the export engine is now per-composition.
 */
export function TopToolbar({ scene, projectPath }: Props): JSX.Element {
  const { canUndo, canRedo, rulerVisible, snappingEnabled, dirty } = useDesignerSelector(
    (s) => ({
      canUndo: s.canUndo,
      canRedo: s.canRedo,
      rulerVisible: s.rulerVisible,
      snappingEnabled: s.snappingEnabled,
      dirty: s.dirty,
    }),
    shallowEqual,
  );
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

  // D-100 — once a top menu is open (by click), hovering another top-menu button switches to it
  // (standard menubar behavior). When none is open, hover only highlights — a click still opens
  // the first menu.
  const onNavHover = (key: 'file' | 'edit' | 'view' | 'help'): void => {
    setHoverNav(key);
    setOpenMenu((m) => (m === null ? null : key));
  };

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
    const res = await window.cg.projects.saveDisk({ scene, askPath: false });
    if (res.ok) {
      designerStore.markSaved();
      return;
    }
    // D-088 — the write to the saved file threw (permission/disk/invalid handle):
    // notice + retry as Save As.
    if (res.reason === 'write-failed') {
      designerStore.showNotice("Couldn't write to the file — choose where to save.");
      await saveAs();
    }
  }

  async function saveAs(): Promise<void> {
    if (scene === null) return;
    const res = await window.cg.projects.saveDisk({ scene, askPath: true });
    if (res.ok) designerStore.markSaved();
  }

  function newProject(): void {
    // Mirrors the LandingView entry point — the New Project modal
    // collects name, resolution, and frame rate, then calls
    // projects.create and setScene itself.
    setNewModalOpen(true);
  }

  async function openProject(): Promise<void> {
    // D-088 — open via the handle-carrying picker so a later Save writes back to the file.
    const result = await window.cg.projects.openDisk();
    if (result.scene !== null) designerStore.setScene(result.scene, null);
  }

  function closeProject(): void {
    designerStore.closeProject();
  }

  /**
   * Run `action` immediately when nothing is loaded, otherwise queue
   * it behind the save-before-switch modal. Matches the LandingView
   * `guardedSwitch` pattern so the operator has a single, consistent
   * "you have unsaved work" prompt no matter where the switch is
   * triggered from.
   */
  function guardedSwitch(action: () => void | Promise<void>): void {
    // Only prompt when there's unsaved work; otherwise switch straight through.
    if (scene === null || !designerStore.get().dirty) {
      void Promise.resolve(action());
      return;
    }
    setPendingSwitch(() => async () => {
      await Promise.resolve(action());
    });
  }

  // D-086 Phase B — Preview / Export (.vcg + HTML) moved OUT of the global bar to
  // the per-composition action bar above the canvas (`CompositionActionBar`). The
  // export engine is already per-composition (Phase A); the global bar keeps only
  // the project-wide menus + Save.

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
  function navClass(key: string): string {
    const active = openMenu === key || hoverNav === key;
    return cx(s.menuItem, active && s.menuItemActive);
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
      // Match the physical key (e.code), so the shortcuts work on non-English
      // layouts (Persian, etc.) where e.key is a different character.
      if (e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        designerStore.undo();
      } else if ((e.code === 'KeyZ' && e.shiftKey) || e.code === 'KeyY') {
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
    <nav className={s.bar} aria-label="Application menu">
      <div className={s.group}>
        <Button
          variant="bare"
          className={navClass('home')}
          onClick={() => guardedSwitch(() => designerStore.closeProject())}
          onMouseEnter={() => setHoverNav('home')}
          onMouseLeave={() => setHoverNav(null)}
          title="Home"
          aria-label="Home"
        >
          Home
        </Button>
        <div className={s.menuItemWrap} onPointerDown={(e) => e.stopPropagation()}>
          <Button
            ref={fileBtnRef}
            variant="bare"
            className={navClass('file')}
            onClick={() => setOpenMenu((m) => (m === 'file' ? null : 'file'))}
            onMouseEnter={() => onNavHover('file')}
            onMouseLeave={() => setHoverNav(null)}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'file'}
          >
            File
          </Button>
          {openMenu === 'file' && (
            <div className={s.dropdown} role="menu">
              <FileMenuItem label="New" onClick={() => runFileSwitch(newProject)} />
              <FileMenuItem label="Open…" onClick={() => runFileSwitch(openProject)} />
              <div className={s.dropdownDivider} aria-hidden />
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
              <div className={s.dropdownDivider} aria-hidden />
              <FileMenuItem
                label="Close project"
                disabled={scene === null}
                onClick={() => runFileSwitch(closeProject)}
              />
            </div>
          )}
        </div>
        <div className={s.menuItemWrap} onPointerDown={(e) => e.stopPropagation()}>
          <Button
            variant="bare"
            className={navClass('edit')}
            onClick={() => setOpenMenu((m) => (m === 'edit' ? null : 'edit'))}
            onMouseEnter={() => onNavHover('edit')}
            onMouseLeave={() => setHoverNav(null)}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'edit'}
          >
            Edit
          </Button>
          {openMenu === 'edit' && (
            <div className={s.dropdown} role="menu">
              <FileMenuItem
                label="Undo"
                shortcut={isMac() ? '⌘Z' : 'Ctrl+Z'}
                disabled={!canUndo}
                onClick={() => runFileAction(() => designerStore.undo())}
              />
              <FileMenuItem
                label="Redo"
                shortcut={isMac() ? '⇧⌘Z' : 'Ctrl+Shift+Z'}
                disabled={!canRedo}
                onClick={() => runFileAction(() => designerStore.redo())}
              />
            </div>
          )}
        </div>
        <div className={s.menuItemWrap} onPointerDown={(e) => e.stopPropagation()}>
          <Button
            variant="bare"
            className={navClass('view')}
            onClick={() => setOpenMenu((m) => (m === 'view' ? null : 'view'))}
            onMouseEnter={() => onNavHover('view')}
            onMouseLeave={() => setHoverNav(null)}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'view'}
          >
            View
          </Button>
          {openMenu === 'view' && (
            <div className={s.dropdown} role="menu">
              <ToggleMenuItem
                label="Ruler (R)"
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
        <div className={s.menuItemWrap} onPointerDown={(e) => e.stopPropagation()}>
          <Button
            variant="bare"
            className={navClass('help')}
            onClick={() => setOpenMenu((m) => (m === 'help' ? null : 'help'))}
            onMouseEnter={() => onNavHover('help')}
            onMouseLeave={() => setHoverNav(null)}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'help'}
          >
            Help
          </Button>
          {openMenu === 'help' && (
            <div className={s.dropdown} role="menu">
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
      {/* D-095/D-086 — centered project name with Save adjacent. Preview/Export
          moved to the per-composition bar; the right side is otherwise empty. */}
      <div className={s.centerCluster}>
        {scene !== null && (
          <span className={s.projectName} title={scene.name} data-testid="project-name">
            {scene.name}
          </span>
        )}
        <Button
          size="sm"
          className={cx(s.saveCtl, dirty && s.saveCtlDirty)}
          disabled={scene === null || !dirty}
          onClick={() => void save()}
          title={dirty ? 'Save changes' : 'No unsaved changes'}
        >
          SAVE
        </Button>
      </div>
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
  shortcut,
  onClick,
  disabled = false,
}: {
  label: string;
  /** Optional keyboard-shortcut hint, shown in parentheses (smaller, muted gray). */
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
}): JSX.Element {
  const [hover, setHover] = useState(false);
  return (
    <Button
      variant="bare"
      role="menuitem"
      className={cx(
        s.dropdownItem,
        disabled && s.dropdownItemDisabled,
        hover && !disabled && s.dropdownItemActive,
      )}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      {label}
      {shortcut !== undefined && <span className={s.menuShortcut}>({shortcut})</span>}
    </Button>
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
    <Button
      variant="bare"
      role="menuitemcheckbox"
      aria-checked={checked}
      className={cx(s.dropdownItem, hover && s.dropdownItemActive)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      <span className={s.checkSlot} aria-hidden>
        {checked ? <Icon icon={Check} size={14} /> : ''}
      </span>
      {label}
    </Button>
  );
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}
