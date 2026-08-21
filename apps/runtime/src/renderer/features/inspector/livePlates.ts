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
 *
 * 🔴 **SESSION BP — `patched` AND `overridden` ARE NOT THE SAME FLAG, and conflating them
 * put a false sentence on the panel.**
 *
 *   - `patched` — a patch EXISTS for this plate. It is in force and outranks every level
 *     below it, whatever it happens to equal.
 *   - `overridden` — the patch DIVERGES from the assignment, i.e. it is worth telling the
 *     operator about. A patch equal to the assignment is real on the wire and silent here.
 *
 * `overridden` alone was enough while it was the only thing suppressing other lines. It
 * stopped being enough the moment a FROZEN value could differ from the picker: a patch equal
 * to the live default reads `overridden: false`, so a caller gating on it would go on to
 * announce the frozen source as what this row is on — while the patch has it somewhere else
 * entirely. Anything asking "may I speak for this plate?" must ask `patched`.
 */
/**
 * 🔴 **SESSION BP — WHAT LEVEL 2 RESOLVES TO FOR THIS ROW, given that a row on air has
 * FROZEN it.**
 *
 * ── THE SURFACE THIS EXISTS TO NOT SHIP ─────────────────────────────────────
 *
 * The freeze makes {@link appliedPlateSources} — the LIVE template assignment — stop being
 * what an on-air row is resolving. Without this join the LIVE PLATES picker would go on
 * showing the edited default for a row that is ignoring it, which is a surface that is
 * confidently wrong: the operator changes the default, sees the panel agree, and nothing on
 * air moves. Worse than the freeze not existing, because they would have no reason to look.
 *
 * ⚠ **THREE questions, three functions, and the doc on each says which.**
 * {@link appliedPlateSources} answers _"what is this template CONFIGURED to use"_ — the
 * baseline a staged draft is dirty against, which must stay the LIVE value or an on-air row
 * would read as permanently dirty against its own template. THIS one answers _"what does
 * level 2 resolve to on this row"_. {@link onAirPlateSource} answers _"what is composited"_,
 * folding in `R-048`'s patch, which outranks both.
 *
 * ⚠ It deliberately does NOT claim air. Levels 3 and 4 are not frozen and can still change
 * what a plate shows, so a sentence built on this must speak about the ASSIGNMENT — "this
 * row is on the assignment its take froze" — never about the output. `onAirPlateSource` is
 * the one allowed to say "on air", and only for a row that is.
 *
 * `frozen: false` means the row is not pinned at all (off air, or a build predating the
 * field) and `sourceId` is simply the live answer.
 */
export function frozenPlateSource(
  item: { frozenAssignment?: Readonly<Record<string, string>> | undefined },
  plateId: string,
  applied: string | null,
): { sourceId: string | null; frozen: boolean; diverged: boolean } {
  const map = item.frozenAssignment;
  if (map === undefined) return { sourceId: applied, frozen: false, diverged: false };
  // ⚠ `?? null`, not `?? applied`. The frozen map is the row's COMPLETE level-2 answer, so a
  // plate absent from it is UNASSIGNED for this run and must not fall through to the live
  // store — see `LiveSourceFrozenAssignmentSchema`'s STRICT note for why a partial freeze
  // would reopen the multi-station case for exactly those plates.
  const sourceId = map[plateId] ?? null;
  return { sourceId, frozen: true, diverged: sourceId !== applied };
}

export function onAirPlateSource(
  item: { sourceOverride?: Readonly<Record<string, string>> | undefined },
  plateId: string,
  applied: string | null,
): { sourceId: string | null; overridden: boolean; patched: boolean } {
  const override = item.sourceOverride?.[plateId];
  if (override === undefined || override === '')
    return { sourceId: applied, overridden: false, patched: false };
  // An override EQUAL to the assignment is still an override on the wire, but it is not
  // a divergence the operator needs told about — saying "patched" for a plate showing
  // exactly what the template says would be noise on the surface that must not have any.
  return { sourceId: override, overridden: override !== applied, patched: true };
}
