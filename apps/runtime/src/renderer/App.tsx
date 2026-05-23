import { useMemo, useState } from 'react';
import type { RuntimeBridge } from '../shared/runtime-bridge.js';
import { StackPanel } from './features/stack/StackPanel.js';
import { Inspector } from './features/inspector/Inspector.js';
import { StatusBar } from './features/status/StatusBar.js';
import { useStack } from './hooks/useStack.js';
import { colors } from './theme.js';

declare global {
  interface Window {
    cg: RuntimeBridge;
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
    gridTemplateColumns: '240px 1fr 320px',
    gap: '0.75rem',
    padding: '0.75rem',
    minHeight: 0,
  },
  sidebar: {
    background: colors.panel,
    borderRadius: '0.25rem',
    border: `1px solid ${colors.border}`,
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  },
  sidebarHeading: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    margin: 0,
  },
  sidebarHint: { fontSize: '0.8rem', color: colors.textMuted, lineHeight: 1.4 },
  workspace: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
    minHeight: 0,
  },
  monitor: {
    background: colors.panel,
    borderRadius: '0.25rem',
    border: `1px solid ${colors.border}`,
    padding: '1rem',
    color: colors.textMuted,
    fontSize: '0.9rem',
  },
} as const;

/** Root Runtime layout — four regions per Phase 6 §2. */
export function App(): JSX.Element {
  const items = useStack();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => items.find((i) => i.itemId === selectedId) ?? null,
    [items, selectedId],
  );

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <nav style={styles.sidebar} aria-label="Library">
          <h2 style={styles.sidebarHeading}>LIBRARY</h2>
          <p style={styles.sidebarHint}>
            Drop a <code>.vcg</code> into the watched folder to register a template.
          </p>
          <p style={styles.sidebarHint}>
            Library browser arrives with M5.4; for now items are pre-loaded via the demo harness
            (M5.3).
          </p>
        </nav>
        <section style={styles.workspace}>
          <div style={styles.monitor}>
            PVW / PGM monitor strip will live here. Full monitor with frame grabs is M9.
          </div>
          <StackPanel onSelectionChange={setSelectedId} />
        </section>
        <Inspector item={selected} />
      </div>
      <StatusBar />
    </main>
  );
}
