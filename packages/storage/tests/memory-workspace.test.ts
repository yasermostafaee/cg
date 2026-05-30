import { describe, expect, it } from 'vitest';
import { MemoryWorkspace } from '../src/memory-workspace.js';
import { MemoryKv } from '../src/kv.js';

describe('MemoryWorkspace', () => {
  it('round-trips bytes', async () => {
    const ws = new MemoryWorkspace();
    await ws.writeFile('a/b.bin', new Uint8Array([1, 2, 3]));
    expect(await ws.readFile('a/b.bin')).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('returns null for missing files', async () => {
    const ws = new MemoryWorkspace();
    expect(await ws.readFile('nope.bin')).toBeNull();
    expect(await ws.readText('nope.txt')).toBeNull();
    expect(await ws.readJson('nope.json')).toBeNull();
    expect(await ws.exists('nope')).toBe(false);
  });

  it('round-trips JSON', async () => {
    const ws = new MemoryWorkspace();
    await ws.writeJson('projects/x.json', { id: 'x', n: 3 });
    expect(await ws.readJson('projects/x.json')).toEqual({ id: 'x', n: 3 });
  });

  it('preserves UTF-8 / Persian text', async () => {
    const ws = new MemoryWorkspace();
    await ws.writeText('t.txt', 'سارا نادری');
    expect(await ws.readText('t.txt')).toBe('سارا نادری');
  });

  it('lists immediate children with files and directories', async () => {
    const ws = new MemoryWorkspace();
    await ws.writeText('projects/a.cg.json', '{}');
    await ws.writeText('projects/b.cg.json', '{}');
    await ws.writeText('assets/img/logo.png', 'x');
    const root = await ws.list();
    expect(root.map((e) => `${e.kind}:${e.name}`).sort()).toEqual([
      'directory:assets',
      'directory:projects',
    ]);
    const projects = await ws.list('projects');
    expect(projects.map((e) => e.name)).toEqual(['a.cg.json', 'b.cg.json']);
  });

  it('deletes files', async () => {
    const ws = new MemoryWorkspace();
    await ws.writeText('x.txt', 'hi');
    await ws.delete('x.txt');
    expect(await ws.exists('x.txt')).toBe(false);
    // deleting a missing file is a no-op
    await expect(ws.delete('x.txt')).resolves.toBeUndefined();
  });

  it('isolates stored bytes from later mutation of the source array', async () => {
    const ws = new MemoryWorkspace();
    const src = new Uint8Array([9, 9]);
    await ws.writeFile('x.bin', src);
    src[0] = 0;
    expect(await ws.readFile('x.bin')).toEqual(new Uint8Array([9, 9]));
  });
});

describe('MemoryKv', () => {
  it('stores and retrieves JSON values', () => {
    const kv = new MemoryKv();
    kv.set('recent', ['a', 'b']);
    expect(kv.get<string[]>('recent')).toEqual(['a', 'b']);
  });

  it('returns null for missing keys and after remove', () => {
    const kv = new MemoryKv();
    expect(kv.get('missing')).toBeNull();
    kv.set('k', 1);
    kv.remove('k');
    expect(kv.get('k')).toBeNull();
  });
});
