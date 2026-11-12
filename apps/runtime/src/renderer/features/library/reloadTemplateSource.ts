import type { TemplateInfo } from '@cg/shared-ipc';
import { importVcgFile, type ReloadVcgTarget } from './importVcgFile.js';
import { newItemFields } from './newItemFields.js';
import { readSharedTemplateFile } from './sharedTemplateSource.js';
import {
  ensureTemplateSourcePermission,
  saveTemplateSource,
  templateSourceName,
  type TemplateSource,
} from './templateSourceStore.js';

/** What Reload does to rows that already hold the template. */
export type ReloadDataPolicy = 'keep' | 'file-defaults';

export interface ReloadTemplateResult {
  template: TemplateInfo;
  resetRows: number;
}

async function readLocalTemplateFile(handle: FileSystemFileHandle): Promise<File> {
  if (!(await ensureTemplateSourcePermission(handle))) {
    throw new Error(`Access to “${handle.name}” was not granted; the template was not reloaded.`);
  }
  try {
    return await handle.getFile();
  } catch (err) {
    throw new Error(
      `Could not read “${handle.name}” from its original location: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
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
  source: TemplateSource,
  policy: ReloadDataPolicy,
  approvePackageChange?: ReloadVcgTarget['approvePackageChange'],
): Promise<ReloadTemplateResult | null> {
  const { shared, packageId } = source;
  let file: File;
  if (shared === undefined) {
    file = await readLocalTemplateFile(source.handle);
  } else {
    if (window.cg.link.bridgeAddress() !== shared.bridgeAddress) {
      throw new Error(`“${shared.name}” is remembered on another CG Bridge.`);
    }
    try {
      file = await readSharedTemplateFile(shared);
    } catch (err) {
      throw new Error(
        `Could not read “${shared.name}” from Shared folder: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (window.cg.link.bridgeAddress() !== shared.bridgeAddress) {
      throw new Error('CG Bridge changed. Open Templates again.');
    }
  }

  const imported = await importVcgFile(file, channel, undefined, {
    templateId: template.templateId,
    // Existing records predate this field and use the catalogue id until the next accepted reload.
    packageId: packageId ?? template.templateId,
    ...(approvePackageChange !== undefined && { approvePackageChange }),
  });
  if (imported === null) return null;
  if (packageId !== imported.packageId) {
    const remembered = source.shared === undefined ? source.handle : source.shared;
    await saveTemplateSource(template.templateId, channel, remembered, imported.packageId);
  }
  const updated = await window.cg.templates.get({
    templateId: template.templateId,
    ...(channel !== undefined && { channel }),
  });
  if (updated === null) {
    throw new Error(
      `“${templateSourceName(source)}” reloaded, but CG Bridge could not read the updated template.`,
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
