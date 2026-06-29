import { useLink } from '../../hooks/useLink.js';
import { colors } from '../../theme.js';
import type { BridgeLinkStatus } from '../../../shared/runtime-bridge.js';

const styles = {
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.15rem 0.6rem',
    borderRadius: '0.25rem',
    border: `1px solid ${colors.border}`,
    background: colors.panelMuted,
    fontWeight: 700,
    whiteSpace: 'nowrap' as const,
  },
} as const;

interface Visual {
  color: string;
  text: string;
  title: string;
}

function visual(status: BridgeLinkStatus): Visual {
  switch (status) {
    case 'live':
      return { color: '#10B981', text: 'LIVE', title: 'Connected to the CasparCG bridge' };
    case 'disconnected':
      return {
        color: colors.error,
        text: 'DISCONNECTED — reconnecting…',
        title: 'Lost the bridge connection; commands are rejected until it reconnects',
      };
    case 'offline-mock':
    default:
      return {
        color: colors.pending,
        text: 'OFFLINE (mock) — not connected to CasparCG',
        title: 'No bridge found at boot; running the in-memory mock',
      };
  }
}

/**
 * Tri-state link indicator (C-001). Always rendered, always legible — the
 * operator must never confuse a live link, an explicit offline mock, and a
 * dropped connection.
 */
export function LinkIndicator(): JSX.Element {
  const status = useLink();
  const v = visual(status);
  return (
    <span style={styles.pill} role="status" aria-label="Bridge link" title={v.title}>
      <span style={{ color: v.color }}>●</span>
      <span style={{ color: v.color }}>{v.text}</span>
    </span>
  );
}
