import { followLetter, isKeyboardLanguage, type KeyboardLanguage } from '@cg/text-shaping';

/**
 * 🔴 `TEXT-DIGITS-01` — **THE ONE MODULE THAT SAYS WHICH KEYBOARD LANGUAGE IS TYPING.** The Digits
 * choice's **Keyboard** mode writes a typed digit in the digits of the keyboard language active as
 * it is typed; every editor in both apps asks {@link KeyboardLanguageDetector.current} at that
 * moment, and none reads the keyboard itself.
 *
 * Its sources, in the PINNED fallback order (`text-digits` design §0.3, measured on this machine):
 *
 *   1. **the desktop shell** (`native`) — Windows' layout of the thread that takes the webview's
 *      input, read by CG Designer's and CG Control's one read-only command. Measured in the
 *      installed app: a switch reaches that thread. It is asked on every key and polled lightly
 *      while a text box has focus, so its answer is already here when the digit key arrives; its
 *      answer wins, `unknown` included.
 *   2. **the letters typed** — the browser's only witness: a letter only one layout types proves
 *      that layout (`followLetter`). A switch shortcut (Alt+Shift, Ctrl+Shift) and leaving the
 *      window forget it, so a digit typed after a switch and before a proving letter is `unknown`
 *      rather than a stale answer.
 *   3. **`unknown`** — the digit stays exactly as the key sent it. Persian is never guessed.
 *
 * `navigator.keyboard.getLayoutMap()` is NOT a source: measured in Chrome and in WebView2, it
 * reports the ASCII-capable layout (`q` on `KeyQ`) while Persian is active.
 */
export interface KeyboardLanguageDetector {
  /** The language a digit typed NOW is written in. Synchronous: the latest answer in hand. */
  current(): KeyboardLanguage;
  /** Listen on `doc` (keys, focus); returns the teardown. */
  attach(doc: Document): () => void;
  /** Ask the shell now. Resolves once its answer, or its failure, is in. */
  refresh(): Promise<void>;
}

export interface KeyboardLanguageOptions {
  /** The desktop shell's report. Absent in a browser; a rejection or a stranger answer is `unknown`. */
  readonly native?: () => Promise<unknown>;
  /** How often the shell is asked while a text box has focus (ms). */
  readonly pollMs?: number;
}

const MODIFIERS = new Set(['Alt', 'Shift', 'Control']);

/** A text box: where a digit can be typed. */
function isEditable(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  return (
    target instanceof HTMLInputElement &&
    ['text', 'search', 'url', 'tel', 'email', 'password', 'number', ''].includes(target.type)
  );
}

export function createKeyboardLanguage(
  options: KeyboardLanguageOptions = {},
): KeyboardLanguageDetector {
  const { native } = options;
  const pollMs = options.pollMs ?? 250;
  /** The shell's last answer; `null` before one, and for good after a failure. */
  let shell: KeyboardLanguage | null = null;
  let shellFailed = native === undefined;
  /** What the letters typed since the last switch prove. */
  let letters: KeyboardLanguage | null = null;
  /** A modifier-only chord is held — a layout switch, unless another key joins it. */
  let chord = false;
  /** Only the newest ask may answer: a slow reply never overwrites a newer one. */
  let asked = 0;

  const refresh = async (): Promise<void> => {
    if (shellFailed || native === undefined) return;
    const ask = ++asked;
    try {
      const answer = await native();
      if (ask !== asked) return;
      shell = isKeyboardLanguage(answer) ? answer : 'unknown';
    } catch {
      if (ask !== asked) return;
      // A shell without the command (an older install) or a browser: the letters answer instead.
      shell = null;
      shellFailed = true;
    }
  };

  const forgetLetters = (): void => {
    letters = null;
  };

  return {
    current: () => shell ?? letters ?? 'unknown',
    refresh,
    attach(doc) {
      let poll: ReturnType<typeof setInterval> | null = null;
      const stopPolling = (): void => {
        if (poll !== null) clearInterval(poll);
        poll = null;
      };
      const onKeyDown = (event: KeyboardEvent): void => {
        if (MODIFIERS.has(event.key)) {
          // Alt+Shift or Ctrl+Shift, in either order: the two Windows switch shortcuts.
          const other =
            (event.key === 'Shift' && (event.altKey || event.ctrlKey)) ||
            ((event.key === 'Alt' || event.key === 'Control') && event.shiftKey);
          if (other) chord = true;
        } else {
          chord = false;
          // A letter pressed with Ctrl, Alt or Meta is a shortcut, not typing: it proves nothing.
          if (!event.ctrlKey && !event.altKey && !event.metaKey) {
            letters = followLetter(letters, event.key);
          }
        }
        void refresh();
      };
      const onKeyUp = (event: KeyboardEvent): void => {
        if (chord && MODIFIERS.has(event.key)) {
          chord = false;
          forgetLetters();
          void refresh();
        }
      };
      const onFocusIn = (event: FocusEvent): void => {
        if (!isEditable(event.target)) return;
        void refresh();
        if (poll === null && !shellFailed) {
          poll = setInterval(() => {
            if (shellFailed) stopPolling();
            else void refresh();
          }, pollMs);
        }
      };
      const onFocusOut = (event: FocusEvent): void => {
        if (!isEditable(event.relatedTarget)) stopPolling();
      };
      const view = doc.defaultView;
      const onBlur = (): void => {
        // The layout can change anywhere else; what the letters proved no longer holds.
        forgetLetters();
        stopPolling();
      };
      const onFocus = (): void => {
        void refresh();
      };
      doc.addEventListener('keydown', onKeyDown, true);
      doc.addEventListener('keyup', onKeyUp, true);
      doc.addEventListener('focusin', onFocusIn, true);
      doc.addEventListener('focusout', onFocusOut, true);
      view?.addEventListener('blur', onBlur);
      view?.addEventListener('focus', onFocus);
      return () => {
        stopPolling();
        doc.removeEventListener('keydown', onKeyDown, true);
        doc.removeEventListener('keyup', onKeyUp, true);
        doc.removeEventListener('focusin', onFocusIn, true);
        doc.removeEventListener('focusout', onFocusOut, true);
        view?.removeEventListener('blur', onBlur);
        view?.removeEventListener('focus', onFocus);
      };
    },
  };
}
