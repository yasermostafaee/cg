import { useState } from 'react';
import type { DesignerBridge } from '../shared/designer-bridge.js';
import { CanvasArea } from './features/canvas/CanvasArea.js';
import { InspectorPanel } from './features/inspector/InspectorPanel.js';
import { IssuesPanel } from './features/issues/IssuesPanel.js';
import { LibraryPanel } from './features/library/LibraryPanel.js';
import { Splitter } from './features/shell/Splitter.js';
import { StatusBar } from './features/status/StatusBar.js';
import { TimelineDock } from './features/timeline/TimelineDock.js';
import { ToolRail } from './features/tools/ToolRail.js';
import { useIssues } from './hooks/useIssues.js';
import { useDesignerStore } from './state/store.js';
import { colors } from './theme.js';

declare global {
  interface Window {
    cg: DesignerBridge;
  }
}

const LIBRARY_DEFAULT = 240;
const LIBRARY_MIN = 180;
const LIBRARY_MAX = 480;
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
  shell: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    padding: '0.5rem 0.5rem 0',
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
 * Designer root layout (B-001 resize pass) — viewport-locked, internally
 * scrolling, draggable splitters:
 *   ┌──────────┬────┬─────────────────────┬───────────┐
 *   │ Library  │Tool│ Canvas              │ Inspector │
 *   │ (w drag) │ 56 │ (issues panel below)│  (w drag) │
 *   ├──────────┴────┴═════════════════════╧═══════════┤  ← y-splitter
 *   │ Timeline dock (h drag, internal scroll)         │
 *   ├─────────────────────────────────────────────────┤
 *   │ Status bar                                      │
 *   └─────────────────────────────────────────────────┘
 *
 * The page itself never scrolls (`height: 100vh; overflow: hidden`); each
 * panel manages its own overflow.
 */
export function App(): JSX.Element {
  const {
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
  const [libraryW, setLibraryW] = useState(LIBRARY_DEFAULT);
  const [inspectorW, setInspectorW] = useState(INSPECTOR_DEFAULT);
  const [timelineH, setTimelineH] = useState(TIMELINE_DEFAULT);

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <div style={{ width: libraryW, flexShrink: 0, display: 'flex', minHeight: 0 }}>
          <LibraryPanel />
        </div>
        <Splitter
          axis="x"
          ariaLabel="Resize library panel"
          onResize={(dx) =>
            setLibraryW((w) => Math.max(LIBRARY_MIN, Math.min(LIBRARY_MAX, w + dx)))
          }
        />
        <ToolRail tool={tool} />
        <div style={styles.centerCol}>
          <div style={styles.canvasWrap}>
            <CanvasArea
              scene={scene}
              tool={tool}
              selection={selection}
              editingTextId={editingTextId}
              bindModeFieldId={bindModeFieldId}
            />
          </div>
          {scene !== null && issues.length > 0 && (
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
      {scene !== null && (
        <Splitter
          axis="y"
          ariaLabel="Resize timeline panel"
          onResize={(dy) =>
            setTimelineH((h) => Math.max(TIMELINE_MIN, Math.min(TIMELINE_MAX, h - dy)))
          }
        />
      )}
      {scene !== null && (
        <div style={{ ...styles.timelineWrap, height: timelineH }}>
          <TimelineDock
            scene={scene}
            selection={selection}
            currentFrame={currentFrame}
            selectedKeyframe={selectedKeyframe}
          />
        </div>
      )}
      <StatusBar scene={scene} projectPath={projectPath} issues={issues} />
    </main>
  );
}
