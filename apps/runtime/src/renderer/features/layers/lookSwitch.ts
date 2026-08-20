import { errorCodeMessage } from '../../ui/errorCodeMessage.js';

/**
 * §14.5 / `tasks.md` 7.1 — **operator wording for a refused LOOK SWITCH.**
 *
 * ── WHY THIS DELEGATES INSTEAD OF DECLARING ITS OWN VOCABULARY ──────────────
 *
 * `sourcesReasonMessage` and `fixedLayersReasonMessage` each own a CLOSED reason
 * union and key a `satisfies Record<Reason, string>` off it, so a new validator code
 * cannot ship without a sentence. A look switch has no such union and must not invent
 * one: `setActiveLook`'s refusals COMPOSE — the item, the look, reachability, whatever
 * `reconcileLivePlates` refuses, and whatever AMCP says. Those already have an owner in
 * `errorCodeMessage`, which is the STACK's vocabulary and where `disconnected`,
 * `amcp-*` and `template-serve-down` are already worded. A second table would be that
 * vocabulary spelled twice, and the two would drift.
 *
 * ── MESSAGE FIRST, ALWAYS ───────────────────────────────────────────────────
 *
 * The bridge sends a sentence with almost every refusal here, and its sentences carry
 * the SPECIFICS this side cannot know — which look, which template is already on air,
 * how many boxes it has. `LiveSourceSwapDialog` set the precedent
 * (`res.message ?? '…'`) and `errorCodeMessage`'s own doc records the rule for the take
 * path: the code's sentence is the FALLBACK, not the answer.
 */
export function lookSwitchRefusal(reason: string | undefined, message: string | undefined): string {
  if (message !== undefined && message !== '') return message;
  return errorCodeMessage(reason) ?? 'The look switch was not accepted.';
}

/**
 * ⚠ **THE PICKER’S DISABLED REASON IS `casparRefusalReason`, NOT A HELPER OF ITS OWN.**
 *
 * There was one here for a moment and it reduced, on inspection, to exactly what
 * `reachWording`’s `casparRefusalReason(linkDown, casparReach)` already returns — a second
 * spelling of a rule that has an owner (golden rule 6). The call site uses that helper
 * directly; this note exists so the next reader does not re-add the wrapper.
 *
 * Two things it deliberately does NOT gate on:
 *
 * - **OFF AIR.** `setActiveLook` accepts an off-air row and sends nothing — there is
 *   nothing seated to reconcile — so the look is simply RECORDED and the next take enters
 *   it. Pre-setting the look a take will enter is a legitimate thing to want, so the picker
 *   stays live off air.
 * - **DIRTY.** A staged plate edit does not block a switch. The two are independent, and
 *   coupling them would make the picker refuse for a reason that has nothing to do with looks.
 *
 * And it is PRESENT-BUT-DISABLED, never absent: a missing picker means “this template has
 * no looks”, a permanent fact, while an unreachable server is transient and returns with the
 * link. A control that vanished on a blink would make the row look like a different kind of
 * row each time.
 */
