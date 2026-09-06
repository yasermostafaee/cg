import { useEffect, type RefObject } from 'react';

/**
 * `B-229` — **ONE FOCUS TRAP, FOR THE TWO SURFACES THAT COVER THE WHOLE SCREEN.**
 *
 * A trap keeps Tab inside a container so the operator cannot walk onto a control that is
 * behind a scrim — one he cannot see, cannot click, and is not being asked about. The
 * Runtime has two such surfaces and they had one trap between them: `Modal` wrapped Tab
 * at both ends, and `LockOverlay` handled no key at all, so a 94 %-opaque lock screen was
 * one Shift+Tab away from a TAKE.
 *
 * ── WHY THIS IS A MODULE AND NOT A SECOND COPY IN `LockOverlay` ─────────────
 *
 * `Modal.tsx` records, correctly, that the lock deliberately does NOT use the modal
 * primitive: _"a lock screen with a way out is not a lock."_ That reasoning is about the
 * three EXITS the primitive gives every dialog — the ✕, Escape, and the backdrop click.
 * It says nothing about the TRAP, which is the opposite kind of thing: an exit lets the
 * operator leave, and the trap stops focus leaving on its own. Reading one rule as the
 * other is what left the lock inheriting neither.
 *
 * So the CONTAINMENT lives here and both surfaces call it — the modal composes it with
 * its exits, the lock composes it alone. Two copies of a focus trap is how the two come
 * to disagree about what "focusable" means, which is this repo's most-repeated defect
 * (`B-100` / `P-012`, and golden rule 6 for the general case).
 */

/**
 * What the trap will move focus to. Deliberately NOT the full a11y focusable set: these
 * are the three kinds of control the Runtime's dialogs and lock screen actually contain,
 * and a wider selector would start returning elements that cannot take focus in practice
 * (a `<a>` with no `href`, a disabled fieldset's children) and wrap focus onto nothing.
 *
 * `:not([disabled])` matters more than it looks: a dialog whose primary action is disabled
 * until a rule is satisfied (`usePrompt`'s length gate) must not have the wrap land there.
 */
export const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Every focusable descendant, in DOM order — which is Tab order for this set. */
export function focusableWithin(container: HTMLElement | null): HTMLElement[] {
  return [...(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
}

/**
 * Handle one keydown for the trap: wrap Tab at both ends of `container`.
 *
 * PURE of React and of the document, so both callers share one implementation and it can
 * be reasoned about without a render. Returns nothing; its whole effect is on the event
 * and on focus.
 *
 * ⚠ It calls `preventDefault` ONLY at the two ends. In the middle of the list the
 * browser's own sequential navigation is already correct and already inside the
 * container, and taking it over would mean re-implementing focus order — including the
 * parts of it this module's selector does not model.
 */
export function trapTabKey(container: HTMLElement | null, e: KeyboardEvent): void {
  if (e.key !== 'Tab') return;

  const nodes = focusableWithin(container);
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (first === undefined || last === undefined) return;

  /*
    🔴 FOCUS THAT IS ALREADY OUTSIDE IS PULLED BACK, and this clause is the difference
    between the modal's old trap and a trap that holds a LOCK.

    The old wrap only fired when the active element was exactly the first or last node —
    which assumes focus is already inside. For a dialog the operator opened that holds:
    the primitive focuses it on open. For the LOCK it does not: the lock can engage while
    focus is on a TAKE behind it, and a browser Tab from there walks along the row, never
    touching either end, and never entering the overlay at all.
  */
  if (container !== null && !container.contains(document.activeElement)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
    return;
  }

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Keep Tab inside `ref` while `enabled`, and put focus in on the way there.
 *
 * `restoreFocus` returns focus to whatever had it when the trap armed. The modal wants
 * that (the operator came from a control and goes back to it); the lock takes it too,
 * which is the correct behaviour for the INVERSE half of `B-229` — releasing the lock
 * hands the keyboard straight back to the console with no reload.
 *
 * ⚠ The listener is CAPTURE-phase on `document`, matching what `Modal` already did: the
 * key belongs to the top-most trapping surface, not to whatever is behind the scrim.
 *
 * ⭐ `initialFocusSelector` lets a dialog nominate where focus LANDS without adding a
 * second focus call that would race this one — see `Modal`'s own note on why a caller's
 * `autoFocus` cannot win against an effect (`B-230`).
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement>,
  enabled: boolean,
  options: { restoreFocus?: boolean; initialFocusSelector?: string } = {},
): void {
  const { restoreFocus = true, initialFocusSelector } = options;

  useEffect(() => {
    if (!enabled) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const nominated =
      initialFocusSelector === undefined
        ? null
        : (ref.current?.querySelector<HTMLElement>(initialFocusSelector) ?? null);
    (nominated ?? focusableWithin(ref.current)[0])?.focus();

    const onKeyDown = (e: KeyboardEvent): void => {
      trapTabKey(ref.current, e);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (restoreFocus) previous?.focus();
    };
    /*
      🔴 `B-230` — THE DEPENDENCY LIST IS `[enabled]`, AND NOTHING ELSE MAY JOIN IT.

      `Modal`'s version of this effect depended on `onClose`, which every caller passes as
      an inline arrow — a NEW identity on every render. So the effect tore down and set up
      again on every keystroke, and its setup moves focus: typing one character into a
      dialog's field re-ran it and focus jumped to the ✕. Measured in a browser, not
      reasoned about; see `tests/e2e/modal-initial-focus.spec.ts`.

      `ref` is a stable ref object and the two options are read at arm time on purpose. If
      a future caller needs the nominated selector to CHANGE while the trap is armed, that
      is a new mechanism, not a new dependency here.

      ⚠ There is no `react-hooks/exhaustive-deps` disable comment above, and there must not
      be: this repo does not configure that rule, so a disable for it is itself a lint ERROR
      (`Definition for rule ... was not found`). The narrow list is deliberate and this note
      is what records it.
    */
  }, [enabled]);
}
