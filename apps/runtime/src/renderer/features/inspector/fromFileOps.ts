import type { FieldValue, StackItemState } from '@cg/shared-schema';
import { reportCommandError } from '../status/commandFeedback.js';
import { applyFieldValue } from './applyDraft.js';
import { stageField, type FieldPath } from './draftStore.js';
import { contentToFieldValue, type FromFileFieldKind } from './fromFileContent.js';
import { fromFileState, setFromFileError } from './fromFileStore.js';

/**
 * R-018 — the read → transform → stage/apply orchestration for a field's
 * attached file source. React-free so it tests against a fake
 * `TextFileSource` with a stubbed bridge.
 *
 * MISSING-FILE SAFETY: a failed read touches NOTHING — no stage, no apply —
 * so the current (possibly on-air) value is KEPT; the error is recorded on
 * the entry (rendered inline at the field) and toasted. Never a blank crawl
 * because a share went away.
 */

/**
 * Read the field's attached source and transform per its split config.
 * Returns `null` on a failed read (error recorded + reported) or when no
 * source is attached.
 */
async function readCurrentValue(
  item: StackItemState,
  path: FieldPath,
  kind: FromFileFieldKind,
): Promise<FieldValue | null> {
  const state = fromFileState(item.itemId, path);
  if (state === undefined) return null;
  let content: string;
  try {
    content = await state.source.read();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const message = `Could not read “${state.source.name}” — the current value is kept. (${reason})`;
    setFromFileError(item.itemId, path, message);
    reportCommandError(message);
    return null;
  }
  setFromFileError(item.itemId, path, null);
  return contentToFieldValue(content, kind, { split: state.split, delimiter: state.delimiter });
}

/**
 * Initial load (on choosing the file): read and STAGE the value as a draft —
 * exactly like a hand edit, the operator applies it with Update. Resolves
 * false when the read failed (value untouched).
 */
export async function stageFromFile(
  item: StackItemState,
  path: FieldPath,
  kind: FromFileFieldKind,
): Promise<boolean> {
  const value = await readCurrentValue(item, path, kind);
  if (value === null) return false;
  stageField(item.itemId, path, value);
  return true;
}

/**
 * RELOAD: re-read the file and RE-APPLY the field through the normal
 * field-update path (`applyFieldValue` — the same `stack.update` the Update
 * button sends, scoped to this field). A failed read applies nothing and
 * keeps the current value.
 */
export async function reloadFromFile(
  item: StackItemState,
  path: FieldPath,
  kind: FromFileFieldKind,
): Promise<{ accepted: boolean }> {
  const value = await readCurrentValue(item, path, kind);
  if (value === null) return { accepted: false };
  return applyFieldValue(item, path, value);
}
