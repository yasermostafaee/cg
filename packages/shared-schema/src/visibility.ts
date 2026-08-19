/**
 * 🔴 **THE ONE RESOLVED-VISIBILITY FUNCTION** — `multibox-layout-switch` `tasks.md` 4.1, and
 * D4's home (`design.md` §13.7.2).
 *
 * This module contains exactly one decision and nothing else, and the file is named for it
 * on purpose. There are now **THREE** per-element notions of "is this on screen", and the
 * whole point of D4's constraint is that they meet in ONE place:
 *
 * 1. the **authored** `visible` — what the scene says;
 * 2. the **arrangement's** opinion — what the active arrangement says about this element
 *    (a per-arrangement background belongs to its arrangement and to no other);
 * 3. the **hide-while-transitioning** flag — a box title should leave during the move, while
 *    a logo inside the multi-box must not blink on every switch.
 *
 * ⚠ **THE THIRD IS AN INPUT, NEVER A FOURTH BOOLEAN READ SOMEWHERE ELSE.** A local
 * `if (el.hideDuringTransition) return null` at the point of use is smaller, and in
 * isolation it looks obviously correct — that is exactly the breach this file exists to
 * prevent. Three booleans that all mean *is this on screen*, read in three places, is
 * precisely how a predicate's name stops matching what it tests (`CLAUDE.md` golden rule 6,
 * and the `B-100` / `P-012` history it is written from).
 *
 * **If you are about to read `hideDuringTransition`, `visible`, or an arrangement's
 * visibility map anywhere else: call {@link resolveVisibility} instead.**
 */

/**
 * D4's flag and the moment it applies to, as ONE input rather than two.
 *
 * They are paired deliberately: the flag alone cannot decide anything (it is a standing
 * preference), and "a transition is running" alone cannot either (it says nothing about
 * this element). Passing them apart would invite a caller to read one without the other,
 * which is the fourth-boolean shape one line up.
 */
export interface TransitionVisibility {
  /** The element's authored `hideDuringTransition` flag. */
  readonly hideDuringTransition: boolean;
  /** Whether an arrangement transition is running right now. */
  readonly active: boolean;
}

export interface VisibilityInputs {
  /** 1 — the scene's authored `visible`. */
  readonly authored: boolean;
  /**
   * 2 — the ACTIVE arrangement's opinion about this element, or `undefined` for "no
   * opinion", which is the common case and is NOT the same as `false`.
   */
  readonly arrangement: boolean | undefined;
  /** 3 — D4. See {@link TransitionVisibility}. */
  readonly transition: TransitionVisibility;
}

/**
 * Is this element on screen right now?
 *
 * ── THE PRECEDENCE, AND WHY IT IS NOT A BOOLEAN `AND` ───────────────────────
 *
 * A conjunction would be the obvious implementation and it would be wrong, because the
 * three inputs are not three votes on one question — they are statements at different
 * scopes, and a more specific statement is meant to WIN:
 *
 * 1. **The transition veto is absolute.** It is TEMPORAL — "not while this is moving" — and
 *    says nothing about whether the element belongs on screen, so nothing overrides it and
 *    it is checked first.
 * 2. **The arrangement's opinion beats the authored value when it HAS one.** This is what
 *    makes a per-arrangement background authorable at all: the author says "this backdrop
 *    belongs to the 2-box arrangement" once, instead of marking it visible and then
 *    remembering to hide it in every other arrangement — an O(n) chore whose first missed
 *    entry puts two backdrops on air together. `undefined` means the arrangement did not
 *    speak, and then it does not get a vote.
 * 3. **Otherwise the authored `visible` stands**, which is exactly today's behaviour and is
 *    what a scene with no arrangements and no transition resolves to — so this function is
 *    a no-op for every template that predates the feature.
 */
export function resolveVisibility(inputs: VisibilityInputs): boolean {
  if (inputs.transition.hideDuringTransition && inputs.transition.active) return false;
  if (inputs.arrangement !== undefined) return inputs.arrangement;
  return inputs.authored;
}

/**
 * The context a consumer resolves visibility IN — the active arrangement's visibility map
 * and whether a transition is running.
 *
 * Absent context (`undefined`) means "no arrangement, nothing transitioning", which
 * resolves every element to its authored `visible`. That default is what keeps every
 * existing caller, every pre-arrangement template and every test unchanged.
 */
export interface VisibilityContext {
  /** The ACTIVE arrangement's per-element opinions, `elementId → visible`. */
  readonly arrangementVisibility?: Readonly<Record<string, boolean>> | undefined;
  /** Whether an arrangement transition is currently running. */
  readonly transitioning?: boolean | undefined;
}

/** What {@link resolveVisibilityOf} needs to know about one element or layer. */
export interface VisibilitySubject {
  readonly id: string;
  readonly visible: boolean;
  readonly hideDuringTransition?: boolean | undefined;
}

/**
 * {@link resolveVisibility}, applied to one subject in one context.
 *
 * The convenience form every consumer actually wants — it assembles the three inputs from
 * a subject and a context so no call site has to, which is the other half of keeping the
 * decision in one place: a caller that has to build `VisibilityInputs` by hand is a caller
 * that can build them wrong.
 */
export function resolveVisibilityOf(
  subject: VisibilitySubject,
  context: VisibilityContext | undefined,
): boolean {
  return resolveVisibility({
    authored: subject.visible,
    arrangement: context?.arrangementVisibility?.[subject.id],
    transition: {
      hideDuringTransition: subject.hideDuringTransition ?? false,
      active: context?.transitioning ?? false,
    },
  });
}
