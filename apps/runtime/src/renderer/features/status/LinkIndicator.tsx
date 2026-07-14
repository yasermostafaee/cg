import { useLink } from '../../hooks/useLink.js';
import { colors } from '../../theme.js';
import type { BridgeLinkStatus } from '../../../shared/runtime-bridge.js';

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
      // R-006 — test mode is now an EXPLICIT operator choice, never a fallback from a
      // failed probe, so the wording says what it is rather than how we ended up here.
      // The full-width TEST MODE banner carries the weight; this pill just agrees with it.
      return {
        color: colors.pending,
        text: 'TEST MODE (mock) — nothing reaches CasparCG',
        title: 'Explicit test mode: an in-memory simulation. Nothing is on air.',
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
    <span className="cg-pill" role="status" aria-label="Bridge link" title={v.title}>
      <span style={{ color: v.color }}>●</span>
      <span style={{ color: v.color }}>{v.text}</span>
    </span>
  );
}
