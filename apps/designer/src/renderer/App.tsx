import type { DesignerBridge } from '../shared/designer-bridge.js';
import { CanvasArea } from './features/canvas/CanvasArea.js';
import { InspectorPanel } from './features/inspector/InspectorPanel.js';
import { LibraryPanel } from './features/library/LibraryPanel.js';
import { StatusBar } from './features/status/StatusBar.js';
import { ToolRail } from './features/tools/ToolRail.js';
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
    gridTemplateRows: '1fr auto',
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
  const { scene, projectPath, tool, selection, editingTextId } = useDesignerStore();

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
          />
        </div>
        <InspectorPanel scene={scene} projectPath={projectPath} selection={selection} />
      </div>
      <StatusBar scene={scene} projectPath={projectPath} />
    </main>
  );
}
