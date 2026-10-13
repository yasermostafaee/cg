/**
 * B-140 — THE DRAG SHIELD.
 *
 * A full-window overlay that exists only for the duration of a gesture, above
 * every panel and every `<iframe>`, carrying the drag's cursor.
 *
 * ── WHY A SHIELD AND NOT POINTER CAPTURE ───────────────────────────────────
 *
 * `setPointerCapture` retargets events to one element within ONE document. It does
 * not dependably cross a browsing-context boundary, and the surfaces this repo
 * drags over are iframes: the Runtime's PVW stacks one `<iframe srcdoc>` per
 * rehearsal subject, and the Designer's canvas preview is another. While the
 * pointer is over one, the parent document stops seeing moves — and, fatally,
 * never sees the `pointerup`. The shield puts an element of the PARENT document
 * physically above them, so the pointer never reaches a nested context at all and
 * every event stays where the listeners are.
 *
 * Registering listeners on each iframe's document is the alternative and it does
 * not survive contact: the frames are created and destroyed at runtime, so the set
 * is not enumerable in advance and a new one is simply forgotten.
 *
 * ── WHY IT REPLACES THE BODY WRITES RATHER THAN JOINING THEM ───────────────
 *
 * 🔴 The bug being fixed is that `document.body.style.cursor` and `user-select`
 * were set on pointerdown and cleared in exactly one place — so a missed `up` left
 * the whole application wearing a resize cursor with text selection dead. Adding
 * the shield while KEEPING those writes would add a fifth thing to clear and leave
 * the failure mode intact.
 *
 * The shield carries the cursor itself, and it suppresses selection by consuming
 * the pointer rather than by styling the document. It is removed by the ONE
 * teardown, and because it is a node rather than a mutation of shared state, the
 * worst case of a leak is a stray transparent div — not an application that has
 * silently lost text selection. **The outcome is one less piece of global state.**
 */

/** Above every panel, dialog and iframe, and above the app's own top layer. */
const SHIELD_Z_INDEX = 2147483646;

export interface Shield {
  /** Remove the shield. Safe to call more than once. */
  readonly release: () => void;
  /** The element, for tests that need to assert what the browser was shown. */
  readonly element: HTMLElement;
}

/**
 * Mount a shield carrying `cursor` for the life of a gesture.
 *
 * `cursor` is a plain CSS cursor keyword supplied by the caller — this package
 * holds no design tokens and no styling opinions, only the geometry of "cover
 * everything".
 */
export function mountShield(doc: Document, cursor: string): Shield {
  const el = doc.createElement('div');
  el.setAttribute('data-cg-drag-shield', '');
  // `aria-hidden` + no role: it is a pointer trap, not content. A screen-reader
  // user is driving the divider from the keyboard path, which never mounts one.
  el.setAttribute('aria-hidden', 'true');
  const s = el.style;
  s.position = 'fixed';
  s.inset = '0';
  s.zIndex = String(SHIELD_Z_INDEX);
  s.cursor = cursor;
  // Transparent, but PRESENT to the hit-test: that is the whole mechanism.
  s.background = 'transparent';
  // Belt and braces for the gesture's own duration. Scoped to this node, so it
  // disappears with it — unlike the `document.body` write it replaces.
  s.userSelect = 'none';
  s.touchAction = 'none';
  doc.body.appendChild(el);

  let released = false;
  return {
    element: el,
    release: () => {
      if (released) return;
      released = true;
      el.remove();
    },
  };
}
