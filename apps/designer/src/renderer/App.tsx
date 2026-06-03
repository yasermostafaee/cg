import { useEffect, useState } from 'react';
import type { DesignerBridge } from '../shared/designer-bridge.js';
import { ProjectAssetsPanel } from './features/assets/ProjectAssetsPanel.js';
import { CanvasArea } from './features/canvas/CanvasArea.js';
import { InspectorPanel } from './features/inspector/InspectorPanel.js';
import { IssuesPanel } from './features/issues/IssuesPanel.js';
import { LandingView } from './features/shell/LandingView.js';
import { Splitter } from './features/shell/Splitter.js';
import { TopToolbar } from './features/shell/TopToolbar.js';
import { TransportBar } from './features/shell/TransportBar.js';
import { StatusBar } from './features/status/StatusBar.js';
import { TimelineDock } from './features/timeline/TimelineDock.js';
import { useIssues } from './hooks/useIssues.js';
import { useDesignerStore } from './state/store.js';
import { colors } from './theme.js';

declare global {
  interface Window {
    cg: DesignerBridge;
  }
}

const INSPECTOR_DEFAULT = 320;
const INSPECTOR_MIN = 240;
const INSPECTOR_MAX = 600;
const TIMELINE_DEFAULT = 260;
const TIMELINE_MIN = 140;
const TIMELINE_MAX = 600;
const ASSETS_DEFAULT = 200;
const ASSETS_MIN = 140;
const ASSETS_MAX = 360;

const styles = {
  page: {
    fontFamily:
      'Inter, system-ui, -apple-system, "Segoe UI", Vazirmatn, "Noto Sans Arabic", sans-serif',
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
  issuesWrap: {
    flexShrink: 0,
  },
  timelineWrap: {
    flexShrink: 0,
    display: 'flex',
    minWidth: 0,
    overflow: 'hidden',
  },
} as const;

/**
 * Designer root. Two top-level views (D-007):
 *
 *   view === 'landing'  →  full-page LandingView (starters + recent +
 *                          New project modal)
 *   view === 'studio'   →  TopToolbar + (Canvas / Inspector) splitter
 *                          + IssuesPanel + Timeline + StatusBar
 *
 * The previous left-side ToolRail + LibraryPanel are gone — tools live
 * in the top toolbar; project selection lives on the landing page.
 */
export function App(): JSX.Element {
  const {
    view,
    scene,
    projectPath,
    tool,
    selection,
    editingTextId,
    bindModeFieldId,
    currentFrame,
    selectedKeyframe,
    keyframeInspectorOpen,
  } = useDesignerStore();
  const issues = useIssues(scene);
  const [inspectorW, setInspectorW] = useState(INSPECTOR_DEFAULT);
  const [timelineH, setTimelineH] = useState(TIMELINE_DEFAULT);
  const [assetsW, setAssetsW] = useState(ASSETS_DEFAULT);

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

  // Disable browser defaults that fight the editor: page zoom (Ctrl/Cmd
  // +/-/0 and Ctrl+wheel), accidental text selection (except in real inputs),
  // and the disruptive Save/Print shortcuts. Reload, dev-tools, and clipboard
  // shortcuts are intentionally left alone.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (!e.ctrlKey && !e.metaKey) return;
      const k = e.key.toLowerCase();
      if (['+', '-', '=', '0', 's', 'p'].includes(k)) {
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

  if (view === 'landing' || scene === null) {
    return (
      <main style={styles.page}>
        <LandingView />
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.studioTop}>
        <TopToolbar scene={scene} projectPath={projectPath} issues={issues} />
      </div>
      <div style={styles.shell}>
        <div style={{ width: assetsW, flexShrink: 0, display: 'flex', minHeight: 0 }}>
          <ProjectAssetsPanel />
        </div>
        <Splitter
          axis="x"
          ariaLabel="Resize project assets panel"
          onResize={(dx) =>
            setAssetsW((w) => Math.max(ASSETS_MIN, Math.min(ASSETS_MAX, w + dx)))
          }
        />
        <div style={styles.centerCol}>
          <div style={styles.canvasWrap}>
            <CanvasArea
              scene={scene}
              tool={tool}
              selection={selection}
              editingTextId={editingTextId}
              bindModeFieldId={bindModeFieldId}
              currentFrame={currentFrame}
              showToolbar
            />
          </div>
          <TransportBar scene={scene} currentFrame={currentFrame} />
          {issues.length > 0 && (
            <div style={styles.issuesWrap}>
              <IssuesPanel issues={issues} />
            </div>
          )}
        </div>
        <Splitter
          axis="x"
          ariaLabel="Resize inspector panel"
          onResize={(dx) =>
            setInspectorW((w) => Math.max(INSPECTOR_MIN, Math.min(INSPECTOR_MAX, w - dx)))
          }
        />
        <div style={{ width: inspectorW, flexShrink: 0, display: 'flex', minHeight: 0 }}>
          <InspectorPanel
            scene={scene}
            projectPath={projectPath}
            selection={selection}
            selectedKeyframe={selectedKeyframe}
            keyframeInspectorOpen={keyframeInspectorOpen}
            currentFrame={currentFrame}
          />
        </div>
      </div>
      <Splitter
        axis="y"
        ariaLabel="Resize timeline panel"
        onResize={(dy) =>
          setTimelineH((h) => Math.max(TIMELINE_MIN, Math.min(TIMELINE_MAX, h - dy)))
        }
      />
      <div style={{ ...styles.timelineWrap, height: timelineH }}>
        <TimelineDock
          scene={scene}
          selection={selection}
          currentFrame={currentFrame}
          selectedKeyframe={selectedKeyframe}
        />
      </div>
      <StatusBar scene={scene} issues={issues} />
    </main>
  );
}
