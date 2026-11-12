import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { BridgeTextSourcePathSchema } from '@cg/shared-schema';
import { TEMPLATE_SOURCE_MAX_BYTES, type SharedTemplateThumbnail } from '@cg/shared-ipc';
import { readSharedVcgThumbnail } from './shared-template-thumbnail.js';

const MAX_CONCURRENT_THUMBNAILS = 4;
let activeThumbnailReads = 0;

async function resolveWithinShare(
  root: string,
  relative: string,
  expectedRoot?: string,
): Promise<{ root: string; target: string }> {
  if (relative.includes(':')) throw new Error('Use a relative path below Shared files.');
  if (relative !== '') BridgeTextSourcePathSchema.parse(relative);
  const realRoot = await fs.realpath(root);
  if (expectedRoot !== undefined && expectedRoot !== realRoot) {
    throw new Error(
      'The Shared files path has changed. Select the package again from Shared folder.',
    );
  }
  const target = await fs.realpath(path.resolve(realRoot, relative));
  const difference = path.relative(realRoot, target);
  if (
    difference === '..' ||
    difference.startsWith(`..${path.sep}`) ||
    path.isAbsolute(difference)
  ) {
    throw new Error('The selected path is outside Shared files.');
  }
  return { root: realRoot, target };
}

export async function listSharedTemplateFolder(root: string, folder: string) {
  const normalized = folder.replaceAll('\\', '/');
  const resolved = await resolveWithinShare(root, normalized);
  const entries = (await fs.readdir(resolved.target, { withFileTypes: true }))
    .filter(({ name }) => !name.includes(':') && BridgeTextSourcePathSchema.safeParse(name).success)
    .flatMap<{ name: string; kind: 'folder' | 'package' }>((entry) => {
      if (entry.isDirectory()) return [{ name: entry.name, kind: 'folder' as const }];
      if (entry.isFile() && /\.vcg$/i.test(entry.name))
        return [{ name: entry.name, kind: 'package' as const }];
      return [];
    });
  entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  return { root: resolved.root, folder: normalized, entries, thumbnails: true as const };
}

export async function readSharedTemplatePackage(
  root: string,
  folder: string,
  name: string,
  expectedRoot?: string,
) {
  if (!/^[^/\\]+\.vcg$/i.test(name)) throw new Error('Choose a .vcg package.');
  const relative = [folder.replaceAll('\\', '/'), name].filter(Boolean).join('/');
  const resolved = await resolveWithinShare(root, relative, expectedRoot);
  const file = await fs.open(resolved.target, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error('Choose a .vcg package.');
    if (info.size > TEMPLATE_SOURCE_MAX_BYTES)
      throw new Error('This package is too large to read from Shared files.');
    const bytes = Buffer.alloc(info.size + 1);
    let used = 0;
    while (used < bytes.length) {
      const { bytesRead } = await file.read(bytes, used, bytes.length - used, used);
      if (bytesRead === 0) break;
      used += bytesRead;
    }
    if (used !== info.size)
      throw new Error('The package changed while reading. Refresh the folder and try again.');
    return { name, base64: bytes.subarray(0, used).toString('base64'), root: resolved.root };
  } finally {
    await file.close();
  }
}

/** Folder browsing is best effort. Never read a whole package or block the listing on a preview. */
export async function readSharedTemplateThumbnail(
  root: string,
  folder: string,
  name: string,
  expectedRoot?: string,
): Promise<{ thumbnail: SharedTemplateThumbnail | null }> {
  if (!/^[^/\\]+\.vcg$/i.test(name) || activeThumbnailReads >= MAX_CONCURRENT_THUMBNAILS) {
    return { thumbnail: null };
  }
  activeThumbnailReads += 1;
  try {
    const relative = [folder.replaceAll('\\', '/'), name].filter(Boolean).join('/');
    const { target } = await resolveWithinShare(root, relative, expectedRoot);
    if (!(await fs.lstat(target)).isFile()) return { thumbnail: null };
    const file = await fs.open(
      target,
      constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
    );
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > 0xffffffff) return { thumbnail: null };
      const current = await resolveWithinShare(root, relative, expectedRoot);
      const currentInfo = await fs.stat(current.target);
      if (
        current.target !== target ||
        currentInfo.ino !== info.ino ||
        currentInfo.dev !== info.dev
      ) {
        return { thumbnail: null };
      }
      const thumbnail = await readSharedVcgThumbnail(file, info.size);
      const after = await file.stat();
      return {
        thumbnail: after.size === info.size && after.mtimeMs === info.mtimeMs ? thumbnail : null,
      };
    } finally {
      await file.close();
    }
  } catch {
    return { thumbnail: null };
  } finally {
    activeThumbnailReads -= 1;
  }
}
