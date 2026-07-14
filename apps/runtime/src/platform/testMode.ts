/**
 * R-006 — test mode is an EXPLICIT operator choice, never an automatic fallback.
 *
 * The bug this exists to make impossible: the app used to select the in-memory mock
 * silently whenever the bridge was unreachable. The mock simulates a *successful* playout,
 * so the operator pressed PLAY, saw a solid-red ON AIR badge next to a green "PRIMARY A
 * HEALTHY", and believed a graphic was on air. Nothing was.
 *
 * So the mock is now reachable ONLY through this flag, and the flag is only ever set by a
 * deliberate act:
 *
 * - the operator explicitly entering test mode from the disconnected banner, or
 * - a test harness arming `CG_E2E` before the app's JS runs.
 *
 * It is stored in `sessionStorage`, not `localStorage`, on purpose: test mode must not
 * outlive the browser session and quietly greet a different operator at the start of a
 * show. Entering or leaving it RELOADS the app, so the backend is chosen once at boot and
 * is never swapped underneath a running session ("never mid-show").
 */

const TEST_MODE_KEY = 'cg.runtime.testMode';

/** A test harness (Playwright) arms this before app JS runs to drive the mock deterministically. */
function harnessArmed(): boolean {
  return (globalThis as { CG_E2E?: boolean }).CG_E2E === true;
}

function session(): Storage | null {
  try {
    return globalThis.sessionStorage;
  } catch {
    // A sandboxed/blocked storage must fail CLOSED — i.e. live, not simulated.
    return null;
  }
}

/** Whether this session was explicitly put into test mode. Never inferred from a failed probe. */
export function isTestMode(): boolean {
  if (harnessArmed()) return true;
  try {
    return session()?.getItem(TEST_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Enter/leave test mode and reload, so the backend is re-chosen cleanly at boot. There is
 * deliberately no in-place backend swap: replacing the bridge under a live session is
 * exactly the "silent switch mid-show" this item exists to forbid.
 */
export function setTestMode(on: boolean): void {
  try {
    if (on) session()?.setItem(TEST_MODE_KEY, '1');
    else session()?.removeItem(TEST_MODE_KEY);
  } catch {
    // Storage unavailable — fall through to the reload; without the flag we boot LIVE,
    // which is the safe direction (never silently simulated).
  }
  globalThis.location.reload();
}
