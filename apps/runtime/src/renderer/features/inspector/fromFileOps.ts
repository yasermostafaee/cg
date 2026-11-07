import type { FieldValue, ListItemField, StackItemState } from '@cg/shared-schema';
import { structuredRowsXlsxToCsv } from '@cg/vcg-format';
import { reportCommandError } from '../status/commandFeedback.js';
import { effectiveValue, stageField, valueAt, type FieldPath } from './draftStore.js';
import { contentToFieldValue, type FromFileFieldKind } from './fromFileContent.js';
import { fromFileState, setFromFileError } from './fromFileStore.js';
import { preserveLockedListItemFields, toListItems, withStableListItemIds } from './listField.js';

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
  itemId: string,
  path: FieldPath,
  kind: FromFileFieldKind,
  itemFields?: readonly ListItemField[],
): Promise<FieldValue | null> {
  const state = fromFileState(itemId, path);
  if (state === undefined) return null;
  let content: string;
  try {
    if (kind === 'list' && /\.xlsx$/iu.test(state.source.name)) {
      if (state.source.readBytes === undefined) {
        throw new Error(
          'This Excel source cannot be read as binary data. Connect the workbook again.',
        );
      }
      content = await structuredRowsXlsxToCsv(await state.source.readBytes());
    } else {
      content = await state.source.read();
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const message = `Could not read “${state.source.name}” — the current value is kept. (${reason})`;
    setFromFileError(itemId, path, message);
    reportCommandError(message);
    return null;
  }
  try {
    const value = contentToFieldValue(content, kind, {
      split: state.split,
      delimiter: state.delimiter,
      format: state.format,
      ...(kind === 'list' && itemFields !== undefined ? { itemFields } : {}),
    });
    setFromFileError(itemId, path, null);
    return value;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const message = `Could not use “${state.source.name}” — the current value is kept. (${reason})`;
    setFromFileError(itemId, path, message);
    reportCommandError(message);
    return null;
  }
}

/**
 * Initial load (on choosing the file): read and STAGE the value as a draft —
 * exactly like a hand edit, the operator applies it with Update. Resolves
 * false when the read failed (value untouched).
 */
export async function stageFromFile(
  item: Pick<StackItemState, 'itemId' | 'fields'>,
  path: FieldPath,
  kind: FromFileFieldKind,
  itemFields?: readonly ListItemField[],
): Promise<boolean> {
  /*
   * Snapshot the TARGET before the asynchronous file read.
   *
   * The runtime bridge keeps stack-row objects live. While an XLSX is being
   * read, selecting another row can repoint that object at the newly-selected
   * item. Reading `item.itemId` after the await therefore used to stage the old
   * field path (for example `forecast`) on the next item (for example the league
   * table). The result looked random: the first template opened clean, the next
   * one showed draft, and returning to the first could make it dirty too.
   *
   * A file read belongs to the row and path that STARTED it. Capture every part
   * of that address — and the applied list whose private ids we preserve — before
   * yielding to the bridge. A later selection may rerender or unmount the control,
   * but it cannot redirect this operation to another stack item.
   */
  const itemId = item.itemId;
  const targetPath = [...path];
  const appliedValue = valueAt(item.fields, targetPath);
  const currentList =
    kind === 'list' ? toListItems(effectiveValue(itemId, targetPath, appliedValue)) : undefined;
  const value = await readCurrentValue(itemId, targetPath, kind, itemFields);
  if (value === null) return false;
  let stagedValue: FieldValue;
  try {
    stagedValue =
      kind === 'list'
        ? preserveLockedListItemFields(
            currentList ?? [],
            withStableListItemIds(currentList ?? [], toListItems(value)),
            itemFields,
          )
        : value;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const source = fromFileState(itemId, targetPath)?.source.name ?? 'file';
    const message = `Could not use “${source}” — the current value is kept. (${reason})`;
    setFromFileError(itemId, targetPath, message);
    reportCommandError(message);
    return false;
  }
  stageField(itemId, targetPath, stagedValue);
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
  item: Pick<StackItemState, 'itemId' | 'fields'>,
  path: FieldPath,
  kind: FromFileFieldKind,
  itemFields?: readonly ListItemField[],
): Promise<{ accepted: boolean }> {
  const staged = await stageFromFile(item, path, kind, itemFields);
  return { accepted: staged };
}
