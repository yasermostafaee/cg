import type { StackItemStatus } from '@cg/shared-schema';
import { airStateVisual, badgeTone } from '../theme.js';

/**
 * R-007 — the stack item status pill. Colors come from the `--r-*` badge-tone
 * classes (a coherent role language), while the icon + label stay verbatim from
 * `airStateVisual` (so the Playwright badge-word hooks — 'ON AIR', 'UPDATING',
 * 'UNCONFIRMED', … — remain stable). Never hue alone: icon + word always.
 */
export function StatusBadge({
  status,
  pending,
  simulated = false,
}: {
  status: StackItemStatus;
  pending: boolean;
  /**
   * R-006 — this item's status came from the in-memory simulation, not a real server.
   * The broadcast-red ON AIR treatment is RESERVED for a graphic a real CasparCG confirmed:
   * the mock used to render the identical badge, and an operator believed a graphic was on
   * air when none existed. A simulated air-claim reads "SIM ON AIR" in the attention tone —
   * same information, visibly not air.
   */
  simulated?: boolean;
}): JSX.Element {
  const visual = airStateVisual(status, pending);
  const tone = badgeTone(status, pending);

  const claimsAir = tone === 'onair';
  const label = simulated && claimsAir ? `SIM ${visual.label}` : visual.label;
  const shownTone = simulated && claimsAir ? 'attention' : tone;

  return (
    <span className={`cg-badge cg-badge--${shownTone}`} aria-label={`status ${label}`}>
      <span className="cg-badge__icon" aria-hidden="true">
        {visual.icon}
      </span>
      {label}
    </span>
  );
}
