import { useLock } from '../../hooks/useLock.js';
import { LockCard } from './LockOverlay.js';

/**
 * 🔴 `MULTI-CHANNEL-01` §2 F — **`B-257`'S DEFERRED RENDERING, NOW DUE: A CHANNEL THE LOCK COVERS
 * PRESENTS AS LOCKED, WITH ITS VERBS ABSENT.**
 *
 * `B-257`'s report deferred this: _"covered tabs read `CHANNEL n · LOCKED`, verbs stay offered,
 * and the bridge refuses them — hiding them waits for R-062, since partial overlap can't occur
 * today."_ A station now declares a bank per channel, so a covered-set lock can cover one of this
 * console's channels and not another, and the deferral ends here.
 *
 * ── WHAT IT REPLACES, AND WHY REPLACING IS THE RIGHT VERB ────────────────────────────
 *
 * `ChannelScope` renders THIS in place of the channel's workspace — the layer table, both monitors
 * and the Inspector — so every verb in that view is ABSENT, not greyed and not hidden under a
 * scrim (golden rule 13). It is the console's lock screen, scoped to the one channel the lock
 * covers: the same card, the same PIN handling and the same release, because a second lock
 * surface with its own PIN logic is how two would come to disagree. The channels the lock does not
 * cover keep their live views, and the strip still says which is which (`· LOCKED`).
 *
 * The release is the lock's own — one lock, one PIN — so the button says `Unlock`, not `Unlock
 * channel 1`: the bridge releases the lock, and with it every channel the lock covers.
 */
export function ChannelLockPanel({ channel }: { channel: number }): JSX.Element {
  const lock = useLock();
  return (
    <div
      className="cg-channel-lock"
      data-channel-lock={String(channel)}
      role="region"
      aria-label={`Channel ${String(channel)} locked`}
    >
      <LockCard
        {...(lock.engagedAt !== undefined ? { engagedAt: lock.engagedAt } : {})}
        {...(lock.reason !== undefined ? { reason: lock.reason } : {})}
        onRelease={(pin) => window.cg.lock.release({ pin })}
        title={`Channel ${String(channel)} locked`}
        sub="Playout continues. Enter the PIN to use this channel."
        submitLabel="Unlock"
      />
    </div>
  );
}
