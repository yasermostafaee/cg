import { useEffect, useRef, useState } from 'react';
import type { Scene } from '@cg/shared-schema';
import type { ExportIssue } from '@cg/shared-ipc';
import {
  designerStore,
  editSceneOf,
  shallowEqual,
  useDesignerSelector,
} from '../../state/store.js';
import { cx } from '../../cx.js';
import { NewProjectModal } from './NewProjectModal.js';
import { PreviewModal } from '../fields/PreviewModal.js';
import { SaveBeforeSwitchModal } from './SaveBeforeSwitchModal.js';
import { ShortcutsModal } from './ShortcutsModal.js';
import * as s from './TopToolbar.css.js';

interface Props {
  scene: Scene | null;
  projectPath: string | null;
  issues: readonly ExportIssue[];
}

/**
 * D-008 top menu bar — Home / File / Edit / View / Help. Home returns
 * to the landing/project picker; the other items are placeholders for
 * future menus. SAVE / EXPORT live on the right side (moved from the
 * status bar so the operator's primary actions stay in the chrome).
 */
export function TopToolbar({ scene, projectPath, issues }: Props): JSX.Element {
  const { canUndo, canRedo, rulerVisible, snappingEnabled } = useDesignerSelector(
    (s) => ({
      canUndo: s.canUndo,
      canRedo: s.canRedo,
      rulerVisible: s.rulerVisible,
      snappingEnabled: s.snappingEnabled,
    }),
    shallowEqual,
  );
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const exportBlocked = scene === null || errorCount > 0;
  const [openMenu, setOpenMenu] = useState<'file' | 'edit' | 'view' | 'help' | null>(null);
  const [hoverNav, setHoverNav] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [newModalOpen, setNewModalOpen] = useState(false);
  // Snapshot of the open composition driven by the Preview modal (null = closed).
  const [previewScene, setPreviewScene] = useState<Scene | null>(null);
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
    const res = await window.cg.projects.saveDisk({ scene, askPath: false });
    if (res.ok) designerStore.markSaved();
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
    // Only prompt when there's unsaved work; otherwise switch straight through.
    if (scene === null || !designerStore.get().dirty) {
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

  /** D-019 — download a single self-contained CasparCG `.html` for the active comp. */
  async function exportHtml(): Promise<void> {
    const st = designerStore.get();
    // Export the open composition (what's on the canvas), not the layerless root.
    const target = editSceneOf(st.scene, st.activeCompositionId) ?? scene;
    if (target === null) return;
    if (errorCount > 0) {
      window.alert(`Export blocked: ${String(errorCount)} validation error(s) in Issues panel.`);
      return;
    }
    const { warnings } = await window.cg.export.runSingleFileHtml({ scene: target });
    if (warnings.length > 0) designerStore.showNotice(warnings.join('\n'));
  }

  /** Open the Preview modal on a snapshot of the open composition. */
  function openPreview(): void {
    const st = designerStore.get();
    const target = editSceneOf(st.scene, st.activeCompositionId) ?? scene;
    if (target !== null) setPreviewScene(target);
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
        <button
          type="button"
          className={navClass('home')}
          onClick={() => guardedSwitch(() => designerStore.setView('landing'))}
          onMouseEnter={() => setHoverNav('home')}
          onMouseLeave={() => setHoverNav(null)}
          title="Home"
          aria-label="Home"
        >
          Home
        </button>
        <div className={s.menuItemWrap} onPointerDown={(e) => e.stopPropagation()}>
          <button
            ref={fileBtnRef}
            type="button"
            className={navClass('file')}
            onClick={() => setOpenMenu((m) => (m === 'file' ? null : 'file'))}
            onMouseEnter={() => setHoverNav('file')}
            onMouseLeave={() => setHoverNav(null)}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'file'}
          >
            File
          </button>
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
                label="Export…"
                disabled={exportBlocked}
                onClick={() => runFileAction(exportVcg)}
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
          <button
            type="button"
            className={navClass('edit')}
            onClick={() => setOpenMenu((m) => (m === 'edit' ? null : 'edit'))}
            onMouseEnter={() => setHoverNav('edit')}
            onMouseLeave={() => setHoverNav(null)}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'edit'}
          >
            Edit
          </button>
          {openMenu === 'edit' && (
            <div className={s.dropdown} role="menu">
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
        <div className={s.menuItemWrap} onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={navClass('view')}
            onClick={() => setOpenMenu((m) => (m === 'view' ? null : 'view'))}
            onMouseEnter={() => setHoverNav('view')}
            onMouseLeave={() => setHoverNav(null)}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'view'}
          >
            View
          </button>
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
          <button
            type="button"
            className={navClass('help')}
            onClick={() => setOpenMenu((m) => (m === 'help' ? null : 'help'))}
            onMouseEnter={() => setHoverNav('help')}
            onMouseLeave={() => setHoverNav(null)}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'help'}
          >
            Help
          </button>
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
      <span className={s.spacer} />
      <button
        type="button"
        className={s.exportButton}
        disabled={scene === null}
        onClick={openPreview}
        title="Preview the composition with live data (simulated CasparCG output)"
      >
        PREVIEW
      </button>
      <button
        type="button"
        className={s.exportButton}
        disabled={exportBlocked}
        onClick={() => void exportVcg()}
        title={errorCount > 0 ? 'Resolve validation errors first' : 'Export to .vcg'}
      >
        EXPORT
      </button>
      <button
        type="button"
        className={s.exportButton}
        disabled={exportBlocked}
        onClick={() => void exportHtml()}
        title={
          errorCount > 0
            ? 'Resolve validation errors first'
            : 'Download a single self-contained CasparCG .html (with embedded GDD)'
        }
      >
        HTML
      </button>
      <button
        type="button"
        className={s.saveButton}
        disabled={scene === null}
        onClick={() => void save()}
      >
        SAVE
      </button>
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      {newModalOpen && <NewProjectModal onClose={() => setNewModalOpen(false)} />}
      {previewScene !== null && (
        <PreviewModal scene={previewScene} onClose={() => setPreviewScene(null)} />
      )}
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
      className={cx(s.dropdownItem, hover && s.dropdownItemActive)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      <span className={s.checkSlot} aria-hidden>
        {checked ? '✓' : ''}
      </span>
      {label}
    </button>
  );
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}
