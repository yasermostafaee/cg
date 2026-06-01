import { useState } from 'react';
import type { DesignerBridge } from '../shared/designer-bridge.js';
import { CanvasArea } from './features/canvas/CanvasArea.js';
import { InspectorPanel } from './features/inspector/InspectorPanel.js';
import { IssuesPanel } from './features/issues/IssuesPanel.js';
import { LandingView } from './features/shell/LandingView.js';
import { Splitter } from './features/shell/Splitter.js';
import { TopToolbar } from './features/shell/TopToolbar.js';
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
        <TopToolbar />
      </div>
      <div style={styles.shell}>
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
      <StatusBar scene={scene} projectPath={projectPath} issues={issues} />
    </main>
  );
}
