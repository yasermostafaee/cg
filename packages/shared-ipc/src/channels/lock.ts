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

/** Main → Renderer push: emitted whenever the lock state flips. */
export const LockStateChangedChannel = definePublishChannel('lock.state-changed', LockStateSchema);
