import { hasUnsavedChanges, type DesignerStoreState } from '../../state/store.js';

/**
 * 🔴 `D-162` — **NEVER LOSE UNSAVED WORK SILENTLY: the two doors a project can leave by, and the
 * ONE predicate both ask** (golden rule 6). Kept React-free so a test can drive both against the
 * same store state and see them agree.
 *
 *   - **the browser's leave prompt** — a tab closed, reloaded or navigated away (`D-088`). The
 *     browser draws its own generic prompt; the page only says whether to ask.
 *   - **CG Designer's window close** — a Tauri window runs no `beforeunload` when it is closed, so
 *     the shell holds the close and asks the page (`closeGuardDoor`): with nothing to lose the
 *     window closes at once, as it always did; otherwise the Unsaved changes dialog asks.
 *
 * Both are given the document as it is at the moment of the decision, never a value captured
 * earlier.
 */

type OpenDocument = Pick<DesignerStoreState, 'scene' | 'dirty'>;

/** The browser's leave prompt: ask only when work would be lost. */
export function warnBeforeLeaving(event: BeforeUnloadEvent, doc: OpenDocument): void {
  if (!hasUnsavedChanges(doc)) return;
  event.preventDefault();
  // Older Chromium asks only when `returnValue` is set; the text itself is ignored.
  event.returnValue = '';
}

/** The shell asked about a close: close at once with nothing to lose, otherwise ask. */
export function answerCloseRequest(
  doc: OpenDocument,
  answer: { readonly close: () => void; readonly ask: () => void },
): void {
  if (hasUnsavedChanges(doc)) answer.ask();
  else answer.close();
}
