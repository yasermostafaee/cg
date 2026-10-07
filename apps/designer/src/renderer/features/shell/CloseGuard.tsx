import { useEffect, useState } from 'react';
import { designerStore } from '../../state/store.js';
import { answerCloseRequest, warnBeforeLeaving } from './unsavedWork.js';
import { UnsavedChangesDialog } from './UnsavedChangesDialog.js';

/**
 * 🔴 `D-162` — **NEVER LOSE UNSAVED WORK SILENTLY.** Mounted ONCE, beside `App`, for the life of
 * the page: whichever view is showing (landing, studio, the too-small notice), the project can be
 * left, so both doors are watched from here.
 *
 *   - The browser's leave prompt (`D-088`), registered once and decided at the moment it fires.
 *   - Inside CG Designer, the shell's close: held while this page is mounted, and answered — at
 *     once when there is nothing to lose, with the Unsaved changes dialog when there is. A close
 *     that arrives while the dialog is open asks nothing new: there is one dialog.
 *
 * Both decide with `hasUnsavedChanges` (`unsavedWork.ts`), one predicate for both doors.
 */
export function CloseGuard(): JSX.Element | null {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent): void {
      warnBeforeLeaving(event, designerStore.get());
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => {
    const door = window.cg.closeGuard;
    if (!door.held()) return undefined;
    return door.hold(() => {
      answerCloseRequest(designerStore.get(), {
        // Nothing to lose: the window closes, as it always did. A refusal leaves it open.
        close: () => void door.closeNow().catch(() => undefined),
        ask: () => setAsking(true),
      });
    });
  }, []);

  return asking ? <UnsavedChangesDialog onCancel={() => setAsking(false)} /> : null;
}
