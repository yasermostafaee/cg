import type { FieldValue, StackItemState } from '@cg/shared-schema';
import { reportCommandError } from '../status/commandFeedback.js';
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
 * RELOAD: re-read the file and STAGE the value — exactly like choosing the file
 * did, and exactly like a hand edit. The operator applies it with Update.
 *
 * ── IT USED TO APPLY, AND THAT WAS A HIDDEN TAKE TO AIR ─────────────────────
 *
 * Owner's report: after choosing a file the input correctly sits in draft, but
 * pressing Reload sent an update by itself. It called `applyFieldValue` — the same
 * `stack.update` the Update button sends, scoped to this field — so a button
 * labelled with a READ verb performed a WRITE that reached the graphic on air.
 *
 * Nothing on the surface said so. The operator's mental model is set by the
 * choose-a-file path, which stages and waits; Reload looked like the same gesture
 * repeated and was not. That is the label-and-action-in-two-places class: the word
 * "Reload" describes re-reading the source, and re-reading is all it may do.
 *
 * It also restores this module's own stated rule — the file is "just an input
 * method, never a second content pipeline". An input method that commits is a
 * second pipeline, and it bypassed the one gate (Update) that the offline surface
 * is built around, including its reachability check.
 *
 * A failed read stages nothing and keeps the current value, as before.
 *
 * The `{ accepted }` shape is kept because `AsyncButton` drives its busy/success
 * states from it; `accepted` now means "the file was read and staged", which is
 * the whole of what this operation claims to do.
 */
export async function reloadFromFile(
  item: StackItemState,
  path: FieldPath,
  kind: FromFileFieldKind,
): Promise<{ accepted: boolean }> {
  const staged = await stageFromFile(item, path, kind);
  return { accepted: staged };
}
