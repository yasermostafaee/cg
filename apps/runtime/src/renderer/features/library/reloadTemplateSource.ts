import type { TemplateInfo } from '@cg/shared-ipc';
import { importVcgFile } from './importVcgFile.js';
import { newItemFields } from './newItemFields.js';
import { ensureTemplateSourcePermission } from './templateSourceStore.js';

/** What Reload does to rows that already hold the template. */
export type ReloadDataPolicy = 'keep' | 'file-defaults';

export interface ReloadTemplateResult {
  template: TemplateInfo;
  resetRows: number;
}

/**
 * Re-read one remembered package, update that exact catalogue entry, then optionally replace the
 * field values of rows already holding it with the reloaded template defaults.
 *
 * The import itself is atomic at CG Bridge. Row resets intentionally happen afterwards through the
 * existing `stack.update` door: choosing “file defaults” is an explicit operator action and reaches
 * a resident/on-air page exactly as an ordinary Update does. A refusal is reported rather than
 * hidden; rows already accepted before a later refusal remain accepted, so the error names the
 * partial count instead of pretending the import rolled back.
 */
export async function reloadTemplateSource(
  template: TemplateInfo,
  channel: number | undefined,
  handle: FileSystemFileHandle,
  policy: ReloadDataPolicy,
): Promise<ReloadTemplateResult> {
  if (!(await ensureTemplateSourcePermission(handle))) {
    throw new Error(`Access to “${handle.name}” was not granted; the template was not reloaded.`);
  }

  let file: File;
  try {
    file = await handle.getFile();
  } catch (err) {
    throw new Error(
      `Could not read “${handle.name}” from its original location: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const imported = await importVcgFile(file, channel, undefined, template.templateId);
  if (imported === null) throw new Error(`Reload of “${handle.name}” was cancelled.`);
  const updated = await window.cg.templates.get({
    templateId: template.templateId,
    ...(channel !== undefined && { channel }),
  });
  if (updated === null) {
    throw new Error(
      `“${handle.name}” reloaded, but CG Bridge could not read the updated template.`,
    );
  }

  if (policy === 'keep') return { template: updated, resetRows: 0 };

  const rows = (await window.cg.stack.snapshot()).filter(
    (item) =>
      item.templateId === template.templateId &&
      (channel === undefined || item.slot?.channel === channel),
  );
  const defaults = newItemFields(updated);
  let accepted = 0;
  for (const row of rows) {
    const answer = await window.cg.stack.update({
      itemId: row.itemId,
      fields: defaults,
      mergeMode: 'replace',
    });
    if (!answer.accepted) {
      throw new Error(
        `The package reloaded, but file defaults reached only ${String(accepted)} of ${String(rows.length)} row(s). ${answer.message ?? answer.errorCode ?? 'CG Bridge refused the row update.'}`,
      );
    }
    accepted += 1;
  }
  return { template: updated, resetRows: accepted };
}
