/**
 * R-021 stage 3 — a renderer-local "the library changed" signal, in the shape
 * of `commandFeedback`'s tiny pub/sub.
 *
 * The Library panel used to re-list only after ITS OWN import button ran, which
 * was sufficient while that button was the only way in. It no longer is: a
 * fixed row's one-action chain imports into the SAME shared library, and the
 * whole point of "it stays there for reuse" is that the operator can SEE it
 * there afterwards. Without this the template really was registered and the
 * panel simply never said so — indistinguishable, to the operator, from an
 * import that did not happen.
 *
 * It is emitted from `importVcgFile` — the ONE import step both paths run —
 * rather than from either caller, so a future third entry point is covered by
 * construction.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribe to library changes; returns an unsubscribe. */
export function onLibraryChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Announce that the browser-local template library changed. */
export function notifyLibraryChanged(): void {
  for (const listener of [...listeners]) listener();
}
