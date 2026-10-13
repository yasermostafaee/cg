import { useCallback, useEffect, useState } from 'react';
import type { LivePlateReleaseState } from '@cg/shared-ipc';

/**
 * 🔴 **`B-247` — THE RELEASES THIS BROWSER HAS HEARD, keyed by the frame they name.**
 *
 * ── WHY THIS IS AN ACCUMULATOR AND NOT A `useBridgeSnapshot` ────────────────
 *
 * Every other bridge fact on this tab is STATE: the ledger, the stack, the bank. This one is
 * an EVENT — the bridge emits one release per plate the look reconcile lets go, at the moment
 * it lets it go, and there is no "current set of releases" to pull. So there is nothing for
 * `useBridgeSnapshot` to fetch and no `ready` flag to honour; what the surface needs is the
 * last thing said about each frame, which is what this keeps.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 *
 * ⚠ **It never expires an entry, and that is safe for ONE structural reason.**
 * `declaredFrameRows` reads this map only for a plate that has NO ledger record — it
 * `continue`s past every seated plate before it asks. So the instant a look seats a frame
 * again, its release becomes unreachable rather than stale: the map may hold it, but nothing
 * can render it. A timer or a cleanup pass would be a second, weaker spelling of a retraction
 * the render path already performs exactly.
 *
 * ⚠ **It is per-BROWSER and does not survive a reload**, because the event does not. A console
 * that was not connected when the reconcile ran shows `Not seated` for that frame, which is
 * the honest under-claim: the frame genuinely has no seat, and only the HISTORY is missing.
 * That bound is stated on the channel too — do not "fix" it by making the bridge retain
 * releases without deciding, out loud, that this is standing state; `emptiedAir` is what that
 * decision looks like when the answer is yes.
 *
 * ⚠ **`held` releases are kept too, and filtered at the point of use.** Storing only
 * `torn-down` here would make this map's name a lie about what it holds (golden rule 6), and
 * the held ones are the cheap half of the same signal should a surface ever want them.
 */

/**
 * `itemId` + `plateId` as ONE unambiguous key.
 *
 * ⚠ **`JSON.stringify` of the PAIR, deliberately, rather than the two joined on a separator.**
 * Bare concatenation makes `('a', 'bc')` and `('ab', 'c')` the same frame, and a plate id is
 * authored text, so a separator is not optional. The usual answer — a NUL — is the one this
 * repo forbids in source (CLAUDE.md golden rule 9: a file carrying a literal NUL reads as
 * BINARY to `grep -r` and ripgrep, which skip it in SILENCE, so a wording sweep over this file
 * would come back quietly short). Encoding the pair sidesteps the question entirely: it is
 * total, printable, and reserves no character.
 */
function frameKey(itemId: string, plateId: string): string {
  return JSON.stringify([itemId, plateId]);
}

export type PlateReleaseLookup = (itemId: string, plateId: string) => LivePlateReleaseState | null;

/**
 * The lookup `declaredFrameRows` takes, backed by this browser's heard releases.
 *
 * The returned function's identity changes only when a release actually ARRIVES, so a consumer
 * that memoises on it re-computes then and not on every render.
 */
export function usePlateReleases(): PlateReleaseLookup {
  const [releases, setReleases] = useState<ReadonlyMap<string, LivePlateReleaseState>>(
    () => new Map(),
  );

  useEffect(() => {
    return window.cg.liveLayers.onPlateReleased((event) => {
      setReleases((previous) => {
        const next = new Map(previous);
        // LAST ONE WINS: a frame can be released more than once across a run of look
        // switches, and the most recent is the one that describes the state it is in now.
        next.set(frameKey(event.itemId, event.plateId), event);
        return next;
      });
    });
  }, []);

  return useCallback(
    (itemId: string, plateId: string) => releases.get(frameKey(itemId, plateId)) ?? null,
    [releases],
  );
}
