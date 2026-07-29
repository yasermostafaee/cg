import type { StackItemStatus } from '@cg/shared-schema';
import { airStateVisual, badgeTone } from '../theme.js';
import { unverifiedTitle } from './airStateWording.js';

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
  oscBlind = false,
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
  /**
   * B-093 — this `unverified` came from a BLIND OCCUPANCY TAP, not a dropped link: the item
   * was restored after a bridge restart, but no OSC has ever arrived, so the bridge refused
   * to decide what is on its layer and sent nothing.
   *
   * It needs its own wording because B-086/B-087's is actively wrong here, in two ways that
   * both push the operator toward the unsafe reading. TENSE: "WAS ON AIR" implies the graphic
   * is gone — in this failure the link is UP and the graphic is almost certainly still on air,
   * untouched. REMEDY: "reconnect to re-verify" fixes nothing, and sends someone to restart a
   * playout box that is working, which would take air down. So this reads as an open question
   * and names the real fix.
   */
  oscBlind?: boolean;
}): JSX.Element {
  const visual = airStateVisual(status, pending);
  const tone = badgeTone(status, pending);

  const claimsAir = tone === 'onair';
  // B-093 — the blind-tap `unverified` is an open QUESTION, not a past tense. The link is up
  // and the graphic is probably still burning on PGM; "WAS ON AIR" would say the opposite.
  const unverifiedLabel = status === 'unverified' && oscBlind ? 'ON AIR?' : visual.label;
  const label = simulated && claimsAir ? `SIM ${unverifiedLabel}` : unverifiedLabel;
  const shownTone = simulated && claimsAir ? 'attention' : tone;
  // B-086 / B-087 — the muted "WAS ON AIR" keeps the last-known reading in the tooltip, the way
  // B-081's health pill keeps "Last known before the link dropped: HEALTHY". The wording names the
  // link that dropped: the SPA↔bridge connection (B-087) when the bridge is gone — CasparCG may be
  // fine but is unreachable through the dead bridge — otherwise the CasparCG link (B-086).
  // The wording lives in `rowState.ts` — ONE copy, shared with the layer row's
  // state cell. This is safety text (it names which link dropped, and for the
  // blind-tap case tells the operator NOT to go restarting a working playout
  // box); two copies is how one of them ends up saying the wrong thing.
  const title = status === 'unverified' ? unverifiedTitle(oscBlind, bridgeDown) : undefined;

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
