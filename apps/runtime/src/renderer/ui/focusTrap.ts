import { useEffect, useRef, type RefObject } from 'react';

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

/*
 * ── `STATION-CHROME-01` §6 — THE LAYER STACK, AND WHY A TRAP NEEDED ONE ─────
 *
 * Every Add and every Edit now opens a small SECOND dialog on top of the settings dialog,
 * so two trapping surfaces are on screen at once for the first time. Both listen on
 * `document` in the CAPTURE phase, so both see every key — and that is not a detail, it is
 * the defect:
 *
 *   · **TAB STOPPED MOVING.** A sub-dialog portals to `body`, so it is NOT a descendant of
 *     the dialog beneath it. The outer trap's `B-229` clause — "focus that is already
 *     outside is pulled back" — is therefore true of focus sitting in the sub-dialog, and
 *     it fires first (it armed first) and drags focus into the outer dialog; the inner trap
 *     then drags it back to ITS first control. Net effect on every press: focus returns to
 *     the sub-dialog's first control. The operator could not reach the second field.
 *     ⚠ A containment-only test PASSES on that, because focus does end up inside the
 *     sub-dialog. `nestedDialog.dom.test.ts` asserts ADVANCEMENT for exactly this reason.
 *   · **ESCAPE CLOSED BOTH.** `Modal` called `e.stopPropagation()` and its comment claimed
 *     Escape "belongs to the top-most dialog". It does not: `stopPropagation` stops
 *     propagation to other NODES, and both handlers sit on the SAME node, so the second one
 *     still ran. `stopImmediatePropagation` would stop a sibling — but only if registration
 *     order matched layer order, which is mount order, which in general it is not.
 *
 * ONE STACK ANSWERS BOTH, and it is here rather than in `Modal` because the LOCK screen
 * traps too and must be able to win: whichever surface armed LAST is the one the key
 * belongs to, and the lock always arms over whatever is already up.
 */
const layers: symbol[] = [];

function pushLayer(token: symbol): void {
  layers.push(token);
}

function popLayer(token: symbol): void {
  const i = layers.lastIndexOf(token);
  if (i >= 0) layers.splice(i, 1);
}

/** Is `token` the surface the keyboard currently belongs to? */
function isTopLayer(token: symbol): boolean {
  return layers.length > 0 && layers[layers.length - 1] === token;
}

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
): TrapLayer {
  const { restoreFocus = true, initialFocusSelector } = options;
  /*
    ONE token per mounted trap, stable for its life. `useRef` and not `useMemo`: a memo may
    be re-computed at React's discretion, and a token that changed identity would leave a
    ghost on the stack that nothing could ever pop.
  */
  const token = useRef<symbol | null>(null);
  token.current ??= Symbol('focus-trap');
  const self = token.current;

  useEffect(() => {
    if (!enabled) return;

    pushLayer(self);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const nominated =
      initialFocusSelector === undefined
        ? null
        : (ref.current?.querySelector<HTMLElement>(initialFocusSelector) ?? null);
    (nominated ?? focusableWithin(ref.current)[0])?.focus();

    const onKeyDown = (e: KeyboardEvent): void => {
      // The key belongs to the TOP-MOST trapping surface. A trap with something above it
      // does nothing at all — see the stack's note for what happens when both act.
      if (!isTopLayer(self)) return;
      trapTabKey(ref.current, e);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      popLayer(self);
      if (restoreFocus) previous?.focus();
    };
    /*
      🔴 `B-230` — THE DEPENDENCY LIST IS `[enabled]`, AND NOTHING ELSE MAY JOIN IT.

      `Modal`'s version of this effect depended on `onClose`, which every caller passes as
      an inline arrow — a NEW identity on every render. So the effect tore down and set up
      again on every keystroke, and its setup moves focus: typing one character into a
      dialog's field re-ran it and focus jumped to the ✕.

      MEASURED in a real browser against `fface751~1`, not reasoned about — jsdom cannot tell
      an open-time race from a per-commit steal, and the two want different fixes. Written up
      in `tests/e2e/modal-initial-focus.spec.ts`, including the symptom nobody predicted:
      focus leaving and returning resets a CONTROLLED input's caret to 0, so the characters
      land in REVERSE and an operator typing `1234` at the lock screen got `4321` — his
      correct PIN refused, with nothing on screen explaining why.

      `ref` is a stable ref object and the two options are read at arm time on purpose. If
      a future caller needs the nominated selector to CHANGE while the trap is armed, that
      is a new mechanism, not a new dependency here.

      ⚠ There is no `react-hooks/exhaustive-deps` disable comment above, and there must not
      be: this repo does not configure that rule, so a disable for it is itself a lint ERROR
      (`Definition for rule ... was not found`). The narrow list is deliberate and this note
      is what records it.
    */
  }, [enabled]);

  /*
    Returned as a FUNCTION rather than a boolean, deliberately: whether this surface is on
    top changes when a SIBLING mounts, which does not re-render this one. A boolean captured
    at render time would be stale in exactly the case it exists for — an Escape pressed
    after a sub-dialog opened.

    And the OBJECT is stable (a ref, not a fresh literal), because callers put it in an
    effect's dependency list. A new identity per render would re-register that effect on
    every keystroke — `B-230`'s defect, in a new place.
  */
  const api = useRef<TrapLayer | null>(null);
  api.current ??= { isTop: () => isTopLayer(self) };
  return api.current;
}

/** What a trapping surface gets back, so it can gate its OWN keys on the same stack. */
export interface TrapLayer {
  /** Is this surface the one the keyboard belongs to right now? */
  isTop: () => boolean;
}
