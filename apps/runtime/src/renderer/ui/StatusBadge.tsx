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
  bridgeDown = false,
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
  /**
   * B-087 — the SPA↔bridge link (not the CasparCG link) is what dropped. An `unverified`
   * badge is reachable two ways now: a CasparCG link-loss on a live bridge (B-086,
   * `bridgeDown === false`) or a dead bridge (B-087, `bridgeDown === true`). It only
   * selects the tooltip wording so it names the link that actually dropped; the visible
   * label and icon are identical either way.
   */
  bridgeDown?: boolean;
}): JSX.Element {
  const visual = airStateVisual(status, pending);
  const tone = badgeTone(status, pending);

  const claimsAir = tone === 'onair';
  const label = simulated && claimsAir ? `SIM ${visual.label}` : visual.label;
  const shownTone = simulated && claimsAir ? 'attention' : tone;
  // B-086 / B-087 — the muted "WAS ON AIR" keeps the last-known reading in the tooltip, the way
  // B-081's health pill keeps "Last known before the link dropped: HEALTHY". The wording names the
  // link that dropped: the SPA↔bridge connection (B-087) when the bridge is gone — CasparCG may be
  // fine but is unreachable through the dead bridge — otherwise the CasparCG link (B-086).
  const title =
    status === 'unverified'
      ? bridgeDown
        ? 'Last confirmed ON AIR before the bridge connection dropped — reconnect the bridge to re-verify.'
        : 'Last confirmed ON AIR before the CasparCG link dropped — reconnect to re-verify.'
      : undefined;

  return (
    <span
      className={`cg-badge cg-badge--${shownTone}`}
      aria-label={`status ${label}`}
      title={title}
    >
      <span className="cg-badge__icon" aria-hidden="true">
        {visual.icon}
      </span>
      {label}
    </span>
  );
}
