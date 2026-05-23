import { useConnections } from '../../hooks/useConnections.js';
import { useLock } from '../../hooks/useLock.js';
import { colors } from '../../theme.js';

const styles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
    padding: '0.5rem 1rem',
    background: colors.panel,
    borderTop: `1px solid ${colors.border}`,
    fontSize: '0.85rem',
    color: colors.textMuted,
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.15rem 0.5rem',
    borderRadius: '0.25rem',
    border: `1px solid ${colors.border}`,
    background: colors.panelMuted,
  },
  primary: { color: colors.ready },
  backup: { color: colors.textMuted },
  failed: { color: colors.offline },
  failedHard: { color: colors.error },
  ok: { color: '#10B981' },
  spacer: { flex: 1 },
  lock: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    color: colors.pending,
    fontWeight: 700,
  },
  lockButton: {
    background: 'transparent',
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    padding: '0.15rem 0.5rem',
    borderRadius: '0.25rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
} as const;

interface SessionLabel {
  text: string;
  style: { color: string };
}

function sessionLabel(state: string): SessionLabel {
  switch (state) {
    case 'healthy':
      return { text: 'HEALTHY', style: styles.ok };
    case 'degraded':
      return { text: 'DEGRADED', style: styles.failed };
    case 'disconnected':
      return { text: 'OFFLINE', style: styles.failedHard };
    case 'connecting':
    case 'handshaking':
    case 'resyncing':
      return { text: state.toUpperCase(), style: styles.backup };
    default:
      return { text: state.toUpperCase(), style: styles.backup };
  }
}

/** Bottom-of-window status bar (Phase 6 §2). Never hidden, never re-flows. */
export function StatusBar(): JSX.Element {
  const health = useConnections();
  const lock = useLock();

  if (health === null) {
    return (
      <footer style={styles.bar} aria-label="Status bar">
        <span style={styles.pill}>Loading…</span>
      </footer>
    );
  }

  const primary = sessionLabel(health.primary.state);
  const backup = sessionLabel(health.backup.state);

  return (
    <footer style={styles.bar} aria-label="Status bar">
      <span style={styles.pill}>
        <span style={styles.primary}>● PRIMARY {health.primary.label}</span>{' '}
        <span style={primary.style}>{primary.text}</span>
      </span>
      <span style={styles.pill}>
        <span style={styles.backup}>○ BACKUP {health.backup.label}</span>{' '}
        <span style={backup.style}>{backup.text}</span>
      </span>
      <span style={styles.pill}>{health.strategy}</span>
      <span style={styles.spacer} />
      {lock.engaged ? (
        <span style={styles.lock}>🔒 LOCKED</span>
      ) : (
        <button
          style={styles.lockButton}
          onClick={() => {
            const pin = window.prompt('Set a lock PIN (4–64 chars):');
            if (pin !== null && pin.length >= 4) {
              void window.cg.lock.engage({ pin });
            }
          }}
        >
          🔒 Lock…
        </button>
      )}
    </footer>
  );
}
