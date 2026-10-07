import type { AuthSessionState } from '../../../shared/runtime-bridge.js';

/**
 * 🔴 `R-094` — **THE BROWSER CONSOLE'S LEAVE PROMPT.** Closing the tab of a signed-in console asks
 * first — the browser's own prompt (`beforeunload`), whose text the browser decides — so a slip of
 * the hand does not drop an operator out of a working console. Signed out, or with no sign-in at
 * all, there is no session to lose and nothing asks.
 *
 * Inside CG Control this is not registered: the window's close is the shell's question there
 * (`closeGuard`), asked in the console's own dialog, and a native prompt on top of it would be a
 * second question in the browser's chrome.
 *
 * ⚠ A RELOAD THE CONSOLE STARTS ITSELF IS NOT A SLIP. `Retry connection` and `Set up again` start
 * the console again on purpose (`reloadOnPurpose`): the operator pressed for exactly that, and a
 * "Reload site?" prompt in answer would be a second question about an act already chosen.
 *
 * Like the window close, leaving sends nothing: what is on air stays on air.
 */

let leavingOnPurpose = false;

/** Does leaving this console ask first? A signed-in console, the one an operator is working. */
export function asksBeforeLeaving(session: AuthSessionState): boolean {
  return session.kind === 'signed-in';
}

/** The `beforeunload` answer, decided on the session as it is when the tab is left. */
export function warnBeforeLeaving(event: BeforeUnloadEvent, session: AuthSessionState): void {
  if (leavingOnPurpose || !asksBeforeLeaving(session)) return;
  event.preventDefault();
  // Older Chromium asks only when `returnValue` is set; the text itself is ignored.
  event.returnValue = '';
}

/** Start the console again on purpose: no leave prompt asks about it. */
export function reloadOnPurpose(reload: () => void = () => globalThis.location.reload()): void {
  leavingOnPurpose = true;
  reload();
}

/** Tests only — a page that reloaded on purpose is a NEW page; a test's module is not. */
export function __resetLeavePromptForTest(): void {
  leavingOnPurpose = false;
}
