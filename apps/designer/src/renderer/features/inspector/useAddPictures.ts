import { useState } from 'react';
import { naturalCompare } from '@cg/text-shaping';
import { partitionSupported, skippedFilesMessage } from '../../../shared/asset-types.js';
import { designerStore } from '../../state/store.js';

/** A file's name for ORDERING: its path inside a picked folder, else its own name. */
function orderName(file: File): string {
  return file.webkitRelativePath !== '' ? file.webkitRelativePath : file.name;
}

/**
 * `D-163` — add a book's pages many at a time: a multi-file pick or a whole folder, put in NATURAL
 * order (`page2` before `page10`, in any digit set — the one comparison CG Control uses too),
 * imported one by one through the ordinary asset import (deduplicated by SHA-256), and added to
 * the sequence as ONE edit. Shared by the Inspector's Pages card and the Pages manager.
 */
export function useAddPictures(elementId: string): {
  busy: { done: number; total: number } | null;
  add: (folder: boolean) => Promise<void>;
} {
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);

  async function add(folder: boolean): Promise<void> {
    const files = await window.cg.assets.pick('image', { folder });
    if (files.length === 0) return;
    const { valid, rejected } = partitionSupported('image', files);
    if (rejected.length > 0) {
      designerStore.showNotice(skippedFilesMessage(rejected.map((f) => f.name)));
    }
    if (valid.length === 0) return;
    const ordered = [...valid].sort((a, b) => naturalCompare(orderName(a), orderName(b)));
    const pictures: { assetId: string; name: string }[] = [];
    const failed: string[] = [];
    setBusy({ done: 0, total: ordered.length });
    try {
      for (const [i, file] of ordered.entries()) {
        try {
          const { asset } = await window.cg.assets.store(file, 'image');
          pictures.push({ assetId: asset.assetId, name: file.name });
        } catch {
          failed.push(file.name);
        }
        setBusy({ done: i + 1, total: ordered.length });
      }
    } finally {
      setBusy(null);
    }
    if (failed.length > 0) {
      const shown = failed.slice(0, 3).join(', ');
      const more = failed.length > 3 ? `, +${String(failed.length - 3)} more` : '';
      designerStore.showNotice(`Could not add ${String(failed.length)} pictures: ${shown}${more}`);
    }
    designerStore.addSequencePictures(elementId, pictures);
  }

  return { busy, add };
}
