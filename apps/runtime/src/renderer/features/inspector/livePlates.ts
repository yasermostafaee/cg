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
