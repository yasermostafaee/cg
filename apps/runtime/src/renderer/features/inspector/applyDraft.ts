import type { StackItemState } from '@cg/shared-schema';
import { reportCommandError } from '../status/commandFeedback.js';
import { buildApplyPayload, clearStagedMatching, snapshotDraft } from './draftStore.js';

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
export function applyDraft(item: StackItemState): Promise<{ accepted: boolean }> {
  const sent = snapshotDraft(item.itemId);
  const fields = buildApplyPayload(item.itemId, item.fields);
  return window.cg.stack.update({ itemId: item.itemId, fields, mergeMode: 'merge' }).then(
    (res) => {
      if (res.accepted) clearStagedMatching(item.itemId, sent);
      else reportCommandError('Update was not accepted.');
      return res;
    },
    (err: unknown) => {
      reportCommandError(err instanceof Error ? err.message : 'Update failed.');
      throw err instanceof Error ? err : new Error('Update failed.');
    },
  );
}
