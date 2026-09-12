/**
 * Tiny renderer-local feedback channel for operator actions (C-001). When a
 * command is rejected — most importantly while the bridge link is down — the
 * operator must see a clear error, and the command must never be shown
 * optimistically as on-air. `runCommand` centralizes that: it reports a failed
 * `accepted: false` or a thrown rejection, and otherwise stays quiet.
 *
 * 🔴 `CONSOLE-LOOK-06` DELTA R — **THE TWO CHANNELS NO LONGER SHARE A SURFACE, and that
 * is the fix for the owner's "it hides itself before I can read it".**
 *
 *   - ERROR   (`reportCommandError`)   — a refusal. Goes to `refusalStore`, which is STATE:
 *     it persists until dismissed, coalesces repeats, and has no timer anywhere in it.
 *   - SUCCESS (`reportCommandSuccess`) — a completed action worth a brief confirmation.
 *     Stays an EVENT on `CommandToast`, which auto-hides, because that is what a
 *     confirmation should do.
 *
 * ⚠ The two were one transient toast, and the shared surface is what made a refusal
 * missable — a toast's auto-dismiss is correct for a confirmation and wrong for a refusal.
 * `reportCommandError`'s NAME and signature are unchanged, so the ~10 call sites did not
 * move; what changed is where it lands.
 */

import { getRefusal, onRefusal, raiseRefusal } from './refusalStore.js';

type Listener = (message: string) => void;

const successListeners = new Set<Listener>();

/**
 * Subscribe to REFUSALS as they are raised.
 *
 * ⚠ Kept as an adapter over `refusalStore` rather than deleted, and the reason is not
 * compatibility for its own sake: "a refusal was reported, and this is what it said" is
 * exactly the question a dozen dom specs ask, and it is still a real question after the
 * refusal became state. What it does NOT do is fire on a dismissal or replay the standing
 * refusal on subscribe — those are questions about the SURFACE, and a caller that wants them
 * should read the store, which is why the store is exported.
 */
export function onCommandError(listener: Listener): () => void {
  /*
    🔴 SEEDED FROM THE STORE, not from null — otherwise the first callback REPLAYS whatever
    refusal happens to be standing, and a caller that subscribes after one was raised is told
    about it as if it had just happened. `layersPanel.clearAll.dom.test.ts` caught exactly
    that: a refusal left standing by an earlier case in the file was re-announced to the next
    one, which asserts that a COMPLETE clear reports no error. The doc above already said this
    channel does not replay; this is the line that makes it true.
  */
  const standing = getRefusal();
  let last: { message: string; count: number } | null =
    standing === null ? null : { message: standing.message, count: standing.count };
  return onRefusal((refusal) => {
    if (refusal === null) {
      last = null;
      return;
    }
    // Raised, or raised AGAIN — a repeat is a report, and a spec counting presses needs it.
    if (last !== null && last.message === refusal.message && last.count === refusal.count) return;
    last = { message: refusal.message, count: refusal.count };
    listener(refusal.message);
  });
}

/** Subscribe to command-SUCCESS messages; returns an unsubscribe. */
export function onCommandSuccess(listener: Listener): () => void {
  successListeners.add(listener);
  return () => {
    successListeners.delete(listener);
  };
}

/**
 * Raise a refusal on the persistent surface.
 *
 * `detail` is the bridge's own id-bearing text where there is one: it is kept for DIAGNOSIS
 * behind the banner's second line and in the audit log, and it is never the sentence — see
 * `asyncResultMessage`, which is where the operator's sentence is chosen.
 */
export function reportCommandError(
  message: string,
  opts: { detail?: string | null; code?: string | null } = {},
): void {
  raiseRefusal(message, opts);
}

/** Emit a command-success message to all subscribers. */
export function reportCommandSuccess(message: string): void {
  for (const listener of [...successListeners]) listener(message);
}

/**
 * Run a playout command, surfacing any failure as a visible error. A rejected
 * promise (e.g. the link is `disconnected`) is reported, never swallowed and
 * never treated as success.
 */
export function runCommand(label: string, promise: Promise<{ accepted: boolean }>): void {
  promise.then(
    (res) => {
      if (!res.accepted) reportCommandError(`${label} was not accepted.`);
    },
    (err: unknown) => {
      reportCommandError(err instanceof Error ? err.message : `${label} failed.`);
    },
  );
}
