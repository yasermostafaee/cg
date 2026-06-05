import { useEffect, useState } from 'react';
import type { DesignerBridge } from '../shared/designer-bridge.js';
import { ProjectAssetsPanel } from './features/assets/ProjectAssetsPanel.js';
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
import { useIssues } from './hooks/useIssues.js';
import { designerStore, editSceneOf, useDesignerStore } from './state/store.js';
import { colors } from './theme.js';

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

const styles = {
  page: {
    fontFamily:
      '"Exo 2", Inter, system-ui, -apple-system, "Segoe UI", Vazirmatn, "Noto Sans Arabic", sans-serif',
    color: colors.text,
    background: colors.background,
    height: '100vh',
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  studioTop: {
    padding: '0.5rem 0.5rem 0',
  },
  shell: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    padding: '0.4rem 0.5rem 0',
    gap: 0,
  },
  centerCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    gap: '0.4rem',
    padding: '0 0.4rem',
  },
  canvasWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  timelineWrap: {
    flexShrink: 0,
    display: 'flex',
    minWidth: 0,
    overflow: 'hidden',
  },
  rail: {
    width: 40,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.2rem 0',
    // Same surface as the adjacent panels — just divided by a border, not a
    // darker strip.
    background: colors.panel,
    borderRight: `1px solid ${colors.border}`,
  },
  railBtn: {
    width: 30,
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    color: colors.textMuted,
    border: '1px solid transparent',
    borderRadius: '0.3rem',
    cursor: 'pointer',
    padding: 0,
  },
  railBtnActive: {
    // Active = a solid slate fill only (no border — the bordered box read as a
    // stray "white border" against the dark chrome).
    background: '#2e3346',
    color: colors.text,
  },
  emptyStage: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1.1rem',
    color: colors.textMuted,
  },
  emptyTitle: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.01em',
  },
  emptyButton: {
    background: 'transparent',
    color: colors.text,
    border: `1px solid ${colors.accentMuted}`,
    borderRadius: '0.35rem',
    padding: '0.7rem 1.4rem',
    fontSize: '0.92rem',
    cursor: 'pointer',
  },
} as const;

/** Transient bottom-centre toast for user-facing notices (auto-dismiss + close). */
function Toast({ message }: { message: string }): JSX.Element {
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 28,
        transform: 'translateX(-50%)',
        maxWidth: 460,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.6rem',
        background: '#1c1f2d',
        color: '#e5e7f3',
        border: '1px solid #f87171',
        borderRadius: '0.4rem',
        padding: '0.6rem 0.7rem 0.6rem 0.9rem',
        fontSize: '0.78rem',
        lineHeight: 1.4,
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        zIndex: 5000,
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={() => designerStore.dismissNotice()}
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          lineHeight: '16px',
          textAlign: 'center',
          background: 'transparent',
          color: '#fca5a5',
          border: 'none',
          borderRadius: '0.2rem',
          fontSize: '0.95rem',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}

/** Centre placeholder shown when no composition is open. */
function EmptyStage(): JSX.Element {
  return (
    <div style={styles.emptyStage} aria-label="No active composition">
      <svg width="92" height="92" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="1.5" y="5" width="8.5" height="8" rx="1.4" fill="#38BDF8" opacity="0.55" />
        <rect x="5.5" y="2" width="8.5" height="8" rx="1.4" fill="#38BDF8" />
      </svg>
      <div style={styles.emptyTitle}>No Active Compositions</div>
      <button
        type="button"
        style={styles.emptyButton}
        onClick={() => designerStore.addComposition()}
      >
        Create New Composition
      </button>
    </div>
  );
}

/** Narrow left icon-rail that switches the adjacent panel (Compositions ↔ Assets). */
function LeftRail({
  panel,
  onSelect,
}: {
  panel: 'compositions' | 'assets';
  onSelect: (p: 'compositions' | 'assets') => void;
}): JSX.Element {
  return (
    <div style={styles.rail} aria-label="Panel switcher">
      <button
        type="button"
        title="Compositions"
        aria-label="Compositions"
        aria-pressed={panel === 'compositions'}
        style={{ ...styles.railBtn, ...(panel === 'compositions' ? styles.railBtnActive : {}) }}
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
      </button>
      <button
        type="button"
        title="Project assets"
        aria-label="Project assets"
        aria-pressed={panel === 'assets'}
        style={{ ...styles.railBtn, ...(panel === 'assets' ? styles.railBtnActive : {}) }}
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
      </button>
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
    currentFrame,
    selectedKeyframe,
    selectedKeyframes,
    keyframeInspectorOpen,
  } = useDesignerStore();
  // The editing surface is the open composition (its own size / duration /
  // layers); null when nothing is open (→ empty state). Issues validate the
  // open composition, not the now-layerless project root.
  const editScene = scene === null ? null : editSceneOf(scene, activeCompositionId);
  const issues = useIssues(editScene);
  const [timelineH, setTimelineH] = useState(TIMELINE_DEFAULT);
  // Which panel the left icon-rail shows.
  const [leftPanel, setLeftPanel] = useState<'compositions' | 'assets'>('compositions');

  // Resolve image/font asset URLs into the shared cache as soon as a project
  // becomes active, so the canvas renders imported / starter-seeded assets even
  // before the operator opens the Assets panel (which otherwise owns priming).
  const activeSceneId = scene?.id ?? null;
  useEffect(() => {
    if (activeSceneId === null) return;
    void primeAllAssets();
  }, [activeSceneId]);

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

  if (view === 'landing' || scene === null) {
    return (
      <main style={styles.page}>
        <LandingView />
        <InputTooltip />
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.studioTop}>
        <TopToolbar scene={scene} projectPath={projectPath} issues={issues} />
      </div>
      <div style={styles.shell}>
        <LeftRail panel={leftPanel} onSelect={setLeftPanel} />
        <div style={{ width: 244, flexShrink: 0, display: 'flex', minHeight: 0 }}>
          {leftPanel === 'compositions' ? <CompositionsPanel /> : <ProjectAssetsPanel />}
        </div>
        {editScene === null ? (
          <EmptyStage />
        ) : (
          <>
            <div style={styles.centerCol}>
              <div style={styles.canvasWrap}>
                <CanvasArea
                  scene={editScene}
                  tool={tool}
                  selection={selection}
                  editingTextId={editingTextId}
                  bindModeFieldId={bindModeFieldId}
                  currentFrame={currentFrame}
                  showToolbar
                />
              </div>
              <TransportBar scene={editScene} currentFrame={currentFrame} />
            </div>
            <div style={{ width: INSPECTOR_DEFAULT, flexShrink: 0, display: 'flex', minHeight: 0 }}>
              <InspectorPanel
                scene={editScene}
                projectPath={projectPath}
                selection={selection}
                selectedKeyframe={selectedKeyframe}
                selectedKeyframes={selectedKeyframes}
                keyframeInspectorOpen={keyframeInspectorOpen}
                currentFrame={currentFrame}
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
          <div style={{ ...styles.timelineWrap, height: timelineH }}>
            <TimelineDock
              scene={editScene}
              selection={selection}
              currentFrame={currentFrame}
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
