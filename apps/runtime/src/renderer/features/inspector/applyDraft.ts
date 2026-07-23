import type { FieldValue, FieldValues, StackItemState } from '@cg/shared-schema';
import { reportCommandError } from '../status/commandFeedback.js';
import { errorCodeMessage } from '../../ui/errorCodeMessage.js';
import {
  buildApplyPayload,
  buildOverlayPayload,
  clearStagedMatching,
  singleFieldOverlay,
  snapshotDraft,
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
  return sendUpdate(item, sent, buildApplyPayload(item.itemId, item.fields));
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
