import { templateAdmitsPassTiming, type TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { timingDelayMsOf, timingDraftOf, timingPassesOf } from './draftStore.js';

/** What a press or a preview carries — the wire's own `CgPassTiming` shape. */
export interface TimingToSend {
  passes?: number | 'infinite';
  delayMs?: number;
}

/**
 * 🔴 `PASSES-CYCLE-ONLY-26` §A1.2 (owner, 2026-09-16) — **THE ONE PLACE THAT DECIDES WHAT PASS
 * TIMING LEAVES THIS CONSOLE.**
 *
 * ── THE GATE ───────────────────────────────────────────────────────────────────────────────
 *
 * A template whose stated mode is not `loop-cycle` has no pass timing to send. The Inspector no
 * longer offers the controls for one, so nothing new can be staged — but a count STORED while
 * they were visible would otherwise still ride a press, and PVW would still play it. Both
 * readers below start here, which is what makes "no hidden state to air" a property of the
 * console rather than of two call sites that happen to agree.
 *
 * The predicate itself is `templateAdmitsPassTiming` in `@cg/shared-ipc`, shared with the
 * Inspector's render gate and with the bridge's wire gate. Three machines, one spelling.
 *
 * ── TWO READERS, AND WHY THEY ARE NOT ONE FUNCTION ─────────────────────────────────────────
 *
 * They answer different questions and collapsing them would break one of the two:
 *
 *  - {@link timingPatchToSend} is a **DIFF** — what an UPDATE press must send. Re-sending a
 *    value the row already has is not an edit, and on a RUNNING page `passes` means "remaining
 *    from now", so a restatement would re-arm the count mid-run.
 *  - {@link effectiveTimingFor} is the **FULL VALUE** — what PVW must play. A preview that
 *    showed only the diff would run the authored default for everything the operator had not
 *    just touched.
 */
function admits(playout: TemplateInfo['playout'] | undefined): boolean {
  return templateAdmitsPassTiming(playout);
}

/**
 * What an UPDATE press should send for this row, or `undefined` when there is nothing to send.
 *
 * ⚠ **A HALF-TYPED DRAFT CARRIES NO MEMBER RATHER THAN A GUESS.** `timingPassesOf` answers
 * `undefined` for anything that is not a whole count, so `"tw"` left in the box when UPDATE is
 * pressed carries no `passes` at all — it is not rewritten to a number and it does not fail the
 * press. What refuses bad text with a reason is the CONTROL, at the moment it is typed.
 *
 * ⚠ A draft that merely RESTATES what is applied yields `undefined`. The caller then drops the
 * draft, because it has become a restatement of the truth rather than an edit — leaving it
 * staged would keep a dirty chip up over a row with nothing outstanding.
 */
export function timingPatchToSend(
  playout: TemplateInfo['playout'] | undefined,
  item: StackItemState,
): TimingToSend | undefined {
  if (!admits(playout)) return undefined;
  const draft = timingDraftOf(item.itemId);
  if (draft === undefined) return undefined;
  const passes = timingPassesOf(draft);
  const delayMs = timingDelayMsOf(draft);
  const applied = item.timingOverride;
  const patch: TimingToSend = {
    ...(passes !== undefined && passes !== applied?.repeat && { passes }),
    ...(delayMs !== undefined && delayMs !== applied?.delayMs && { delayMs }),
  };
  return patch.passes === undefined && patch.delayMs === undefined ? undefined : patch;
}

/**
 * 🔴 `PASSES-CYCLE-ONLY-26` §B — **WHAT PVW SHOULD PLAY: the staged draft layered on the stored
 * override.**
 *
 * The fields' own rule, applied to timing. `buildApplyPayload` gives the frame "the applied
 * values with any staged edits layered on — exactly what Apply would send", and this is the same
 * shape: a count typed but not yet applied is what the preview must run, or the one surface that
 * exists to check a graphic before air is showing a different graphic from the one about to go.
 *
 * ⚠ **`undefined` MEANS ABSTAIN, and that is load-bearing.** A row with no override must reach
 * the frame with NO timing so the page runs its AUTHORED default — the same rule
 * `effectivePosition` carries, where filling the gap with a default moved every correctly-placed
 * graphic's preview to the middle. Returning `{}` here would be a payload member that says
 * nothing, which `readCgControl` already refuses to distinguish from silence.
 *
 * ⚠ A half-typed draft falls back to the STORED value rather than blanking it: mid-keystroke is
 * not an instruction to forget the count.
 */
export function effectiveTimingFor(
  playout: TemplateInfo['playout'] | undefined,
  item: StackItemState,
): TimingToSend | undefined {
  if (!admits(playout)) return undefined;
  const draft = timingDraftOf(item.itemId);
  const applied = item.timingOverride;
  const passes = timingPassesOf(draft) ?? applied?.repeat;
  const delayMs = timingDelayMsOf(draft) ?? applied?.delayMs;
  const effective: TimingToSend = {
    ...(passes !== undefined && { passes }),
    ...(delayMs !== undefined && { delayMs }),
  };
  return effective.passes === undefined && effective.delayMs === undefined ? undefined : effective;
}
