/**
 * 🔴 `TIMING-WIRE-22 · DELTA A2` — WHEN THIS BROWSER LAST SENT A PASS COUNT, as a local clock
 * time.
 *
 * ── WHY THE CONSOLE STATES WHAT IT SENT RATHER THAN WHAT IS LEFT ─────────────
 *
 * The pass counter lives in `PlayoutController.cyclesLeft`, inside the page, inside CEF, and no
 * return path carries it. So a number under "Passes remaining" would be a reading with a shelf
 * life: one pass after "set 2" it still says 2 while ONE remains, and after the count runs out
 * it says 2 over a graphic that has gone. It decays with nobody touching anything, which is the
 * worst shape a false readout can take. A statement about the PAST cannot decay.
 *
 * ── WHY IT IS ITS OWN MODULE (`DELTA B4`) ───────────────────────────────────
 *
 * It lived inside `TimingSection` while that component both sent the command and displayed the
 * result. B4 moved the SEND to the commit bar (`applyDraft`), so the writer and the reader are
 * now two modules — and a second copy of the map is how the panel comes to state a time for a
 * send that never happened, or none for one that did.
 *
 * ⚠ Browser-local and deliberately NOT persisted or carried on the wire. The console is stating
 * something IT did, and the only honest source for "when" is the moment it happened here. A
 * count set from another console, or before this page loaded, has no time this browser can know
 * — the line then says what was sent and omits the when, rather than inventing one from a
 * republish, which would time the RECONCILE and not the operator's action.
 */
const sentAt = new Map<string, string>();

/** Stamp an ACCEPTED pass-count send for an item. Never called on a refusal. */
export function recordSentPasses(itemId: string): void {
  sentAt.set(itemId, new Date().toLocaleTimeString());
}

/** When this browser last sent an accepted pass count for the item, if it has. */
export function lastSentPasses(itemId: string): string | undefined {
  return sentAt.get(itemId);
}

/** Test-only: forget every stamp, so one spec's send cannot time another's. */
export function __resetSentPassesForTest(): void {
  sentAt.clear();
}
