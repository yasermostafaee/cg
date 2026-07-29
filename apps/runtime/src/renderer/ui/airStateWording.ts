/**
 * Air-state wording that MORE THAN ONE surface has to say identically.
 *
 * `airStateVisual` in `theme.ts` owns the short labels (the words a test locates);
 * this owns the long explanations. They live here — a leaf module both the
 * `StatusBadge` primitive and the layer row's state cell can import — rather than
 * in either consumer, because a `ui/` primitive must not depend on a `features/`
 * module and the alternative was a second copy.
 *
 * That matters more than tidiness here: this is SAFETY text. It names which link
 * dropped so the operator fixes the right thing, and in the blind-tap case it
 * explicitly tells them the graphic is probably still on air and NOT to go
 * restarting a playout box that is working. A drifted second copy is how one
 * surface comes to give the opposite advice.
 */

/** WHY an `unverified` item cannot be confirmed, and what to do about it. */
export function unverifiedTitle(oscBlind: boolean, bridgeDown: boolean): string {
  if (oscBlind) {
    // B-093 — name the real fault and the real fix. Reconnecting changes nothing here.
    return (
      'This item was on air before the bridge restarted. No OSC is arriving from CasparCG, ' +
      'so its layer cannot be verified — nothing was sent to it, and the graphic is most ' +
      'likely still on air. Check the program output; CLEAR still works. Fix: enable OSC in ' +
      'casparcg.config (predefined-client / UDP port).'
    );
  }
  // B-086 / B-087 — the muted "WAS ON AIR" keeps the last-known reading in the
  // tooltip. The wording names the link that actually dropped: the SPA↔bridge
  // connection when the bridge is gone (CasparCG may be fine but is unreachable
  // through it), otherwise the CasparCG link.
  return bridgeDown
    ? 'Last confirmed ON AIR before the bridge connection dropped — reconnect the bridge to re-verify.'
    : 'Last confirmed ON AIR before the CasparCG link dropped — reconnect to re-verify.';
}
