import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { BridgeTextSourcePathSchema } from '@cg/shared-schema';
import { TEMPLATE_SOURCE_MAX_BYTES } from '@cg/shared-ipc';

async function resolveWithinShare(
  root: string,
  relative: string,
): Promise<{ root: string; target: string }> {
  if (relative.includes(':')) throw new Error('Use a relative path below Shared files.');
  if (relative !== '') BridgeTextSourcePathSchema.parse(relative);
  const realRoot = await fs.realpath(root);
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
  return { root: resolved.root, folder: normalized, entries };
}

export async function readSharedTemplatePackage(root: string, folder: string, name: string) {
  if (!/^[^/\\]+\.vcg$/i.test(name)) throw new Error('Choose a .vcg package.');
  const relative = [folder.replaceAll('\\', '/'), name].filter(Boolean).join('/');
  const { target } = await resolveWithinShare(root, relative);
  const file = await fs.open(target, 'r');
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
    return { name, base64: bytes.subarray(0, used).toString('base64') };
  } finally {
    await file.close();
  }
}
