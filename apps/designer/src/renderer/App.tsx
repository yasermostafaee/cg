import { useEffect, useMemo, useState } from 'react';
import type { DesignerBridge } from '../shared/designer-bridge.js';
import { ProjectAssetsPanel } from './features/assets/ProjectAssetsPanel.js';
import { SharedLibraryPanel } from './features/sharedLibrary/SharedLibraryPanel.js';
import { CompositionsPanel } from './features/compositions/CompositionsPanel.js';
import { CanvasArea } from './features/canvas/CanvasArea.js';
import { InspectorPanel } from './features/inspector/InspectorPanel.js';
import { InputTooltip } from './features/shell/InputTooltip.js';
import { LandingView } from './features/shell/LandingView.js';
import { Splitter } from './features/shell/Splitter.js';
import { TopToolbar } from './features/shell/TopToolbar.js';
import { TransportBar } from './features/shell/TransportBar.js';
import { StatusBar } from './features/status/StatusBar.js';
import { TimelineDock } from './features/timeline/TimelineDock.js';
import { primeAll as primeAllAssets } from './features/assets/assetUrlCache.js';
import { primeAll as primeAllSharedImages } from './features/sharedLibrary/sharedImageUrlCache.js';
import { useIssues } from './hooks/useIssues.js';
import { designerStore, editSceneOf, shallowEqual, useDesignerSelector } from './state/store.js';
import { colors } from './theme.js';
import { cx } from './cx.js';
import { Button } from './ui/Button.js';
import { Control } from './ui/Control.js';
import * as s from './App.css.js';

declare global {
  interface Window {
    cg: DesignerBridge;
  }
}

// The side panels are fixed-width (only the canvas↔timeline split is
// resizable). Left panel is a hard 244px; the inspector uses this width.
const INSPECTOR_DEFAULT = 320;
const TIMELINE_DEFAULT = 260;
const TIMELINE_MIN = 140;
const TIMELINE_MAX = 600;

/** Transient bottom-centre toast for user-facing notices (auto-dismiss + close). */
function Toast({ message }: { message: string }): JSX.Element {
  return (
    <div role="status" className={s.toast}>
      <span>{message}</span>
      <Control
        variant="bare"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={() => designerStore.dismissNotice()}
        className={s.toastClose}
      >
        ✕
      </Control>
    </div>
  );
}

/** Centre placeholder shown when no composition is open. */
function EmptyStage(): JSX.Element {
  return (
    <div className={s.emptyStage} aria-label="No active composition">
      <svg width="92" height="92" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="1.5" y="5" width="8.5" height="8" rx="1.4" fill="#38BDF8" opacity="0.55" />
        <rect x="5.5" y="2" width="8.5" height="8" rx="1.4" fill="#38BDF8" />
      </svg>
      <div className={s.emptyTitle}>No Active Compositions</div>
      <Button
        variant="bare"
        className={s.emptyButton}
        onClick={() => designerStore.addComposition()}
      >
        Create New Composition
      </Button>
    </div>
  );
}

type LeftPanel = 'compositions' | 'assets' | 'sharedLibrary';

/** Narrow left icon-rail that switches the adjacent panel (Compositions / Assets / Shared Library). */
function LeftRail({
  panel,
  onSelect,
}: {
  panel: LeftPanel;
  onSelect: (p: LeftPanel) => void;
}): JSX.Element {
  return (
    <div className={s.rail} aria-label="Panel switcher">
      <Control
        variant="bare"
        title="Compositions"
        aria-label="Compositions"
        aria-pressed={panel === 'compositions'}
        className={cx(s.railBtn, panel === 'compositions' && s.railBtnActive)}
        onClick={() => onSelect('compositions')}
      >
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect
            x="1.5"
            y="4.5"
            width="8.5"
            height="7.5"
            rx="1.3"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <rect
            x="5.5"
            y="2"
            width="8.5"
            height="7.5"
            rx="1.3"
            stroke="currentColor"
            strokeWidth="1.4"
            fill={colors.background}
          />
        </svg>
      </Control>
      <Control
        variant="bare"
        title="Project assets"
        aria-label="Project assets"
        aria-pressed={panel === 'assets'}
        className={cx(s.railBtn, panel === 'assets' && s.railBtnActive)}
        onClick={() => onSelect('assets')}
      >
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M1.8 4.2h4l1.2 1.4h7.2v6.6a.8.8 0 0 1-.8.8H2.6a.8.8 0 0 1-.8-.8z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </Control>
      <Control
        variant="bare"
        title="Shared library"
        aria-label="Shared library"
        aria-pressed={panel === 'sharedLibrary'}
        className={cx(s.railBtn, panel === 'sharedLibrary' && s.railBtnActive)}
        onClick={() => onSelect('sharedLibrary')}
      >
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2" y="2" width="9" height="9" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
          <rect
            x="5"
            y="5"
            width="9"
            height="9"
            rx="1.3"
            stroke="currentColor"
            strokeWidth="1.4"
            fill={colors.background}
          />
          <circle cx="8" cy="8.2" r="1.1" fill="currentColor" />
        </svg>
      </Control>
    </div>
  );
}

