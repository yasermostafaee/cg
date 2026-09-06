import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * Lock-mode channels (Phase 6 §8). When engaged, the renderer puts up a
 * lock screen and blocks all input until released with the matching PIN.
 *
 * The PIN is stored hashed in Main (M5.4); the wire shape carries the
 * raw PIN only for the engage/release calls.
 */

const LockStateSchema = z.object({
  engaged: z.boolean(),
  /** Set when the lock was engaged programmatically (e.g., auto-lock idle). */
  reason: z.enum(['operator', 'auto-idle', 'system']).optional(),
  /**
   * ISO timestamp the current lock was engaged. The renderer shows
   * elapsed time on the LockOverlay. Absent when `engaged === false`.
   */
  engagedAt: z.string().datetime().optional(),
});

export type LockState = z.infer<typeof LockStateSchema>;

export const LockEngageChannel = defineChannel(
  'lock.engage',
  z.object({ pin: z.string().min(4).max(64) }),
  z.object({ ok: z.boolean() }),
);

export const LockReleaseChannel = defineChannel(
  'lock.release',
  z.object({ pin: z.string().min(4).max(64) }),
  z.object({ ok: z.boolean(), reason: z.enum(['pin-mismatch', 'not-engaged']).optional() }),
);

export const LockStateChannel = defineChannel('lock.state', z.void(), LockStateSchema);

/**
 * 🔴 `B-229` — **WHAT A LOCKED BRIDGE ANSWERS TO AN OPERATOR INTENT, and it is ONE string.**
 *
 * The bridge stored `#lock` and no intent handler consulted it, so the lock was a picture:
 * the overlay drew a scrim and the socket underneath it took orders from anyone who could
 * reach the port. The bridge now refuses every operator intent while engaged and answers
 * with exactly this — see `bridge.ts`'s `LockPolicy` for which channels that covers.
 *
 * ── WHY IT LIVES HERE, AND WHY IT IS ONE CONSTANT ───────────────────────────
 *
 * The `R-017` discipline: the sentence the BRIDGE sends and the sentence any SURFACE shows
 * are the same string, because two that match today drift the day one of them is edited.
 * It sits in `@cg/shared-ipc` because that is the only module both sides already import.
 *
 * ⚠ **It must not be worded like a SKEW message.** `bridgeErrorFrom` (`B-152`) rewrites the
 * three shapes `unknown channel: …` / `invalid request for …` / `invalid response for …`
 * into "restart the bridge" and passes everything else through verbatim — which is exactly
 * why no renderer change is needed for this to reach the operator, and exactly why a
 * refusal that started with one of those words would reach them as the wrong instruction.
 *
 * ⭐ It names the STATE, the REMEDY, and the fact that nothing was sent — the `R-006` rule
 * for a pre-send refusal, because an operator who believes a command is queued will not
 * reissue it. No channel name and no code: the operator is looking at a lock screen and
 * the answer is on it.
 */
export const LOCK_ENGAGED_REFUSAL =
  'The console is locked, so that command was refused — nothing was sent to CasparCG. ' +
  'Enter the PIN to unlock, then try again.';

/** Main → Renderer push: emitted whenever the lock state flips. */
export const LockStateChangedChannel = definePublishChannel('lock.state-changed', LockStateSchema);
