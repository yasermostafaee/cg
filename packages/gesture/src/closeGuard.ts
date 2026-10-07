/**
 * 🔴 `D-162` (CG Designer) / `R-094` (CG Control) — **THE WINDOW'S CLOSE, HELD BY THE SHELL FOR
 * THE PAGE TO ANSWER.** The JS half of the one protocol both desktop shells speak; the other half is
 * `apps/designer/src-tauri/src/close_window.rs`, which CG Control's shell includes with `#[path]`.
 * One DOM event and three commands, spelled ONCE on this side, so the two apps cannot come to speak
 * it two ways.
 *
 * A Tauri window does not run the page's `beforeunload` when it is closed — WebView2 is torn down
 * with the window, not navigated — so the shell holds the close itself and asks the page with
 * {@link CLOSE_REQUESTED_EVENT} on its window. The page answers through the commands:
 *
 *   - `close_guard { armed }` — this page holds every close it can be asked about, or lets go;
 *   - `close_request_seen` — the page has the ask (a page that never answers is let close);
 *   - `close_window_now` — the page's own question is answered: close, asking nothing more.
 *
 * A page that never holds is never asked: the shell closes it at once, which is how a page that
 * failed to load stays closable.
 *
 * In a browser there is no shell (`invoke` is `null`): {@link CloseGuardDoor.held} is `false`,
 * nothing is armed anywhere, and the tab's own `beforeunload` is the only door.
 *
 * Behaviour only, like everything in this package: the dialog that answers is each app's own.
 */

/** The ask, as the shell sends it: one DOM event on the page's window. */
export const CLOSE_REQUESTED_EVENT = 'cg:close-requested';

/** The shell's IPC (Tauri's `__TAURI_INTERNALS__.invoke`). */
export type ShellInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

/** The page's side of the door. */
export interface CloseGuardDoor {
  /** Is a shell holding this window's closes? `false` in a browser. */
  held(): boolean;
  /**
   * Hold every close the shell can intercept: each one calls `onRequest` instead of closing the
   * window. Returns the release. Holds are counted — the shell is armed by the first and let go by
   * the last release — and an ask goes to the most recent holder only, so two holders never answer
   * one close twice.
   */
  hold(onRequest: () => void): () => void;
  /** Close the window now, asking nothing more. With no shell there is no window to close. */
  closeNow(): Promise<void>;
}

/** The door over a shell's `invoke` (or `null`, a browser), listening on `target` (the window). */
export function closeGuardDoor(invoke: ShellInvoke | null, target: EventTarget): CloseGuardDoor {
  const holders: { readonly onRequest: () => void }[] = [];

  /*
    The shell is TOLD, never awaited: an arm that fails leaves the shell closing at once, which is
    the state it was already in — and nothing here may throw into a React effect or an event.
  */
  const tell = (command: string, args?: Record<string, unknown>): void => {
    if (invoke === null) return;
    void invoke(command, args).catch(() => undefined);
  };

  const onAsk = (): void => {
    tell('close_request_seen');
    holders.at(-1)?.onRequest();
  };

  return {
    held: () => invoke !== null,
    hold(onRequest) {
      const holder = { onRequest };
      holders.push(holder);
      if (holders.length === 1) {
        target.addEventListener(CLOSE_REQUESTED_EVENT, onAsk);
        tell('close_guard', { armed: true });
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holders.splice(holders.indexOf(holder), 1);
        if (holders.length === 0) {
          target.removeEventListener(CLOSE_REQUESTED_EVENT, onAsk);
          tell('close_guard', { armed: false });
        }
      };
    },
    closeNow: async () => {
      if (invoke === null) return;
      await invoke('close_window_now');
    },
  };
}
