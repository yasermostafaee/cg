import { useEffect, useRef, useState } from 'react';
import type { Unsubscribe } from '../../shared/runtime-bridge.js';
import { useLink } from './useLink.js';

/**
 * Hold a bridge snapshot and keep it live: pull it whenever the link is usable, and
 * apply every subsequent push.
 *
 * B-080 — the one-shot `fetch().then(setState)` that each of these hooks used to do was
 * only ever correct because `createRuntimeBridge` guaranteed a SETTLED backend at mount:
 * the boot probe either connected (live) or handed the renderer the mock, and either way
 * the mount-time fetch resolved. R-006 (#312) removed the mock fallback — an
 * unreachable-at-boot bridge now mounts the LIVE backend in `disconnected`, where every
 * request is refused by design. So the mount-time fetch REJECTS, and nothing re-pulls it
 * when the socket later opens: the bridge publishes a channel only when its value CHANGES,
 * and `WebSocketRuntime` re-pulls a snapshot only on a RE-connect, never on the first open.
 * The snapshot then stays at its initial value for the life of the page. That is what left
 * the StatusBar sitting on "Loading…" beside a green ● LIVE until someone refreshed.
 *
 * The fix is to tie the pull to the LINK rather than to the mount: re-pull on every
 * transition into a usable link, and don't ask while it is down (a refused request is
 * expected there, not an error to surface — and never an unhandled rejection).
 *
 * Pushes win over pulls: a snapshot still in flight when a publish lands is DISCARDED, so
 * a slow round-trip can never overwrite fresher state with staler state.
 *
 * `fetchSnapshot` / `subscribe` must be stable across renders (module-level functions) —
 * they are effect dependencies.
 */
export function useBridgeSnapshot<T>(
  fetchSnapshot: () => Promise<T>,
  subscribe: (handler: (next: T) => void) => Unsubscribe,
  initial: T,
): T {
  const [value, setValue] = useState<T>(initial);
  const link = useLink();
  // Bumped by every push. A pull that resolves with a stale generation lost the race
  // against a publish and is dropped.
  const generation = useRef(0);

  useEffect(
    () =>
      subscribe((next) => {
        generation.current += 1;
        setValue(next);
      }),
    [subscribe],
  );

  useEffect(() => {
    // `disconnected` refuses every request by design (R-006) — don't ask. The transition
    // back to a usable link re-runs this effect and pulls then.
    if (link === 'disconnected') return;
    let cancelled = false;
    const pulledAt = generation.current;
    void fetchSnapshot().then(
      (next) => {
        if (!cancelled && generation.current === pulledAt) setValue(next);
      },
      () => {
        // The link dropped between the check above and the round-trip landing. Nothing to
        // report and nothing to retry here — reconnecting re-runs this effect.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fetchSnapshot, link]);

  return value;
}
