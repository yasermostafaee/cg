import { useEffect, useState } from 'react';
import type { StackItemState } from '@cg/shared-schema';
import { airTally } from '../stack/onAir.js';
import { CloseConsoleDialog } from './CloseConsoleDialog.js';
import { warnBeforeLeaving } from './leavePrompt.js';

/**
 * 🔴 `R-094` — **CG CONTROL DOES NOT CLOSE ON A SLIP.** Mounted ONCE, in `App`, for the life of the
 * console. Two doors, one per host:
 *
 *   - **inside CG Control** the shell holds every close of the window it can intercept and asks
 *     here; the answer is `Close CG Control?`. A close that arrives while the dialog is open asks
 *     nothing new: there is one dialog.
 *   - **in a browser** there is no shell, so the tab's own leave prompt asks — while signed in
 *     (`leavePrompt.ts`), decided on the session as it is when the tab is left.
 *
 * The fact line counts the console's on-air items with `airTally` — the ONE air count this console
 * shows (`B-213`), over `isOnAirStatus` (golden rule 6) — across the whole stack the console holds,
 * because closing the window leaves every channel's items on air, not only the channel on screen.
 *
 * ⚠ Neither door sends anything to CG Bridge or CasparCG. Closing is a window close, never a CLEAR.
 */
export function ConsoleCloseGuard({
  items,
}: {
  /** The stack the console already holds (`App`'s `useStack`). */
  items: readonly StackItemState[];
}): JSX.Element | null {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const door = window.cg.closeGuard;
    if (door.held()) return door.hold(() => setAsking(true));
    function onBeforeUnload(event: BeforeUnloadEvent): void {
      warnBeforeLeaving(event, window.cg.auth.state());
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  if (!asking) return null;
  return (
    <CloseConsoleDialog
      onAir={airTally(items).onAir}
      onCancel={() => setAsking(false)}
      onClose={() => {
        // The window goes with the dialog on it. A refusal leaves the window open and the
        // dialog answered: the next close asks again.
        void window.cg.closeGuard.closeNow().catch(() => setAsking(false));
      }}
    />
  );
}
