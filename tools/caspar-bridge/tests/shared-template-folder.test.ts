import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
