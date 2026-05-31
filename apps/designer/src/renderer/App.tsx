import type { DesignerBridge } from '../shared/designer-bridge.js';
import { CanvasArea } from './features/canvas/CanvasArea.js';
import { InspectorPanel } from './features/inspector/InspectorPanel.js';
import { IssuesPanel } from './features/issues/IssuesPanel.js';
import { LibraryPanel } from './features/library/LibraryPanel.js';
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

const styles = {
  page: {
    fontFamily:
      'Inter, system-ui, -apple-system, "Segoe UI", Vazirmatn, "Noto Sans Arabic", sans-serif',
    color: colors.text,
    background: colors.background,
    minHeight: '100vh',
    margin: 0,
    display: 'grid',
    gridTemplateRows: '1fr auto auto',
  },
  shell: {
    display: 'grid',
    gridTemplateColumns: '240px 56px 1fr 320px',
    gap: '0.75rem',
    padding: '0.75rem',
    minHeight: 0,
  },
  canvasWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: 0,
  },
} as const;

/**
 * Designer root layout — four regions per Phase 6 §11:
 *   ┌────────┬────┬───────────┬──────────┐
 *   │Library │Tool│  Canvas   │Inspector │
 *   │ (240)  │(56)│ (flex)    │  (320)   │
 *   ├────────┴────┴───────────┴──────────┤
 *   │ Status bar                         │
 *   └────────────────────────────────────┘
 */
export function App(): JSX.Element {
  const { scene, projectPath, tool, selection, editingTextId, bindModeFieldId, currentFrame } =
    useDesignerStore();
  const issues = useIssues(scene);

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <LibraryPanel />
        <ToolRail tool={tool} />
        <div style={styles.canvasWrap}>
          <CanvasArea
            scene={scene}
            tool={tool}
            selection={selection}
            editingTextId={editingTextId}
            bindModeFieldId={bindModeFieldId}
          />
        </div>
        <InspectorPanel scene={scene} projectPath={projectPath} selection={selection} />
      </div>
      {scene !== null && (
        <div
          style={{
            padding: '0 0.75rem 0.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <IssuesPanel issues={issues} />
        </div>
      )}
      {scene !== null && (
        <TimelineDock scene={scene} selection={selection} currentFrame={currentFrame} />
      )}
      <StatusBar scene={scene} projectPath={projectPath} issues={issues} />
    </main>
  );
}
