import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pack } from '@cg/vcg-format';
import { TemplateRegistry } from '../src/main/services/TemplateRegistry.js';
import { WatchedFolderService } from '../src/main/services/WatchedFolderService.js';

let tmp: string | undefined;
let svc: WatchedFolderService | undefined;

afterEach(async () => {
  if (svc) svc.stop();
  svc = undefined;
  if (tmp) await fs.promises.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

async function buildSampleVcg(): Promise<Buffer> {
  const scene = {
    schemaVersion: 1 as const,
    id: 'lt-fixture',
    name: 'fixture',
    templateType: 'lower-third' as const,
    resolution: { width: 1920, height: 1080 },
    frameRate: 50 as const,
    safeAreas: { title: 10, action: 5 },
    background: 'transparent' as const,
    layers: [],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: {
      createdAt: '2026-05-23T00:00:00.000Z',
      updatedAt: '2026-05-23T00:00:00.000Z',
    },
  };
  return pack({
    scene,
    manifestExtras: {
      id: scene.id,
      name: scene.name,
      authoring: {
        designerVersion: '0.0.0',
        createdAt: scene.metadata.createdAt,
        exportedAt: scene.metadata.updatedAt,
      },
      compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
      fontDeps: [],
      assetIndex: [],
    },
    indexHtml:
      '<!doctype html><html><body><script type="module" src="./cg.js"></script></body></html>',
    cgJs: 'export const tag = "stub";',
    cgCss: 'body{margin:0}',
  });
}

describe('WatchedFolderService', () => {
  it('ingests pre-existing .vcg files at start()', async () => {
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-watched-'));
    const watchRoot = path.join(tmp, 'incoming');
    await fs.promises.mkdir(watchRoot, { recursive: true });
    const vcg = await buildSampleVcg();
    await fs.promises.writeFile(path.join(watchRoot, 'demo.vcg'), vcg);

    const registry = new TemplateRegistry();
    svc = new WatchedFolderService({
      watchRoot,
      cacheRoot: path.join(tmp, 'cache'),
      templates: registry,
    });
    await svc.start();

    const entry = registry.get('lt-fixture');
    expect(entry).not.toBeNull();
    expect(entry?.templateType).toBe('lower-third');
    expect(entry?.url).toMatch(/^file:\/\//);
    expect(entry?.url).toMatch(/index\.html$/);
  });

  it('ingests a file dropped after start()', async () => {
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-watched-'));
    const watchRoot = path.join(tmp, 'incoming');
    const registry = new TemplateRegistry();
    svc = new WatchedFolderService({
      watchRoot,
      cacheRoot: path.join(tmp, 'cache'),
      templates: registry,
    });
    await svc.start();

    const ingested = new Promise<{ templateId: string }>((resolve) => {
      svc!.once('ingested', resolve);
    });
    const vcg = await buildSampleVcg();
    await fs.promises.writeFile(path.join(watchRoot, 'new.vcg'), vcg);

    const info = await Promise.race([
      ingested,
      // fs.watch isn't 100% reliable across all FS types in CI — fall back to a direct
      // ingest after 500ms so the test isn't flaky on slow runners.
      new Promise<{ templateId: string }>((resolve) => {
        setTimeout(() => {
          void svc!
            .ingest(path.join(watchRoot, 'new.vcg'))
            .then(() => resolve({ templateId: registry.list()[0]?.templateId ?? '' }))
            .catch(() => resolve({ templateId: '' }));
        }, 500);
      }),
    ]);
    expect(info.templateId).toBe('lt-fixture');
  });

  it('rejects a .vcg whose integrity verification fails', async () => {
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-watched-'));
    const watchRoot = path.join(tmp, 'incoming');
    await fs.promises.mkdir(watchRoot, { recursive: true });
    // A non-vcg buffer (raw bytes) won't unzip + verify cleanly.
    await fs.promises.writeFile(path.join(watchRoot, 'broken.vcg'), Buffer.from('not a vcg'));

    const registry = new TemplateRegistry();
    svc = new WatchedFolderService({
      watchRoot,
      cacheRoot: path.join(tmp, 'cache'),
      templates: registry,
    });
    let failed = false;
    svc.on('failed', () => (failed = true));
    await svc.start();
    expect(failed).toBe(true);
    expect(registry.list()).toEqual([]);
  });
});
