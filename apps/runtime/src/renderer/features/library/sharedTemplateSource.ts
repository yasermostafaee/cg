import { base64ToBytes } from './packageBytes.js';
import type { SharedTemplateSource } from './templateSourceStore.js';

export async function readSharedTemplateFile({
  root,
  folder,
  name,
}: Pick<SharedTemplateSource, 'root' | 'folder' | 'name'>): Promise<File> {
  const requireOriginalRoot = (current: string): void => {
    if (current !== root) {
      throw new Error(
        'The Shared files path has changed. Select the package again from Shared folder.',
      );
    }
  };
  // Older Bridges ignore expectedRoot. Verify their current root before and after the read.
  requireOriginalRoot((await window.cg.sharedFiles.templateFolder({ folder: '' })).root);
  const result = await window.cg.sharedFiles.templateRead({ folder, name, expectedRoot: root });
  requireOriginalRoot(
    result.root ?? (await window.cg.sharedFiles.templateFolder({ folder: '' })).root,
  );
  const bytes = Uint8Array.from(base64ToBytes(result.base64));
  return new File([bytes.buffer], result.name, { type: 'application/octet-stream' });
}
