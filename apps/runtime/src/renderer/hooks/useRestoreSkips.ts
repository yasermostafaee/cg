import { useEffect, useState } from 'react';
import type { RestoreMigration, RestoreSkip } from '@cg/shared-ipc';

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
 * `single-clock-look-switch` — the rows the last restore brought back on a DIFFERENT row.
 *
 * The sibling of {@link useRestoreSkips}, kept apart for the reason `RestoreMigrationSchema`
 * gives: these rows came back, and reporting them in a list headed "did not come back" would
 * send the operator hunting for something that is on screen. Same subscription contract —
 * replayed on subscribe, empty clears the notice.
 */
export function useRestoreMigrations(): readonly RestoreMigration[] {
  const [migrations, setMigrations] = useState<readonly RestoreMigration[]>([]);
  useEffect(() => window.cg.stack.onRestoreMigrations(setMigrations), []);
  return migrations;
}

/**
 * What the operator is told about a lost row.
 *
 * Each says WHAT happened and WHAT TO DO — a reason code on its own ("no-layer") is
 * not an explanation, and these situations need different actions from the operator,
 * which is the whole reason `restore()` distinguishes them.
 *
 * ⭐ Takes the whole SKIP, not just its `reason`, so the "a detail wins over its code"
 * rule lives HERE rather than at each call site. A skip that carries the bridge's own
 * sentence is carrying the more specific of the two, exactly as `stack.take`'s `message`
 * outranks its `errorCode`; a second consumer that read `.reason` directly would print
 * the generic wording and quietly lose the specific one.
 */
export function restoreSkipReason(skip: RestoreSkip): string {
  if (skip.detail !== undefined) return skip.detail;
  switch (skip.reason) {
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
    /*
     * §14.5 — the template has a look group with no looks in it. Named separately from
     * `unknown-template` because the remedy is different and specific: the template IS
     * registered, it is just not authored to a state that can go to air.
     */
    case 'looks-none-authored':
      return 'its template has no looks authored, so every box would be empty — open it in the Designer and add one';
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
    /*
     * `multibox-layout-switch` §12.6 — exactly one multi-box template on air per channel.
     * In practice the bridge always sends a `detail` naming WHICH template holds the
     * channel, and that is returned above. This is the wording if it ever arrives without
     * one: still true, still actionable, and it keeps the switch exhaustive so a NEW
     * reason fails to compile until someone writes its sentence.
     */
    case 'multibox-already-on-air':
      return 'another multi-box template is already on air on its channel — take that one off air, then load this row again';
    /*
     * `single-clock-look-switch` — a graphics BED with nowhere to land. Worded away from
     * `no-layer`'s "free something up", which points at the dynamic ranges: the rows that
     * matter here are the bed rows, and the whole group is full.
     */
    case 'no-bed-row':
      return 'it is a graphics bed and every bed row is taken — remove a template from one of the bed rows, then load it again';
  }
}
