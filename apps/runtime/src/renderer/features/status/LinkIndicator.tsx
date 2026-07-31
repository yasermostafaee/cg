import { useLink } from '../../hooks/useLink.js';
import { colors } from '../../theme.js';
import type { BridgeLinkStatus } from '../../../shared/runtime-bridge.js';
import type { CasparReach } from '../../ui/reachWording.js';

interface Visual {
  color: string;
  text: string;
  title: string;
}

/**
 * §7 — WHAT THIS PILL IS, AND WHAT IT WAS BEING READ AS.
 *
 * It reports the RENDERER↔BRIDGE link and nothing else. It said `● LIVE` in
 * green, and `LIVE` in a broadcast footer reads as *connected* — full stop. Asked
 * whether the link read LIVE, the owner answered "yes, but primary: offline": he
 * had read it as connected and then corrected himself from a SECOND indicator
 * sitting beside it. Two contradictory claims in one row, same size, and the
 * reassuring one wins — the B-081 / R-006 shape, one pill along.
 *
 * THE FIX IS NOT TO DELETE IT. The link state is worth keeping: it is the hop the
 * operator can do something about, and R-006's whole point is that a dead bridge
 * must be visible. What it may not do is claim, in the word and the colour that
 * mean "connected", to be connected to something it does not measure.
 *
 * SO IT SAYS WHICH HOP IT MEANS, AND STOPS BEING THE LOUD ONE WHEN THE OTHER HOP
 * IS DOWN. Three states, all of which occur in the field, and they are deliberately
 * NOT collapsed:
 *
 *   bridge down                → red. The nearer failure, and the actionable one.
 *   bridge up, CasparCG down   → MUTED. `BRIDGE ONLY — NO CASPARCG`. The link is
 *                                genuinely up; nothing reaches air through it.
 *   both up                    → green `BRIDGE LIVE`. The word now names what is
 *                                live, so it cannot be read as a claim about the
 *                                plant.
 *
 * …and `offline-mock` is a FOURTH thing, not a variant of any of them: test mode
 * is an explicit operator choice with a working simulated far end, and its
 * wording is unchanged (R-006).
 *
 * The BOOT WINDOW rides with `caspar-down` in colour but not in words: the pill
 * goes quiet, and says CHECKING rather than naming a server nothing has reported
 * down (§2's rule, applied to a label instead of a tooltip).
 */
function visual(status: BridgeLinkStatus, reach: CasparReach): Visual {
  switch (status) {
    case 'live':
      if (reach === 'reachable') {
        return {
          color: '#10B981',
          // BRIDGE LIVE, never a bare LIVE. The subject is the thing that is live.
          text: 'BRIDGE LIVE',
          title:
            'Connected to the CasparCG bridge, and the bridge reports it can reach CasparCG. Commands go through.',
        };
      }
      if (reach === 'connecting') {
        return {
          color: colors.textMuted,
          text: 'BRIDGE LIVE — CHECKING CASPARCG',
          title:
            'Connected to the CasparCG bridge. It has not yet said whether it can reach CasparCG.',
        };
      }
      return {
        // MUTED, not amber and not red: the server pill beside this one carries the
        // fault in its own colour, and a second alarm here would be the same
        // duplicated claim in the opposite direction. This pill's job is to stop
        // saying "connected", not to start shouting.
        color: colors.textMuted,
        text: 'BRIDGE ONLY — NO CASPARCG',
        title:
          'Connected to the CasparCG bridge, but the bridge cannot reach CasparCG — nothing reaches air. The server pill says which one is down.',
      };
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
      //
      // IT IS NOT TOUCHED BY THE THREE STATES ABOVE. Test mode is honest as it
      // stands — it already says nothing reaches CasparCG — and re-wording it to
      // mention a link would blur the one distinction R-006 exists to keep sharp.
      return {
        color: colors.pending,
        text: 'TEST MODE (mock) — nothing reaches CasparCG',
        title: 'Explicit test mode: an in-memory simulation. Nothing is on air.',
      };
  }
}

/**
 * Tri-state link indicator (C-001), now naming the hop it measures (§7). The
 * operator must never confuse a live link, an explicit offline mock, and a
 * dropped connection — nor read a live LINK as a live PLANT.
 */
export function LinkIndicator({
  /**
   * THE SECOND HOP, passed IN rather than hooked here.
   *
   * `StatusBar` already subscribes to health for its server pills. Taking
   * `useCasparReach` here would open a second subscription in the same component
   * — a duplicate pull on every reconnect, and two independent readings of one
   * fact inside one footer, which is precisely the disagreement this pill exists
   * to end.
   */
  reach,
}: {
  reach: CasparReach;
}): JSX.Element {
  const status = useLink();
  const v = visual(status, reach);
  return (
    <span className="cg-pill" role="status" aria-label="Bridge link" title={v.title}>
      <span style={{ color: v.color }}>●</span>
      <span style={{ color: v.color }}>{v.text}</span>
    </span>
  );
}
