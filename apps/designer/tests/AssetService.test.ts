import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AssetService } from '../src/main/services/AssetService.js';

let tmp: string | undefined;

afterEach(async () => {
  if (tmp) await fs.promises.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

async function setup(): Promise<{ svc: AssetService; sourceDir: string; workingRoot: string }> {
  tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-assetsvc-'));
  const sourceDir = path.join(tmp, 'sources');
  await fs.promises.mkdir(sourceDir, { recursive: true });
  const workingRoot = path.join(tmp, 'working');
  let counter = 0;
  const svc = new AssetService({
    workingRoot,
    randomId: () => `asset-${String(++counter)}`,
  });
  return { svc, sourceDir, workingRoot };
}

async function makeImage(dir: string, name: string, content: string): Promise<string> {
  const p = path.join(dir, name);
  await fs.promises.writeFile(p, content);
  return p;
}

describe('AssetService', () => {
  it('imports a PNG and writes it under image/ with a sha256 name', async () => {
    const { svc, sourceDir, workingRoot } = await setup();
    const src = await makeImage(sourceDir, 'logo.png', 'fake-png-bytes');
    const meta = await svc.import(src);
    expect(meta.kind).toBe('image');
    expect(meta.filename).toBe('logo.png');
    expect(meta.sha256).toHaveLength(64);
    expect(meta.workingPath).toContain(path.join(workingRoot, 'image'));
    expect(meta.workingPath.endsWith('.png')).toBe(true);
    expect(fs.existsSync(meta.workingPath)).toBe(true);
  });

  it('imports the same file twice but dedups on sha256', async () => {
    const { svc, sourceDir } = await setup();
    const src = await makeImage(sourceDir, 'logo.png', 'fake');
    const a = await svc.import(src);
    const b = await svc.import(src);
    expect(a.assetId).toBe(b.assetId);
    expect(svc.list()).toHaveLength(1);
  });

  it('list() returns every imported asset', async () => {
    const { svc, sourceDir } = await setup();
    await svc.import(await makeImage(sourceDir, 'a.png', 'A'));
    await svc.import(await makeImage(sourceDir, 'b.png', 'B'));
    expect(svc.list()).toHaveLength(2);
  });

  it('emits imported on every fresh import', async () => {
    const { svc, sourceDir } = await setup();
    const captured: string[] = [];
    svc.on('imported', (m) => captured.push(m.assetId));
    await svc.import(await makeImage(sourceDir, 'a.png', 'A'));
    await svc.import(await makeImage(sourceDir, 'b.png', 'B'));
    expect(captured).toHaveLength(2);
  });

  it('honors a kindHint over the extension', async () => {
    const { svc, sourceDir } = await setup();
    const src = await makeImage(sourceDir, 'mystery.bin', 'data');
    const meta = await svc.import(src, 'lottie');
    expect(meta.kind).toBe('lottie');
  });

  it('falls back to image when extension is unknown', async () => {
    const { svc, sourceDir } = await setup();
    const src = await makeImage(sourceDir, 'mystery.bin', 'data');
    const meta = await svc.import(src);
    expect(meta.kind).toBe('image');
  });

  it('remove() drops a known assetId', async () => {
    const { svc, sourceDir } = await setup();
    const meta = await svc.import(await makeImage(sourceDir, 'a.png', 'A'));
    expect(svc.remove(meta.assetId)).toBe(true);
    expect(svc.remove(meta.assetId)).toBe(false);
    expect(svc.get(meta.assetId)).toBeNull();
  });
});
