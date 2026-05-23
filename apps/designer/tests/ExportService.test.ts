import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { unpack, verify } from '@cg/vcg-format';
import { AssetService } from '../src/main/services/AssetService.js';
import { ExportService } from '../src/main/services/ExportService.js';
import { ProjectService } from '../src/main/services/ProjectService.js';

let tmp: string | undefined;

afterEach(async () => {
  if (tmp) await fs.promises.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

const CG_JS_STUB = `export function createRuntime(){return{ready:Promise.resolve(),play:async()=>{}}}export function installCasparGlobals(){}`;

async function setup(): Promise<{
  projects: ProjectService;
  assets: AssetService;
  exporter: ExportService;
  tmpDir: string;
}> {
  tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-exportsvc-'));
  const projects = new ProjectService({
    recentFilePath: path.join(tmp, 'recent.json'),
    now: () => new Date('2026-05-23T10:00:00.000Z'),
    randomId: () => 'scene-fixed',
  });
  let assetCounter = 0;
  const assets = new AssetService({
    workingRoot: path.join(tmp, 'working'),
    randomId: () => `asset-${String(++assetCounter)}`,
  });
  const exporter = new ExportService({ cgJs: CG_JS_STUB, assets });
  return { projects, assets, exporter, tmpDir: tmp };
}

describe('ExportService — preflight', () => {
  it('reports empty-scene info on a brand-new scene', async () => {
    const { projects, exporter } = await setup();
    const { scene } = projects.newScene('LT', 'lower-third');
    const issues = exporter.preflight(scene);
    expect(issues.some((i) => i.code === 'empty-scene')).toBe(true);
  });

  it('reports missing-asset error when image references an unknown id', async () => {
    const { projects, exporter } = await setup();
    const { scene } = projects.newScene('LT', 'lower-third');
    const sceneWithBadImage = {
      ...scene,
      layers: [
        {
          id: 'L1',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal' as const,
          children: [
            {
              id: 'el-1',
              type: 'image' as const,
              name: 'bg',
              visible: true,
              locked: false,
              transform: {
                position: { x: 0, y: 0 },
                size: { w: 100, h: 100 },
                rotation: 0,
                scale: { x: 1, y: 1 },
                anchor: { x: 0, y: 0 },
              },
              opacity: 1,
              zIndex: 0,
              assetId: 'ghost-asset',
              fit: 'contain' as const,
              preserveAspect: true,
            },
          ],
        },
      ],
    };
    const issues = exporter.preflight(sceneWithBadImage);
    expect(issues.some((i) => i.severity === 'error' && i.code === 'missing-asset')).toBe(true);
  });
});

describe('ExportService — run', () => {
  it('produces a verifiable .vcg from a minimal scene', async () => {
    const { projects, exporter, tmpDir } = await setup();
    const { scene } = projects.newScene('Empty', 'lower-third');
    const outputPath = path.join(tmpDir, 'out.vcg');
    const result = await exporter.run(scene, outputPath);
    expect(result.path).toBe(outputPath);
    expect(result.sha256).toHaveLength(64);
    expect(result.bytes).toBeGreaterThan(0);

    const buf = await fs.promises.readFile(outputPath);
    const verifyResult = await verify(buf);
    expect(verifyResult.ok).toBe(true);
    const unpacked = await unpack(buf);
    expect(unpacked.scene.id).toBe(scene.id);
  });

  it('emits progress events for every step', async () => {
    const { projects, exporter, tmpDir } = await setup();
    const { scene } = projects.newScene('Empty', 'lower-third');
    const steps: string[] = [];
    exporter.on('progress', (p) => steps.push(p.step));
    await exporter.run(scene, path.join(tmpDir, 'out.vcg'));
    expect(steps).toEqual(['validate', 'manifest', 'assets', 'template', 'pack', 'sign', 'done']);
  });

  it('exports a scene that references a real image asset', async () => {
    const { projects, assets, exporter, tmpDir } = await setup();
    const sourcePath = path.join(tmpDir, 'logo.png');
    await fs.promises.writeFile(sourcePath, 'fake-png-bytes');
    const asset = await assets.import(sourcePath);
    const { scene } = projects.newScene('LT-w-image', 'lower-third');
    const sceneWithImage = {
      ...scene,
      layers: [
        {
          id: 'L1',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal' as const,
          children: [
            {
              id: 'el-1',
              type: 'image' as const,
              name: 'logo',
              visible: true,
              locked: false,
              transform: {
                position: { x: 0, y: 0 },
                size: { w: 100, h: 100 },
                rotation: 0,
                scale: { x: 1, y: 1 },
                anchor: { x: 0, y: 0 },
              },
              opacity: 1,
              zIndex: 0,
              assetId: asset.assetId,
              fit: 'contain' as const,
              preserveAspect: true,
            },
          ],
        },
      ],
    };
    const out = path.join(tmpDir, 'with-image.vcg');
    const result = await exporter.run(sceneWithImage, out);
    expect(result.bytes).toBeGreaterThan(0);
    const verifyResult = await verify(await fs.promises.readFile(out));
    expect(verifyResult.ok).toBe(true);
  });

  it('throws if preflight surfaces an error-severity issue', async () => {
    const { projects, exporter, tmpDir } = await setup();
    const { scene } = projects.newScene('Empty', 'lower-third');
    const badScene = {
      ...scene,
      layers: [
        {
          id: 'L1',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal' as const,
          children: [
            {
              id: 'el-1',
              type: 'image' as const,
              name: 'bg',
              visible: true,
              transform: {
                position: { x: 0, y: 0 },
                size: { w: 100, h: 100 },
                rotation: 0,
                scale: { x: 1, y: 1 },
                anchor: { x: 0, y: 0 },
              },
              opacity: 1,
              blendMode: 'normal' as const,
              assetId: 'ghost',
              fit: 'contain' as const,
              preserveAspect: true,
            },
          ],
        },
      ],
    };
    await expect(exporter.run(badScene, path.join(tmpDir, 'bad.vcg'))).rejects.toThrow(
      /missing-asset/,
    );
  });
});
