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
/**
 * A snapshot together with whether it has actually ARRIVED yet.
 *
 * `ready: false` is the bootstrap window — the hook is handing back the caller's
 * `initial` value because nothing has landed, NOT because the bridge said the
 * value is empty. Those two are different facts and the type keeps them apart.
 *
 * This is the project's own "unknown ≠ empty" doctrine (B-094), applied to DATA
 * rather than to occupancy. It is here rather than at one call site because the
 * mistake has now been made three times in this renderer — the b2 density bug,
 * PVW's white page, and `pruneDrafts` DELETING every staged edit on remount — and
 * only the third one destroyed the operator's work. Any consumer that ACTS on the
 * absence of an item (deletes, unbinds, clears, marks stale) must read this form
 * and do nothing while `ready` is false; a consumer that merely RENDERS can keep
 * using the plain value, because rendering an empty list for one frame is not a
 * loss.
 */
export interface BridgeSnapshot<T> {
  readonly value: T;
  readonly ready: boolean;
}

export function useBridgeSnapshot<T>(
  fetchSnapshot: () => Promise<T>,
  subscribe: (handler: (next: T) => void) => Unsubscribe,
  initial: T,
  /**
   * B-092 — opt in to pulling while the link is DOWN, for the one snapshot the
   * browser can answer locally: the stack, which is now backed by persistent
   * browser-local intent (like B-085's library). Everything else must keep the
   * default — health, lock and config live only on the bridge, so asking for
   * them while disconnected is the refused round-trip this hook exists to avoid.
   */
  pullWhileDisconnected = false,
): T {
  return useBridgeSnapshotState(fetchSnapshot, subscribe, initial, pullWhileDisconnected).value;
}

/**
 * The same subscription, returning {@link BridgeSnapshot} — the value AND whether
 * it has arrived. Use this wherever absence drives an action; see the type's note.
 */
export function useBridgeSnapshotState<T>(
  fetchSnapshot: () => Promise<T>,
  subscribe: (handler: (next: T) => void) => Unsubscribe,
  initial: T,
  pullWhileDisconnected = false,
): BridgeSnapshot<T> {
  const [value, setValue] = useState<T>(initial);
  // Latches on the FIRST arrival — a push or a resolved pull — and never clears.
  // Deliberately not tied to link state: once the bridge has told us what is on the
  // stack, a later disconnect does not make that knowledge un-arrive, and clearing
  // it would re-open the bootstrap window on every blip.
  const [ready, setReady] = useState(false);
  const link = useLink();
  // Bumped by every push. A pull that resolves with a stale generation lost the race
  // against a publish and is dropped.
  const generation = useRef(0);

  useEffect(
    () =>
      subscribe((next) => {
        generation.current += 1;
        setValue(next);
        setReady(true);
      }),
    [subscribe],
  );

  useEffect(() => {
    // `disconnected` refuses every request by design (R-006) — don't ask. The transition
    // back to a usable link re-runs this effect and pulls then. B-092 — unless the caller
    // opted in because this snapshot has a browser-local answer that needs no bridge.
    if (link === 'disconnected' && !pullWhileDisconnected) return;
    let cancelled = false;
    const pulledAt = generation.current;
    void fetchSnapshot().then(
      (next) => {
        if (!cancelled && generation.current === pulledAt) {
          setValue(next);
          setReady(true);
        }
      },
      () => {
        // The link dropped between the check above and the round-trip landing. Nothing to
        // report and nothing to retry here — reconnecting re-runs this effect.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fetchSnapshot, link, pullWhileDisconnected]);

  return { value, ready };
}
