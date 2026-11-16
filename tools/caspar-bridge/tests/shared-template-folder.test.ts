import { mkdir, mkdtemp, realpath, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SharedTemplateFolderChannel } from '@cg/shared-ipc';
import { expect, it } from 'vitest';
import {
  listSharedTemplateFolder,
  readSharedTemplatePackage,
} from '../src/shared-template-folder.js';

it('reads the original package only under the remembered canonical shared root', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'cg-shared-root-'));
  try {
    const original = join(scratch, 'original');
    const changed = join(scratch, 'changed');
    const folder = 'خبر';
    const name = 'تیتر.vcg';
    await Promise.all([mkdir(join(original, folder), { recursive: true }), mkdir(changed)]);
    await writeFile(join(original, folder, name), 'original');
    const { root } = await listSharedTemplateFolder(original, folder);
    expect(root).toBe(await realpath(original));
    expect(await readSharedTemplatePackage(original, folder, name, root)).toEqual({
      root,
      name,
      base64: Buffer.from('original').toString('base64'),
    });
    await expect(readSharedTemplatePackage(changed, folder, name, root)).rejects.toThrow(
      'The Shared files path has changed.',
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

it('returns file modification times over the existing folder wire contract', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'cg-shared-mtime-'));
  try {
    const root = join(scratch, 'share');
    const outside = join(scratch, 'outside');
    const older = new Date('2025-02-01T00:00:00Z');
    const newer = new Date('2026-02-01T00:00:00Z');
    await Promise.all([mkdir(join(root, 'news'), { recursive: true }), mkdir(outside)]);
    await Promise.all([
      writeFile(join(root, 'a-old.vcg'), 'older'),
      writeFile(join(root, 'z-new.VCG'), 'newer'),
      writeFile(join(root, 'ignored.txt'), 'not a package'),
      writeFile(join(outside, 'outside.vcg'), 'outside the share'),
      symlink(outside, join(root, 'outside'), 'junction'),
    ]);
    await Promise.all([
      utimes(join(root, 'a-old.vcg'), older, older),
      utimes(join(root, 'z-new.VCG'), newer, newer),
    ]);

    const result = SharedTemplateFolderChannel.response.parse(
      await listSharedTemplateFolder(root, ''),
    );
    expect(result.entries).toEqual([
      { name: 'news', kind: 'folder' },
      { name: 'a-old.vcg', kind: 'package', modifiedAtMs: older.getTime() },
      { name: 'z-new.VCG', kind: 'package', modifiedAtMs: newer.getTime() },
    ]);
    await expect(listSharedTemplateFolder(root, 'outside')).rejects.toThrow('outside Shared files');
    const oldBridge = { ...result, entries: [{ name: 'legacy.vcg', kind: 'package' }] };
    expect(SharedTemplateFolderChannel.response.parse(oldBridge)).toEqual(oldBridge);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

it('tells the operator whether the server root or a remembered subfolder went missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cg-shared-missing-'));
  try {
    await expect(listSharedTemplateFolder(root, 'previous-folder')).rejects.toThrow(
      'CG Bridge could not find the selected subfolder. Use Up',
    );
    await expect(listSharedTemplateFolder(join(root, 'missing-root'), '')).rejects.toThrow(
      'CG Bridge could not find this folder.',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
