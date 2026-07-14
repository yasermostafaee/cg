import { useConnections } from '../../hooks/useConnections.js';
import { useLink } from '../../hooks/useLink.js';
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
    // Content-sized in the shell's flex column: never stretched, never squeezed away.
    flexShrink: 0,
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
  // B-081 — the look of health we CANNOT currently verify: muted, never a confident color.
  stale: { color: colors.textMuted },
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

/**
 * B-081 — what a server's health reads as while the BRIDGE is down.
 *
 * Server health only ever reaches the Runtime **through** the bridge (AMCP handshake +
 * OSC). Once the link is gone, the last snapshot is not "still true" — it is unverifiable,
 * and it ages with every second the bridge stays down. Rendering it as a confident green
 * HEALTHY next to R-006's "NOT CONNECTED — NOTHING CAN REACH AIR" is the same species of lie
 * that R-006 itself was filed to kill: the reassuring claim wins over the alarming one.
 * So while disconnected the pills say UNKNOWN, muted — and the last-known state survives
 * only in the tooltip, explicitly labelled as stale.
 */
const UNKNOWN: SessionLabel = { text: 'UNKNOWN', style: styles.stale };

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

/** The tooltip that keeps the last-known reading available without asserting it. */
function staleTitle(state: string): string {
  return (
    `Bridge disconnected — the server's health cannot be read. ` +
    `Last known before the link dropped: ${sessionLabel(state).text}.`
  );
}

/** Bottom-of-window status bar (Phase 6 §2). Never hidden, never re-flows. */
export function StatusBar({ onOpenAudit, onOpenSettings }: Props = {}): JSX.Element {
  const health = useConnections();
  const lock = useLock();
  const link = useLink();
  const simulated = link === 'offline-mock';
  // B-081 — the link that DELIVERS health is down, so every reading below is unverifiable.
  const stale = link === 'disconnected';

  if (health === null) {
    return (
      <footer style={styles.bar} aria-label="Status bar">
        <LinkIndicator />
        {/* Nothing has answered yet. While the link is down that is not "loading" — there
            is nobody to load from (B-080/B-081). */}
        <span className="cg-pill" style={stale ? styles.stale : undefined}>
          {stale ? 'SERVER HEALTH UNKNOWN' : 'Loading…'}
        </span>
      </footer>
    );
  }

  const primary = stale ? UNKNOWN : sessionLabel(health.primary.state);
  // B-046 — `backup` is absent under a declared single-server config: render
  // the honest "no backup" state instead of a phantom card, and disable the
  // manual failover (the bridge refuses it anyway — nothing to switch to).
  const backup =
    health.backup === undefined ? null : stale ? UNKNOWN : sessionLabel(health.backup.state);

  return (
    <footer style={styles.bar} aria-label="Status bar">
      <LinkIndicator />
      {simulated ? (
        // R-006 — in test mode there is no server to describe. The per-server pills used to
        // read "PRIMARY A HEALTHY" in green here, straight from the mock's seed, which is
        // the claim that convinced the operator a graphic was on air. Say the true thing.
        <span className="cg-pill" aria-label="Server status">
          <span style={styles.failedHard}>⚠ NO SERVER — SIMULATED</span>
        </span>
      ) : (
        <>
          {/* B-081 — while `stale`, the whole pill mutes: the green ● dot is a claim too. */}
          <span className="cg-pill" {...(stale ? { title: staleTitle(health.primary.state) } : {})}>
            <span style={stale ? styles.stale : styles.primary}>
              ● PRIMARY {health.primary.label}
            </span>{' '}
            <span style={primary.style}>{primary.text}</span>
          </span>
          {health.backup !== undefined && backup !== null ? (
            <span
              className="cg-pill"
              {...(stale ? { title: staleTitle(health.backup.state) } : {})}
            >
              <span style={styles.backup}>○ BACKUP {health.backup.label}</span>{' '}
              <span style={backup.style}>{backup.text}</span>
            </span>
          ) : (
            <span className="cg-pill">
              <span style={styles.backup}>○ NO BACKUP</span>
            </span>
          )}
          {/* The strategy is CONFIG, not health — it does not go stale with the link. */}
          <span className="cg-pill">{health.strategy}</span>
        </>
      )}
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
