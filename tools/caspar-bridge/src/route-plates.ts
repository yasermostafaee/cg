/**
 * 🔴 `ROUTE-PLATES-01` — **CONTRACT v1.3, AS THE BRIDGE KEEPS IT FOR A PLAYOUT ROUTE**: a live plate
 * whose source is a D10 input the Playout holds on its holder channel, seated by `route://H-L`.
 *
 * The contract is `docs/integration/playout/PLAYOUT-CG-RESPONSE-HOLDER-v1.md` §3 as the Playout
 * completed it (`PLAYOUT-CG-RESPONSE-V13-STATE-v1.md` §3, C1–C5) and we accepted it
 * (`CG-CONTROL-REPLY-V13-STATE-2026-09-27.md`). The numbers below are theirs; the doors that read
 * them are in `caspar-runtime.ts`, each citing its rule.
 *
 * A hand-made `route` entry (no `origin`) is NOT a Playout route and keeps today's wire: every rule
 * here is asked of {@link isPlayoutRouteRecord} / `@cg/shared-ipc`'s `isPlayoutRoute`, never of the
 * producer kind alone.
 */

/**
 * Rule 4 — a `LOADBG`-ed route holds the frame from the moment it was loaded, and a cold route can
 * put one black frame on air: so `LOADBG`, then AT LEAST this long after its reply, then the bare
 * `PLAY` — at least one holder frame (40 ms at `1080i5000`) for the holder to queue a fresh one.
 */
export const ROUTE_LOADBG_MIN_MS = 40;

/**
 * Rule 4 — …and AT MOST this long from `LOADBG` to `PLAY`, or the preloaded frame is too old: the
 * `LOADBG` is dropped (a fresh one replaces it) and the pair starts again, once.
 */
export const ROUTE_LOADBG_MAX_MS = 200;

/**
 * Rule 4 (C2, as corrected) — the `PLAY` goes "one or two ticks before the reveal", so the stale
 * first frame and the first tick after it pass HIDDEN. Two ticks of a 25 fps channel; at least one
 * at any rate this product drives.
 */
export const ROUTE_REVEAL_AFTER_PLAY_MS = 80;

/** Rule 5 — the bounded D10 re-read after a reconnect, on an epoch change, and before a restore. */
export const ROUTE_EPOCH_READ_MS = 1_500;

/**
 * The code a route plate carries while its epoch cannot be confirmed: it stays empty, and its row
 * says so in one line — `Bed 59 · Plate 1: waiting for the Playout's input list.`
 */
export const ROUTE_WAITING_CODE = 'route-epoch-waiting';

/** The send seam's refusal of a route line whose epoch is not the current one (nothing is sent). */
export const ROUTE_EPOCH_STALE_CODE = 'route-epoch-stale';

/** Rule 4 — the `LOADBG` → `PLAY` window was missed twice: the seat is refused like a refused `PLAY`. */
export const ROUTE_WINDOW_MISSED_CODE = 'route-window-missed';

/**
 * The clock rule 4's two waits run on. Injectable, so a test can prove "≥ 40 ms and ≤ 200 ms" on
 * a fake clock the AMCP mock stamps its received lines with, and force the window to be missed.
 */
export interface RouteClock {
  /** Monotonic milliseconds. */
  now(): number;
  sleep(ms: number): Promise<void>;
}

/** The real clock: `performance.now()` and a plain timer. */
export const SYSTEM_ROUTE_CLOCK: RouteClock = {
  now: () => performance.now(),
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, Math.max(0, ms));
    }),
};

/** Sleep on `clock` until `now()` reaches `at` (never earlier: a timer can fire a hair early). */
export async function sleepUntil(clock: RouteClock, at: number): Promise<void> {
  for (let left = at - clock.now(); left > 0; left = at - clock.now()) {
    await clock.sleep(left);
  }
}

/**
 * Is this ledger record a PLAYOUT ROUTE? From what was recorded — the origin and the argument
 * actually sent (`"route://H-L"`) — so a record answers without a catalogue in hand.
 */
export function isPlayoutRouteRecord(record: {
  readonly origin?: 'input' | 'media' | undefined;
  readonly producer: string;
}): boolean {
  return record.origin === 'input' && /^"?route:\/\//i.test(record.producer);
}
