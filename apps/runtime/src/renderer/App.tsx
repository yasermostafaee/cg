import { useMemo, useState } from 'react';
import type { RuntimeBridge } from '../shared/runtime-bridge.js';
import { AuditPanel } from './features/audit/AuditPanel.js';
import { FailoverBanner } from './features/connections/FailoverBanner.js';
import { LibraryPanel } from './features/library/LibraryPanel.js';
import { StackPanel } from './features/stack/StackPanel.js';
import { Inspector } from './features/inspector/Inspector.js';
import { LockOverlay } from './features/lock/LockOverlay.js';
import { StatusBar } from './features/status/StatusBar.js';
import { useConnections } from './hooks/useConnections.js';
import { useLock } from './hooks/useLock.js';
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
  const lock = useLock();
  const health = useConnections();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const selected = useMemo(
    () => items.find((i) => i.itemId === selectedId) ?? null,
    [items, selectedId],
  );

  return (
    <main style={styles.page}>
      <FailoverBanner health={health} />
      <div style={styles.shell}>
        <LibraryPanel />
        <section style={styles.workspace}>
          <div style={styles.monitor}>
            PVW / PGM monitor strip will live here. Full monitor with frame grabs is M9.
          </div>
          <StackPanel onSelectionChange={setSelectedId} />
        </section>
        <Inspector item={selected} />
      </div>
      <StatusBar onOpenAudit={() => setAuditOpen(true)} />
      <AuditPanel open={auditOpen} onClose={() => setAuditOpen(false)} />
      <LockOverlay
        engaged={lock.engaged}
        {...(lock.engagedAt !== undefined ? { engagedAt: lock.engagedAt } : {})}
        {...(lock.reason !== undefined ? { reason: lock.reason } : {})}
        onRelease={(pin) => window.cg.lock.release({ pin })}
      />
    </main>
  );
}
