/**
 * 🔴 `CONSOLE-LOOK-06` DELTA R — **A REFUSAL IS A STATE, NOT AN ANNOUNCEMENT.**
 *
 * The owner's two defects were one cause: refusals were being emitted onto `CommandToast`,
 * the transient surface built for CONFIRMATIONS. A toast auto-hides — that is its whole
 * design — so a refusal the operator had not finished reading took itself off the screen.
 * (`CONSOLE-LOOK-06` DELTA D3 made that worse before this fixed it: adopting the reference's
 * 3200 ms dwell shortened the window on a surface that should never have had one.)
 *
 * The boundary this file draws, and the one the docs record beside it:
 *
 *   - a TOAST announces a completed action and may auto-hide;
 *   - a REFUSAL persists until dismissed or until the condition no longer holds;
 *   - PENDING is a state on a row and is neither.
 *
 * ── WHY A STORE AND NOT A SECOND EVENT CHANNEL ──────────────────────────────
 *
 * `commandFeedback`'s two channels are EVENTS: fire, listeners react, nothing is kept. That
 * is right for a confirmation and wrong for a refusal, because "is a refusal currently
 * standing?" is a question the surface has to be able to ask on every render — after a
 * remount, after a tab change, after the operator scrolls back. An event that has already
 * fired cannot answer it.
 *
 * ── COALESCING (§4d) IS BY MESSAGE, NOT BY TIMER ────────────────────────────
 *
 * Five presses of the same refused verb are ONE standing refusal with a count, never five
 * banners. Keyed on the rendered sentence rather than on the code, because two codes that
 * produce the same sentence say the same thing to the operator, and the operator is who this
 * surface is for.
 */

/** A refusal that is currently standing. */
export interface Refusal {
  /** The operator's sentence. Never carries an id — see `asyncResultMessage`. */
  readonly message: string;
  /**
   * The bridge's own id-bearing text, kept for DIAGNOSIS and never rendered as the sentence.
   * It rides the details affordance; the audit log keeps its own copy (§5).
   */
  readonly detail: string | null;
  /** The refusal code, where the refusal carried one. Shown behind the details affordance. */
  readonly code: string | null;
  /** How many times this same refusal has been raised without being dismissed. */
  readonly count: number;
  /** When it was first raised, so the surface can say "still standing" honestly. */
  readonly firstSeen: number;
}

type Listener = (refusal: Refusal | null) => void;

const listeners = new Set<Listener>();
let current: Refusal | null = null;

function emit(): void {
  for (const listener of [...listeners]) listener(current);
}

/** Subscribe to the standing refusal. Fires immediately with the current value. */
export function onRefusal(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

/** The standing refusal, for a `useSyncExternalStore` snapshot. */
export function getRefusal(): Refusal | null {
  return current;
}

/**
 * Raise a refusal, or bump the one already standing.
 *
 * ⚠ It does NOT auto-dismiss and there is no timer anywhere in this file. That absence is the
 * feature; a future edit that adds one is re-opening the owner's defect (b).
 */
export function raiseRefusal(
  message: string,
  opts: { detail?: string | null; code?: string | null } = {},
): void {
  const detail = opts.detail ?? null;
  const code = opts.code ?? null;
  current =
    current !== null && current.message === message
      ? { ...current, count: current.count + 1, detail, code }
      : { message, detail, code, count: 1, firstSeen: Date.now() };
  emit();
}

/** The operator dismissed it, or the condition that caused it no longer holds. */
export function clearRefusal(): void {
  if (current === null) return;
  current = null;
  emit();
}
