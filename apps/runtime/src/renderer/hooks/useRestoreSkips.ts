import { useEffect, useState } from 'react';
import type { RestoreSkip } from '@cg/shared-ipc';

/**
 * B-108 — the rows the last restore could NOT bring back.
 *
 * On every (re)connect the browser re-delivers its retained stack intent and the
 * bridge re-seats what it can. Anything it CANNOT re-seat is skipped, and the row
 * simply disappears from the operator's stack — rows they were looking at a moment
 * ago, gone with nothing said. That silently desynchronises their model of the stack
 * from reality, which is the same broadcast-safety hazard as a lie about on-air
 * state, one step removed. The count and its meaning already existed; `#resync`
 * awaited the restore and DISCARDED the result. This is the missing consumer.
 *
 * NOT `useBridgeSnapshot`. That hook is for state the BRIDGE owns and re-pulls when
 * the link becomes usable; this is the outcome of a call THIS browser made, with no
 * endpoint to pull it from and nothing to re-pull it from after a reconnect (the
 * next reconnect produces its own report). So it is a plain subscription, and the
 * bridge implementation replays the latest value on subscribe — the panel mounts
 * after boot, and the report worth seeing is precisely the one from the reconnect
 * that happened while the UI was still coming up.
 *
 * The BENIGN skip (an item the live bridge already holds — a page reload against a
 * healthy bridge, which loses no row) is filtered out before it ever reaches here,
 * so this hook and its consumers cannot raise a false alarm by forgetting to.
 */
export function useRestoreSkips(): readonly RestoreSkip[] {
  const [skips, setSkips] = useState<readonly RestoreSkip[]>([]);
  useEffect(() => window.cg.stack.onRestoreSkips(setSkips), []);
  return skips;
}

/**
 * What the operator is told about a lost row, per reason.
 *
 * Each says WHAT happened and WHAT TO DO — a reason code on its own ("no-layer") is
 * not an explanation, and these two situations need different actions from the
 * operator, which is the whole reason `restore()` distinguishes them.
 */
export function restoreSkipReason(reason: RestoreSkip['reason']): string {
  switch (reason) {
    case 'unknown-template':
      return 'its template is no longer registered — re-import it';
    case 'no-layer':
      return 'no layer was free for it — remove something and load it again';
    /*
     * R-021 stage 4 — a DECLARED row, already taken. Deliberately worded away from
     * `no-layer`'s "free something up": there is nothing to free, and the fix is on
     * a specific row the operator can go and look at. A declared item is never
     * re-homed onto a dynamic layer, so this row genuinely did not come back.
     */
    case 'fixed-slot-taken':
      return 'its operator row was already taken by another item — load it onto a row again';
    /*
     * Unreachable by contract: `WebSocketRuntime.#resync` filters the benign skip out
     * before publishing, because a page reload against a live bridge loses no row and
     * an alarm for it would be a false one. Handled rather than thrown on, so a future
     * caller that forgets the filter degrades to a true-but-unhelpful sentence instead
     * of crashing the panel — and the switch stays exhaustive, so a NEW reason still
     * fails to compile until someone writes its wording.
     */
    case 'already-held':
      return 'the bridge already had it';
  }
}
