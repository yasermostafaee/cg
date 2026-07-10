import { useConnections } from '../../hooks/useConnections.js';
import { useLock } from '../../hooks/useLock.js';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { LinkIndicator } from './LinkIndicator.js';

interface Props {
  onOpenAudit?: () => void;
  /** R-010 — opens the server connection settings panel. */
  onOpenSettings?: () => void;
}

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
export function StatusBar({ onOpenAudit, onOpenSettings }: Props = {}): JSX.Element {
  const health = useConnections();
  const lock = useLock();

  if (health === null) {
    return (
      <footer style={styles.bar} aria-label="Status bar">
        <LinkIndicator />
        <span className="cg-pill">Loading…</span>
      </footer>
    );
  }

  const primary = sessionLabel(health.primary.state);
  // B-046 — `backup` is absent under a declared single-server config: render
  // the honest "no backup" state instead of a phantom card, and disable the
  // manual failover (the bridge refuses it anyway — nothing to switch to).
  const backup = health.backup !== undefined ? sessionLabel(health.backup.state) : null;

  return (
    <footer style={styles.bar} aria-label="Status bar">
      <LinkIndicator />
      <span className="cg-pill">
        <span style={styles.primary}>● PRIMARY {health.primary.label}</span>{' '}
        <span style={primary.style}>{primary.text}</span>
      </span>
      {health.backup !== undefined && backup !== null ? (
        <span className="cg-pill">
          <span style={styles.backup}>○ BACKUP {health.backup.label}</span>{' '}
          <span style={backup.style}>{backup.text}</span>
        </span>
      ) : (
        <span className="cg-pill">
          <span style={styles.backup}>○ NO BACKUP</span>
        </span>
      )}
      <span className="cg-pill">{health.strategy}</span>
      <span style={styles.spacer} />
      <AsyncButton
        variant="caution"
        aria-label="Manual failover"
        disabled={health.backup === undefined}
        title={
          health.backup === undefined
            ? 'No backup configured'
            : `Switch primary to ${health.currentPrimary === 'A' ? 'B' : 'A'}`
        }
        run={() =>
          window.cg.connections.failover({ reason: 'manual' }).then((r) => ({ accepted: r.ok }))
        }
      >
        ⇄ FAILOVER
      </AsyncButton>
      {onOpenSettings !== undefined && (
        <Button onClick={onOpenSettings} aria-label="Open server settings">
          SERVERS
        </Button>
      )}
      {onOpenAudit !== undefined && (
        <Button onClick={onOpenAudit} aria-label="Open audit log">
          AUDIT
        </Button>
      )}
      {lock.engaged ? (
        <span style={styles.lock}>🔒 LOCKED</span>
      ) : (
        <Button
          onClick={() => {
            const pin = window.prompt('Set a lock PIN (4–64 chars):');
            if (pin !== null && pin.length >= 4) {
              void window.cg.lock.engage({ pin });
            }
          }}
        >
          🔒 Lock…
        </Button>
      )}
    </footer>
  );
}
