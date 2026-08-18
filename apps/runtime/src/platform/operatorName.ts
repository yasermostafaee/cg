import { normalizeActor } from '@cg/shared-ipc';

/**
 * B-141 follow-up — THIS CONSOLE's operator name, held in the browser.
 *
 * Browser-local, and that is the whole design rather than a shortcut: the value has to
 * differ per console or it answers nothing the constant `'operator'` did not already
 * answer. `localStorage` is therefore correct here for precisely the reason R-034's
 * delimiter list records it as WRONG there — a delimiter must reach every browser in
 * the gallery; a console's own label must not.
 *
 * 🔴 WHAT IT IS WORTH. Self-declared and unverified. It answers "which console, as
 * labelled" and never "which person, proven": anyone can type anything, and a console
 * shared across a shift change keeps yesterday's name until somebody edits it. That
 * caveat is on the operator-facing surface too, not only in this comment — a limit only
 * the implementer can read is the `assumed` failure (B-143) repeated.
 *
 * Rejected alternatives, recorded so they are not re-proposed:
 *
 *  - **A PIN-backed sign-in** reusing the lock's PIN. The lock's PIN is a SAFETY
 *    mechanism, not an identity one, and one secret serving two purposes means neither
 *    rule can be changed without breaking the other. It also puts a login in front of a
 *    console that has to be usable instantly in an emergency. Additive later if proven
 *    identity is ever wanted — it would fill this same seam with a verified value.
 *  - **A per-connection client id.** It identifies a BROWSER. Nobody disputes which
 *    browser did something.
 */

/** Where the name lives. Namespaced like the app's other browser-local keys. */
const STORAGE_KEY = 'cg.runtime.operatorName';

const listeners = new Set<() => void>();

/**
 * Read through to storage on every call rather than caching.
 *
 * A cache would go stale against a second tab on the same console — two tabs share one
 * `localStorage`, and a stale copy would send a name the operator has already changed.
 * The read is a synchronous string lookup; there is nothing to save.
 */
function read(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    // Private-mode / blocked storage: no name is the honest answer, not a crash.
    return '';
  }
}

/** This console's configured name, or `''` when it has never been set. */
export function getOperatorName(): string {
  return read();
}

/**
 * The value to put on the wire, normalised the way the bridge will normalise it again.
 *
 * Never an empty string: an unconfigured console records `unattributed` (the shared
 * `UNATTRIBUTED_ACTOR`, applied by `normalizeActor`), which reads as the state it is
 * instead of blending in with the rows that name somebody.
 */
export function operatorActorForWire(): string {
  return normalizeActor(read());
}

/** Set the name; `''` (or blank) clears it back to unattributed. */
export function setOperatorName(name: string): void {
  const next = name.trim();
  try {
    if (next === '') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage refused: the in-session sends below still carry nothing, and the panel
    // re-reads the same empty value — no silent pretence that it was saved.
  }
  for (const l of [...listeners]) l();
}

/** `useSyncExternalStore` pair, so the panel re-renders when the name changes. */
export function subscribeOperatorName(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
