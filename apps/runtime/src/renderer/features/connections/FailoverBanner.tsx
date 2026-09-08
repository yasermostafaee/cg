import { useState, type CSSProperties } from 'react';
import { Info, TriangleAlert } from 'lucide-react';
import type { ConnectionHealth, FailoverInfo } from '@cg/shared-ipc';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { colors, cssVars, NOTICE_PX } from '../../theme.js';
import { useLink } from '../../hooks/useLink.js';

interface Props {
  health: ConnectionHealth | null;
}

/**
 * Failover banner (Phase 8 §12 / M9.0) — deletion guard item 9 of `RUNTIME-REDESIGN-01`.
 *
 * Renders in the shell's banner region when:
 *
 *   - A failover has happened since boot (`health.lastFailover` present) AND the operator
 *     hasn't dismissed the current event yet, OR
 *   - The active primary session is in 'degraded' / 'disconnected' state.
 *
 * Dismissal is keyed by `lastFailover.at` — a NEW failover (different timestamp) re-shows the
 * banner even if the operator dismissed the previous one. Broken state is never silently
 * hidden: an unhealthy primary has no Dismiss at all.
 *
 * ── `B-172` — A STRIP WHOSE TONE IS THE SITUATION'S, NOT ONE RED SLAB ────────
 *
 * This used to be `position: fixed` across the top of the window, in three raw hexes, with
 * `role="alert"`, painted identically for a manual failover that WORKED, an automatic one
 * worth noticing, and a primary that is actually down. The owner, on the plant: _"the
 * failover banner is RED although the failover SUCCEEDED."_ Red is this product's alarm
 * colour and a completed manual failover is information.
 *
 * It is now an in-flow strip like every other banner in the region, and its tone comes from
 * the reference's three notice pairs by ROLE (`design.md` §16.3), never by hex:
 *
 *   | situation                               | tone    | role   | dismiss |
 *   | --------------------------------------- | ------- | ------ | ------- |
 *   | a MANUAL failover that succeeded        | notice  | status | yes     |
 *   | an AUTOMATIC failover — worth noticing  | caution | alert  | yes     |
 *   | the primary is degraded / disconnected  | alarm   | alert  | no      |
 *
 * ── `R-006` — SILENT IN TEST MODE, and the gate lives HERE now ───────────────
 *
 * The banner describes REAL servers. In test mode there are none; the mock honestly reports
 * them `disconnected`, so this would shout "PRIMARY A unhealthy" about hardware that does not
 * exist — new noise, and a fresh implication that a real server is out there, broken. The
 * TEST MODE banner is the truth in that mode and supersedes it. That gate used to be
 * `App.tsx`'s (`link !== 'offline-mock' && …`), where no component test could reach it and
 * where Phase 9's plant pass found the whole surface unguarded; it is inside the component
 * so `failoverBanner.dom.test.ts` can assert it with a positive control.
 */
type Tone = 'notice' | 'caution' | 'alarm';

const TONE_STYLE: Record<Tone, CSSProperties> = {
  notice: {
    background: cssVars['--r-notice-neutral-bg'],
    color: cssVars['--r-notice-neutral-text'],
    borderBottom: `1px solid ${cssVars['--r-notice-neutral-line']}`,
  },
  caution: {
    background: cssVars['--r-caution-bg'],
    color: cssVars['--r-caution-text'],
    borderBottom: `1px solid ${cssVars['--r-notice-line']}`,
  },
  alarm: {
    background: colors.error,
    color: cssVars['--r-ink-on-fill'],
    borderBottom: `1px solid ${cssVars['--r-danger-strong']}`,
  },
};

const styles = {
  /** The reference's `.notice` box as rendered, as a full-width band (`design.md` §16.3). */
  strip: {
    display: 'flex',
    alignItems: 'center',
    gap: cssVars['--r-notice-gap'],
    padding: cssVars['--r-notice-pad'],
    fontSize: cssVars['--r-notice-fs'],
    lineHeight: cssVars['--r-notice-lh'],
    flexShrink: 0,
  },
  text: { flex: 1, minWidth: 0 },
  meta: { display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 },
  chip: {
    padding: '0.1rem 0.5rem',
    borderRadius: cssVars['--r-radius-full'],
    border: '1px solid currentColor',
    fontSize: cssVars['--r-text-xs'],
    opacity: 0.85,
  },
  // Dismiss keeps the strip's own ink; the Button primitive adds the hover / active /
  // focus-visible states on top.
  dismiss: { color: 'inherit' },
} as const;

export function FailoverBanner({ health }: Props): JSX.Element | null {
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const link = useLink();

  if (link === 'offline-mock') return null;
  if (health === null) return null;

  const recent = health.lastFailover;
  const primaryUnhealthy =
    health.primary.state === 'degraded' || health.primary.state === 'disconnected';
  const showRecent = recent !== undefined && recent.at !== dismissedAt;

  if (!showRecent && !primaryUnhealthy) return null;

  const tone: Tone = primaryUnhealthy
    ? 'alarm'
    : recent?.reason === 'manual'
      ? 'notice'
      : 'caution';
  const role = tone === 'notice' ? 'status' : 'alert';

  return (
    <div
      style={{ ...styles.strip, ...TONE_STYLE[tone] }}
      role={role}
      data-failover-banner=""
      data-tone={tone}
    >
      <Icon icon={tone === 'notice' ? Info : TriangleAlert} size={NOTICE_PX.icon} />
      <span style={styles.text}>
        {message(showRecent ? recent : undefined, health, primaryUnhealthy)}
      </span>
      <span style={styles.meta}>
        <span style={styles.chip}>primary: {health.primary.label}</span>
        <span style={styles.chip}>strategy: {health.strategy}</span>
        {/* A completed event can be acknowledged; a broken primary cannot be hidden. */}
        {showRecent && !primaryUnhealthy && (
          <Button
            variant="ghost"
            style={styles.dismiss}
            onClick={() => setDismissedAt(recent.at)}
            aria-label="Dismiss failover banner"
          >
            Dismiss
          </Button>
        )}
      </span>
    </div>
  );
}

function message(
  recent: FailoverInfo | undefined,
  health: ConnectionHealth,
  primaryUnhealthy: boolean,
): string {
  const event =
    recent === undefined
      ? null
      : `${recent.reason === 'manual' ? 'Manual failover' : 'Auto-failover'} — switched from ${recent.from} to ${recent.to} (${recent.reason}) at ${formatTime(recent.at)}`;
  if (primaryUnhealthy) {
    const alarm = `PRIMARY ${health.primary.label} unhealthy (${health.primary.state})`;
    return event === null ? alarm : `${alarm} — ${event}`;
  }
  return event ?? '';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
