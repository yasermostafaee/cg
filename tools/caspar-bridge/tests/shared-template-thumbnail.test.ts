import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  listSharedTemplateFolder,
  readSharedTemplateThumbnail,
} from '../src/shared-template-folder.js';

const fixture = new URL('../../../fixtures/b034/hidden-ancestor-inert.vcg', import.meta.url);
let scratch: string;
let share: string;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'cg-shared-thumbnail-'));
  share = join(scratch, 'shared');
  await mkdir(share);
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('shared template thumbnails', () => {
  it('reads the ordinary exported scene without returning its HTML, scripts or media', async () => {
    const subfolder = join(share, 'خبر');
    const name = 'قالب.vcg';
    await mkdir(subfolder);
    await writeFile(join(subfolder, name), await readFile(fixture));

    const listing = await listSharedTemplateFolder(share, 'خبر');
    expect(listing).toMatchObject({
      thumbnails: true,
      entries: [{ name, kind: 'package' }],
    });
    const result = await readSharedTemplateThumbnail(share, 'خبر', name, listing.root);
    expect(result).toMatchObject({
      thumbnail: { kind: 'scene', scene: { id: 'hidden-ancestor-inert' } },
    });
    expect(Object.keys(result.thumbnail ?? {})).toEqual(['kind', 'scene']);
  });

  it('returns no preview for a forged ZIP size, a corrupt package and a stale shared root', async () => {
    const bytes = await readFile(fixture);
    const directory = bytes.readUInt32LE(bytes.length - 22 + 16);
    const entry = bytes.indexOf('template.json', directory) - 46;
    expect(entry).toBeGreaterThanOrEqual(directory);
    expect(bytes.readUInt32LE(entry)).toBe(0x02014b50);
    bytes.writeUInt32LE(512 * 1024, entry + 24);

    await writeFile(join(share, 'oversized.vcg'), bytes);
    await writeFile(join(share, 'corrupt.vcg'), 'Not an archive');
    await writeFile(join(share, 'good.vcg'), await readFile(fixture));
    await expect(readSharedTemplateThumbnail(share, '', 'oversized.vcg')).resolves.toEqual({
      thumbnail: null,
    });
    await expect(readSharedTemplateThumbnail(share, '', 'corrupt.vcg')).resolves.toEqual({
      thumbnail: null,
    });
    await expect(
      readSharedTemplateThumbnail(share, '', 'good.vcg', await realpath(scratch)),
    ).resolves.toEqual({ thumbnail: null });
  });

  it('refuses relative escapes and an in-share directory link to an outside package', async () => {
    await writeFile(join(scratch, 'private.vcg'), await readFile(fixture));
    await symlink(scratch, join(share, 'outside'), 'junction');

    await expect(readSharedTemplateThumbnail(share, '..', 'private.vcg')).resolves.toEqual({
      thumbnail: null,
    });
    await expect(readSharedTemplateThumbnail(share, 'outside', 'private.vcg')).resolves.toEqual({
      thumbnail: null,
    });
  });
});
