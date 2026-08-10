import type { FieldValue, FieldValues, StackItemState } from '@cg/shared-schema';
import { reportCommandError } from '../status/commandFeedback.js';
import { errorCodeMessage } from '../../ui/errorCodeMessage.js';
import { commitSourceAssignments, currentSourceAssignments } from '../sources/sourceStore.js';
import {
  buildApplyPayload,
  buildOverlayPayload,
  clearStagedMatching,
  clearStagedPlatesMatching,
  singleFieldOverlay,
  snapshotDraft,
  snapshotPlateDraft,
  stageField,
  type FieldPath,
} from './draftStore.js';

/**
 * R-003 — apply an item's staged draft as ONE atomic `stack.update`: the
 * complete field-set (applied values with drafts overlaid). On an accepted
 * apply, ONLY the fields that were actually sent (and are unchanged since) are
 * cleared — a field the operator staged DURING the in-flight round-trip
 * survives instead of being silently dropped. A rejected update (e.g. the link
 * is down) keeps every edit staged. Errors surface via the same command-feedback
 * channel the stack intents use — never swallowed, never shown optimistically.
 * Sending with nothing staged re-sends the applied values (the B-048 workaround).
 */
export function applyDraft(
  item: StackItemState,
): Promise<{ accepted: boolean; errorCode?: string | undefined }> {
  const sent = snapshotDraft(item.itemId);
  const plates = snapshotPlateDraft(item.itemId);
  const fields = (): Promise<{ accepted: boolean; errorCode?: string | undefined }> =>
    sendUpdate(item, sent, buildApplyPayload(item.itemId, item.fields));
  if (plates.size === 0) return fields();
  // PLATES FIRST, and it is not arbitrary: the assignment reaches NOTHING on air
  // (it is read at the next take), while `stack.update` reaches the graphic that
  // is on the channel now. Doing the harmless half first means a refused
  // assignment cannot leave a half-applied on-air change behind it.
  return sendPlateAssignments(item, plates).then((platesAccepted) =>
    // BOTH halves run regardless, and the verdict is the AND of them: a refused
    // assignment must not silently discard a field edit the operator also staged,
    // and a refused field update must not make an accepted assignment look
    // rejected. Each half clears only its OWN staged entries, on its own success.
    fields().then((res) => (platesAccepted ? res : { ...res, accepted: false })),
  );
}

/**
 * D-137 / C-015 — write the item's staged plate assignments through
 * `sources.set-assignments`.
 *
 * ⚠ TEMPLATE-LEVEL, so the payload is built from the assignments IN FORCE with
 * this template's staged plates overlaid — never from the item's own view alone.
 * An empty staged value means "not assigned", which REMOVES the entry rather than
 * writing a blank one: an assignment naming nothing is a state nothing downstream
 * can read.
 */
function sendPlateAssignments(
  item: StackItemState,
  plates: ReadonlyMap<string, string>,
): Promise<boolean> {
  const current = currentSourceAssignments();
  const rest = current.assignments.filter(
    (a) => !(a.templateId === item.templateId && plates.has(a.plateId)),
  );
  const added = [...plates.entries()]
    .filter(([, sourceId]) => sourceId !== '')
    .map(([plateId, sourceId]) => ({ templateId: item.templateId, plateId, sourceId }));
  return commitSourceAssignments({ assignments: [...rest, ...added] }).then((refusal) => {
    if (refusal === null) {
      clearStagedPlatesMatching(item.itemId, plates);
      return true;
    }
    // The same command-feedback channel every other refusal on this surface
    // uses — never swallowed, never shown optimistically. The staged plates
    // stay staged, exactly as a rejected field update keeps its drafts.
    reportCommandError(
      refusal.detail === undefined ? refusal.text : `${refusal.text} ${refusal.detail}`,
    );
    return false;
  });
}

/**
 * R-018 — apply ONE field's value now, through the SAME `stack.update` path
 * the Update button uses. The value is STAGED first, so a rejected/failed
 * update keeps it as a draft (dirty marker shows) exactly like a hand edit;
 * on acceptance only THIS field's staged entry clears. Other fields ride along
 * at their APPLIED values — a from-file reload never carries the operator's
 * unrelated staged edits to air.
 */
export function applyFieldValue(
  item: StackItemState,
  path: FieldPath,
  value: FieldValue,
): Promise<{ accepted: boolean; errorCode?: string | undefined }> {
  stageField(item.itemId, path, value);
  const sent = singleFieldOverlay(path, value);
  return sendUpdate(item, sent, buildOverlayPayload(item.fields, sent));
}

/** The ONE wire call + feedback path behind both apply flavors above. */
function sendUpdate(
  item: StackItemState,
  sent: FieldValues,
  fields: FieldValues,
): Promise<{ accepted: boolean; errorCode?: string | undefined }> {
  return window.cg.stack.update({ itemId: item.itemId, fields, mergeMode: 'merge' }).then(
    (res) => {
      if (res.accepted) clearStagedMatching(item.itemId, sent);
      // B-070 — say WHY. An update onto a producerless slot is no longer
      // refused at all (the bridge commits it), so a refusal that reaches here
      // is a real one and must name its cause, not just "not accepted".
      else reportCommandError(errorCodeMessage(res.errorCode) ?? 'Update was not accepted.');
      return res;
    },
    (err: unknown) => {
      reportCommandError(err instanceof Error ? err.message : 'Update failed.');
      throw err instanceof Error ? err : new Error('Update failed.');
    },
  );
}
