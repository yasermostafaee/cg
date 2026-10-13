import { useEffect, useState } from 'react';

/**
 * §4 (owner decision, 2026-08-20) — **is a stack delivery in flight?**
 *
 * The one question that tells an EMPTY stack apart from a NOT-YET-DELIVERED one, and the
 * reason the live-sources surface can raise a stranding alarm again rather than
 * suppressing it for every empty stack.
 *
 * ── WHY IT IS NOT `useBridgeSnapshot` ───────────────────────────────────────
 *
 * This is not a snapshot: there is no value to pull and nothing to re-pull on a link
 * change. It is a transport state with an initial read and a change feed, so it takes the
 * plain `useState` + subscribe shape rather than borrowing a hook built to reconcile a
 * pull against a push.
 *
 * ⚠ **The initial read matters and is easy to lose.** A resync can already be in flight
 * when this mounts — the socket opens and calls `#resync` before React renders anything —
 * so the value is seeded from `resyncing()` rather than from `false`. Starting at `false`
 * would leave the first frame reporting "settled", which is precisely the frame in which
 * the ledger has arrived and the stack has not.
 */
export function useStackDeliveryPending(): boolean {
  const [pending, setPending] = useState<boolean>(() => window.cg.link.resyncing());

  useEffect(() => {
    // Re-read on subscribe as well as seeding above: the flag can flip between the render
    // that seeded it and the effect that subscribes, and a missed edge here is a stranding
    // alarm raised or withheld wrongly.
    setPending(window.cg.link.resyncing());
    return window.cg.link.onResyncingChanged(setPending);
  }, []);

  return pending;
}
