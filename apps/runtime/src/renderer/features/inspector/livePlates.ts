import { assignedSourceId } from '@cg/shared-ipc';
import type { LiveSourceDeclaration } from '@cg/shared-schema';
import { currentSourceAssignments } from '../sources/sourceStore.js';

/**
 * D-137 / C-015 — the APPLIED source for each of a template's plates:
 * `plateId → sourceId`, or `null` where nothing is assigned.
 *
 * ONE function, because two callers need exactly this map and they must agree:
 * the `LIVE PLATES` section renders draft-or-applied from it, and the Inspector's
 * `isItemDirty` compares the staged plates against it to decide whether Update
 * and Discard are live. A second local spelling is how a control comes to show a
 * dirty marker the commit bar does not — which is the panel telling the operator
 * two different things about the same edit.
 *
 * The ON-AIR truth is the bridge's, read through the sources store; this only
 * narrows it to the plates THIS template declares, in declaration order.
 */
export function appliedPlateSources(
  templateId: string,
  plates: readonly LiveSourceDeclaration[],
): ReadonlyMap<string, string | null> {
  const assignments = currentSourceAssignments();
  return new Map(
    plates.map((plate) => [
      plate.sourceId,
      assignedSourceId(assignments, templateId, plate.sourceId),
    ]),
  );
}

/**
 * 🔴 **§12.5 / `tasks.md` 7.8 — WHAT IS ACTUALLY ON AIR FOR ONE PLATE, override folded in.**
 *
 * ── THE HALF-REPAIR THIS EXISTS TO PREVENT ──────────────────────────────────
 *
 * `sourceOverride` is `R-048`'s per-ROW emergency patch: the operator points one plate
 * of one row at a different source while it is on air, without touching the template
 * assignment every other row shares. It is published on `StackItemState` precisely so
 * a surface can say so — and until now exactly ONE place in the whole renderer read it
 * (`LiveSourceSwapDialog`). Everywhere else, including the Inspector's LIVE PLATES
 * section, confidently showed the ASSIGNMENT.
 *
 * §12.5 named that as the reason its decision could not ship alone: telling the
 * operator *"this takes effect at the next take"* while ALSO showing them the wrong
 * current source *"would be a half-repair"*. So the two land together.
 *
 * ⚠ **This is a DIFFERENT question from {@link appliedPlateSources}, and both are
 * needed.** That one answers *"what is this template CONFIGURED to use"* — the baseline
 * a staged draft is dirty against, and it must NOT fold the override in or a row with
 * an emergency patch would read as permanently dirty against its own template. This one
 * answers *"what is on air on THIS row"*. Two questions, two functions, and the doc on
 * each says which is which so a future caller does not reach for the wrong one.
 */
export function onAirPlateSource(
  item: { sourceOverride?: Readonly<Record<string, string>> | undefined },
  plateId: string,
  applied: string | null,
): { sourceId: string | null; overridden: boolean } {
  const override = item.sourceOverride?.[plateId];
  if (override === undefined || override === '') return { sourceId: applied, overridden: false };
  // An override EQUAL to the assignment is still an override on the wire, but it is not
  // a divergence the operator needs told about — saying "patched" for a plate showing
  // exactly what the template says would be noise on the surface that must not have any.
  return { sourceId: override, overridden: override !== applied };
}
