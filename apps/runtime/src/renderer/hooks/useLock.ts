import type { LockState } from '@cg/shared-ipc';
import type { AuthSessionState, Unsubscribe } from '../../shared/runtime-bridge.js';
import { useAuthSession } from './useAuthSession.js';
import { useBridgeSnapshot } from './useBridgeSnapshot.js';

const RELEASED: LockState = { engaged: false };

const fetchLock = (): Promise<LockState> => window.cg.lock.state();

const subscribeLock = (handler: (next: LockState) => void): Unsubscribe =>
  window.cg.lock.onStateChanged(handler);

/** The current lock state (B-080 — re-pulled whenever the link becomes usable). */
export function useLock(): LockState {
  return useBridgeSnapshot(fetchLock, subscribeLock, RELEASED);
}

/**
 * 🔴 `B-257` — **HOW MUCH OF THIS CONSOLE THE LOCK COVERS.**
 *
 *   - `none`    — the lock does not reach this console: nothing engaged, or a covered-set lock
 *                 covering none of the channels this principal holds. The console does NOT
 *                 present itself as locked; the bridge does not refuse it for the lock either.
 *   - `all`     — every channel this console holds is covered, or the lock covers every channel
 *                 (auth OFF, or an engager holding `'*'`). The lock screen, as it always was.
 *   - `partial` — some of this console's channels are covered and some are not. The covered
 *                 ones read as locked; the rest do not.
 *
 * ⚠ It mirrors the bridge's `lockReaches` from the SAME two inputs — the lock's captured
 * `channels` and this principal's `permittedChannels`, which the bridge composes with the one
 * `grantedChannels` it also captured the lock from — so a console that shows itself unlocked
 * is one the bridge does not refuse for the lock.
 *
 * A console that is not signed in holds nothing a covered-set lock covers: such a lock exists
 * only with auth ON, and a principal-less socket is not reached by it on the bridge.
 */
export type LockCoverage =
  | { readonly kind: 'none' }
  | { readonly kind: 'all' }
  | { readonly kind: 'partial'; readonly channels: readonly number[] };

export function lockCoverage(lock: LockState, auth: AuthSessionState): LockCoverage {
  if (!lock.engaged) return { kind: 'none' };
  if (lock.channels === undefined) return { kind: 'all' };
  if (auth.kind !== 'signed-in') return { kind: 'none' };
  const covered = new Set(lock.channels);
  const mine = auth.permittedChannels.filter((c) => covered.has(c));
  if (mine.length === 0) return { kind: 'none' };
  if (mine.length === auth.permittedChannels.length) return { kind: 'all' };
  return { kind: 'partial', channels: mine };
}

/** {@link lockCoverage} for this console, now. */
export function useLockCoverage(): LockCoverage {
  return lockCoverage(useLock(), useAuthSession());
}
