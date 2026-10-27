import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_TEXT_SOURCE_BYTES, readTextSource } from '../src/text-source-reader.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function temp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-text-source-'));
  dirs.push(dir);
  return dir;
}

describe('R-102 — the confined live text-source reader', () => {
  it('reads UTF-8 below the root and sees bytes saved later', async () => {
    const root = temp();
    fs.mkdirSync(path.join(root, 'newsroom'));
    const file = path.join(root, 'newsroom', 'crawl.txt');
    fs.writeFileSync(file, 'خبر اول', 'utf8');
    await expect(readTextSource(root, 'newsroom/crawl.txt')).resolves.toEqual({
      name: 'newsroom/crawl.txt',
      sourcePath: file,
      content: 'خبر اول',
    });
    fs.writeFileSync(file, 'خبر دوم', 'utf8');
    await expect(readTextSource(root, 'newsroom\\crawl.txt')).resolves.toMatchObject({
      content: 'خبر دوم',
    });
  });

  it('decodes UTF-8 like browser File.text and removes a BOM', async () => {
    const root = temp();
    fs.writeFileSync(path.join(root, 'bom.txt'), Buffer.from([0xef, 0xbb, 0xbf, 0xd8, 0xae]));
    await expect(readTextSource(root, 'bom.txt')).resolves.toMatchObject({ content: 'خ' });
  });

  it.each(['../secret.txt', '/secret.txt', 'C:\\secret.txt', '\\\\server\\share\\x.txt'])(
    'rejects unsafe path %s',
    async (requested) => {
      await expect(readTextSource(temp(), requested)).rejects.toThrow(/safe relative path|outside/);
    },
  );

  it('rejects missing files, directories and oversized files without returning bytes', async () => {
    const root = temp();
    fs.mkdirSync(path.join(root, 'folder'));
    await expect(readTextSource(root, 'missing.txt')).rejects.toThrow(/cannot be found or read/);
    await expect(readTextSource(root, 'folder')).rejects.toThrow(/not a regular file/);
    fs.writeFileSync(path.join(root, 'large.txt'), Buffer.alloc(MAX_TEXT_SOURCE_BYTES + 1));
    await expect(readTextSource(root, 'large.txt')).rejects.toThrow(/larger than/);
  });

  it('rejects a symlink escape when the host permits creating one', async () => {
    const root = temp();
    const outside = temp();
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
    const link = path.join(root, 'linked.txt');
    try {
      fs.symlinkSync(path.join(outside, 'secret.txt'), link, 'file');
    } catch {
      return; // Windows without Developer Mode/admin cannot create this fixture.
    }
    await expect(readTextSource(root, 'linked.txt')).rejects.toThrow(/resolves outside/);
  });
});
