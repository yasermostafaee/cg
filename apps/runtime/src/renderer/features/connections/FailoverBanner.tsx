import { useEffect, useState } from 'react';
import type { ConnectionHealth, FailoverInfo } from '@cg/shared-ipc';

interface Props {
  health: ConnectionHealth | null;
}

const styles = {
  banner: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    padding: '0.4rem 1rem',
    background: '#7F1D1D',
    color: '#FEF2F2',
    fontSize: '0.82rem',
    fontWeight: 600,
    letterSpacing: '0.04em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    zIndex: 800,
    borderBottom: '1px solid #B91C1C',
  },
  chip: {
    padding: '0.1rem 0.5rem',
    borderRadius: '0.7rem',
    border: '1px solid rgba(254, 242, 242, 0.4)',
    fontSize: '0.7rem',
  },
  dismiss: {
    background: 'transparent',
    color: '#FEF2F2',
    border: '1px solid rgba(254, 242, 242, 0.4)',
    padding: '0.1rem 0.5rem',
    borderRadius: '0.25rem',
    cursor: 'pointer',
    fontSize: '0.72rem',
  },
} as const;

/**
 * Failover banner (Phase 8 §12 / M9.0). Renders across the top of the
 * Runtime window when:
 *
 *   - A failover has happened since boot (health.lastFailover present)
 *     AND the operator hasn't dismissed the current event yet, OR
 *   - The active primary session is in 'degraded' / 'disconnected' state.
 *
 * Dismissal is keyed by `lastFailover.at` — a *new* failover (different
 * timestamp) re-shows the banner even if the operator dismissed the
 * previous one. The banner is air-critical situational awareness; we
 * never silently auto-hide it while broken state persists.
 */
export function FailoverBanner({ health }: Props): JSX.Element | null {
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);

  useEffect(() => {
    // Clear dismissal when a *new* failover supersedes the dismissed one.
    if (health?.lastFailover !== undefined && health.lastFailover.at !== dismissedAt) {
      // Don't clear `dismissedAt` here — we want the banner to appear
      // for the new event. The condition below treats mismatch as
      // "not dismissed".
    }
  }, [health?.lastFailover?.at, dismissedAt]);

  if (health === null) return null;

  const recent = health.lastFailover;
  const primaryUnhealthy =
    health.primary.state === 'degraded' || health.primary.state === 'disconnected';
  const showRecent = recent !== undefined && recent.at !== dismissedAt;

  if (!showRecent && !primaryUnhealthy) return null;

  return (
    <div style={styles.banner} role="alert">
      <span>{message(recent, health)}</span>
      <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <span style={styles.chip}>primary: {health.primary.label}</span>
        <span style={styles.chip}>strategy: {health.strategy}</span>
        {recent !== undefined && (
          <button
            style={styles.dismiss}
            onClick={() => setDismissedAt(recent.at)}
            aria-label="Dismiss failover banner"
          >
            Dismiss
          </button>
        )}
      </span>
    </div>
  );
}

function message(recent: FailoverInfo | undefined, health: ConnectionHealth): string {
  if (recent !== undefined) {
    const verb = recent.reason === 'manual' ? 'Manual failover' : 'Auto-failover';
    return `${verb} — switched from ${recent.from} to ${recent.to} (${recent.reason}) at ${formatTime(recent.at)}`;
  }
  return `PRIMARY ${health.primary.label} unhealthy (${health.primary.state})`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