/**
 * Designer root. Two top-level views (D-007):
 *
 *   view === 'landing'  →  full-page LandingView (starters + recent +
 *                          New project modal)
 *   view === 'studio'   →  TopToolbar + (Canvas / Inspector) splitter
 *                          + Timeline + StatusBar (issues open from the bar)
 *
 * The previous left-side ToolRail + LibraryPanel are gone — tools live
 * in the top toolbar; project selection lives on the landing page.
 */
export function App(): JSX.Element {
  // Deliberately excludes `currentFrame`: the playhead tick fires every frame
  // during playback, and the frame-dependent surfaces (canvas, transport,
  // inspector, timeline) now read it themselves. Keeping App off `currentFrame`
  // stops the whole tree from re-rendering on every frame.
  const {
    view,
    scene,
    activeCompositionId,
    notice,
    projectPath,
    tool,
    selection,
    editingTextId,
    bindModeFieldId,
    selectedKeyframe,
    selectedKeyframes,
    keyframeInspectorOpen,
  } = useDesignerSelector(
    (s) => ({
      view: s.view,
      scene: s.scene,
      activeCompositionId: s.activeCompositionId,
      notice: s.notice,
      projectPath: s.projectPath,
      tool: s.tool,
      selection: s.selection,
      editingTextId: s.editingTextId,
      bindModeFieldId: s.bindModeFieldId,
      selectedKeyframe: s.selectedKeyframe,
      selectedKeyframes: s.selectedKeyframes,
      keyframeInspectorOpen: s.keyframeInspectorOpen,
    }),
    shallowEqual,
  );
  // The editing surface is the open composition (its own size / duration /
  // layers); null when nothing is open (→ empty state). Issues validate the
  // open composition, not the now-layerless project root.
  //
  // Memoised on its inputs: editSceneOf() spreads into a *new* object every
  // call, so deriving it inline gave a fresh reference each render. That fed
  // useIssues (effect dep `scene`), whose debounced preflight setIssues(...)
  // re-rendered App, which re-derived editScene, which re-ran the effect — a
  // ~200ms re-render loop of the whole tree even while idle. Pinning the
  // reference to [scene, activeCompositionId] breaks that loop.
  const editScene = useMemo(
    () => (scene === null ? null : editSceneOf(scene, activeCompositionId)),
    [scene, activeCompositionId],
  );
  const issues = useIssues(editScene);
  const [timelineH, setTimelineH] = useState(TIMELINE_DEFAULT);
  // Which panel the left icon-rail shows.
  const [leftPanel, setLeftPanel] = useState<LeftPanel>('compositions');

  // Resolve image/font asset URLs into the shared cache as soon as a project
  // becomes active, so the canvas renders imported / starter-seeded assets even
  // before the operator opens the Assets panel (which otherwise owns priming).
  const activeSceneId = scene?.id ?? null;
  useEffect(() => {
    if (activeSceneId === null) return;
    void primeAllAssets();
  }, [activeSceneId]);

  // D-040 — the shared image library is project-independent, so prime its blob
  // URLs once on mount; logos then render on the canvas regardless of which
  // left panel is open. New imports prime themselves (CanvasArea subscribes).
  useEffect(() => {
    void primeAllSharedImages();
  }, []);

  // Suppress the native browser context menu app-wide. Our own menus
  // (timeline layer, project assets, keyframe) open from their React
  // onContextMenu handlers, which set state and call preventDefault
  // themselves, so they are unaffected by this global default-suppression.
  useEffect(() => {
    function suppressNativeMenu(e: MouseEvent): void {
      e.preventDefault();
    }
    window.addEventListener('contextmenu', suppressNativeMenu);
    return () => window.removeEventListener('contextmenu', suppressNativeMenu);
  }, []);

  // Select the whole value when a text field is first clicked, so a
  // keystroke replaces it — matching the number inputs (which focus-and-
  // select via their scrub gesture). preventDefault stops the click from
  // collapsing the selection to a caret; a second click (already focused)
  // falls through so the caret can be placed normally.
  useEffect(() => {
    function onPointerDown(e: PointerEvent): void {
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;
      const type = (el.type || 'text').toLowerCase();
      if (!['text', 'search', 'url', 'email', 'tel'].includes(type)) return;
      if (el.readOnly || el.disabled || document.activeElement === el) return;
      e.preventDefault();
      el.focus();
      el.select();
    }
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  // Disable browser defaults that fight the editor: page zoom (Ctrl/Cmd
  // +/-/0 and Ctrl+wheel), accidental text selection (except in real inputs),
  // and the disruptive Save/Print shortcuts. Reload, dev-tools, and clipboard
  // shortcuts are intentionally left alone.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (!e.ctrlKey && !e.metaKey) return;
      // Use the physical key (layout-independent) so Ctrl+S/P/0/± are caught on
      // non-English keyboards too.
      const blocked = new Set([
        'KeyS',
        'KeyP',
        'Digit0',
        'Numpad0',
        'Equal',
        'Minus',
        'NumpadAdd',
        'NumpadSubtract',
      ]);
      if (blocked.has(e.code)) {
        e.preventDefault();
      }
    }
    function onWheel(e: WheelEvent): void {
      if (e.ctrlKey) e.preventDefault(); // block ctrl/pinch page zoom
    }
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('wheel', onWheel, { passive: false });
    // App-wide no-select, but keep text editable fields selectable.
    const style = document.createElement('style');
    style.textContent =
      'body{user-select:none;-webkit-user-select:none;}' +
      'input,textarea,[contenteditable]{user-select:text;-webkit-user-select:text;}';
    document.head.appendChild(style);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('wheel', onWheel);
      style.remove();
    };
  }, []);

  // "R" toggles the canvas rulers (no modifier). Ignored while typing in a
  // field so it doesn't fight text entry.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return;
      }
      // Physical key, so it also fires on non-English layouts.
      if (e.code === 'KeyR') {
        e.preventDefault();
        designerStore.toggleRuler();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Delete / Backspace removes the current selection — keyframe(s) first, else the
  // selected layer(s)/shape(s) (see store.deleteSelection for the precedence).
  // Ignored while an editable field is focused so typing Delete in the label input
  // doesn't delete the layer. Undoable (history coalesces the burst).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return;
      }
      const st = designerStore.get();
      if (st.selectedKeyframes.length === 0 && st.selection.size === 0) return;
      e.preventDefault();
      // Start a fresh undo entry so the delete isn't coalesced with a prior edit.
      designerStore.markHistoryBoundary();
      designerStore.deleteSelection();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (view === 'landing' || scene === null) {
    return (
      <main className={s.page}>
        <LandingView />
        <InputTooltip />
      </main>
    );
  }

  return (
    <main className={s.page}>
      <div className={s.studioTop}>
        <TopToolbar scene={scene} projectPath={projectPath} issues={issues} />
      </div>
      <div className={s.shell}>
        <LeftRail panel={leftPanel} onSelect={setLeftPanel} />
        <div className={s.sidePanel} style={{ width: 244 }}>
          {leftPanel === 'compositions' ? (
            <CompositionsPanel />
          ) : leftPanel === 'sharedLibrary' ? (
            <SharedLibraryPanel />
          ) : (
            <ProjectAssetsPanel />
          )}
        </div>
        {editScene === null ? (
          <EmptyStage />
        ) : (
          <>
            <div className={s.centerCol}>
              <div className={s.canvasWrap}>
                <CanvasArea
                  scene={editScene}
                  tool={tool}
                  selection={selection}
                  editingTextId={editingTextId}
                  bindModeFieldId={bindModeFieldId}
                  showToolbar
                />
              </div>
              <TransportBar scene={editScene} />
            </div>
            <div className={s.sidePanel} style={{ width: INSPECTOR_DEFAULT }}>
              <InspectorPanel
                scene={editScene}
                projectPath={projectPath}
                selection={selection}
                selectedKeyframe={selectedKeyframe}
                selectedKeyframes={selectedKeyframes}
                keyframeInspectorOpen={keyframeInspectorOpen}
              />
            </div>
          </>
        )}
      </div>
      {editScene !== null && (
        <>
          <Splitter
            axis="y"
            ariaLabel="Resize timeline panel"
            onResize={(dy) =>
              setTimelineH((h) => Math.max(TIMELINE_MIN, Math.min(TIMELINE_MAX, h - dy)))
            }
          />
          <div className={s.timelineWrap} style={{ height: timelineH }}>
            <TimelineDock
              scene={editScene}
              selection={selection}
              selectedKeyframe={selectedKeyframe}
              selectedKeyframes={selectedKeyframes}
            />
          </div>
        </>
      )}
      <StatusBar scene={editScene ?? scene} issues={issues} />
      {notice !== null && <Toast message={notice} />}
      <InputTooltip />
    </main>
  );
}
