import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { unpack, verify } from '@cg/vcg-format';
import { AssetService } from '../../src/main/services/AssetService.js';
import { ExportService } from '../../src/main/services/ExportService.js';
import { ProjectService } from '../../src/main/services/ProjectService.js';

/**
 * M6.6 — end-to-end Designer export.
 *
 * Uses the **real** pre-bundled `@cg/template-runtime` payload from
 * `apps/designer/resources/template-runtime/cg.js` (produced by
 * `scripts/bundle-runtime.mjs`, which the test script runs as a
 * pretest step). The result of `ExportService.run()` is a `.vcg` that:
 *
 *   1. passes `verify()` (Merkle integrity)
 *   2. `unpack()`s back to the original scene + a real template runtime
 *   3. contains a cg.js that includes `createRuntime` + `installCasparGlobals`
 *
 * This is the substantive piece that closes the loop the M6.0 channels
 * promised: Designer scene → .vcg the Runtime can play.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');
const BUNDLED_CG_JS_PATH = path.resolve(APP_ROOT, 'resources/template-runtime/cg.js');

let tmp: string | undefined;
afterEach(async () => {
  if (tmp) await fs.promises.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe('Designer end-to-end export', () => {
  it('produces a verifiable .vcg containing the real template-runtime', async () => {
    const cgJs = await fs.promises.readFile(BUNDLED_CG_JS_PATH, 'utf-8');
    expect(cgJs.length).toBeGreaterThan(1000); // sanity: not the stub
    expect(cgJs).toContain('createRuntime');
    expect(cgJs).toContain('installCasparGlobals');

    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-e2e-export-'));
    const projects = new ProjectService({
      recentFilePath: path.join(tmp, 'recent.json'),
      randomId: () => 'scene-e2e',
    });
    const assets = new AssetService({ workingRoot: path.join(tmp, 'working') });
    const exporter = new ExportService({ cgJs, assets });

    const { scene } = projects.newScene('e2e demo', 'lower-third');
    const outputPath = path.join(tmp, 'e2e.vcg');
    const result = await exporter.run(scene, outputPath);

    expect(result.path).toBe(outputPath);
    // .vcg is a deflate-compressed zip; the runtime + manifest + scene
    // routinely fit below the raw cgJs source size. Just check non-empty.
    expect(result.bytes).toBeGreaterThan(0);

    const buf = await fs.promises.readFile(outputPath);
    const verifyResult = await verify(buf);
    expect(verifyResult.ok).toBe(true);

    const unpacked = await unpack(buf);
    expect(unpacked.scene.id).toBe(scene.id);
    expect(unpacked.files.get('cg.js')?.toString('utf-8')).toBe(cgJs);
    const indexHtml = unpacked.files.get('index.html')?.toString('utf-8') ?? '';
    expect(indexHtml).toContain('./cg.js');
    expect(indexHtml).toContain('./template.json');
  });

  it('round-trips a scene with Persian content end-to-end', async () => {
    const cgJs = await fs.promises.readFile(BUNDLED_CG_JS_PATH, 'utf-8');
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-e2e-persian-'));
    const projects = new ProjectService({
      recentFilePath: path.join(tmp, 'recent.json'),
      randomId: () => 'scene-fa',
    });
    const assets = new AssetService({ workingRoot: path.join(tmp, 'working') });
    const exporter = new ExportService({ cgJs, assets });

    const { scene: blank } = projects.newScene('خبر فوری', 'lower-third');
    const scene = {
      ...blank,
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
              type: 'text' as const,
              name: 'title',
              visible: true,
              locked: false,
              zIndex: 0,
              opacity: 1,
              transform: {
                position: { x: 100, y: 100 },
                size: { w: 1000, h: 80 },
                rotation: 0,
                scale: { x: 1, y: 1 },
                anchor: { x: 0, y: 0 },
              },
              text: 'خبر فوری: نتایج انتخابات',
              font: {
                family: 'Vazirmatn',
                weight: 700,
                style: 'normal' as const,
                size: 48,
                lineHeight: 1.15,
                letterSpacing: 0,
              },
              color: '#FFFFFF',
              align: 'start' as const,
              direction: 'rtl' as const,
              fitMode: 'fixed' as const,
              overflow: 'clip' as const,
            },
          ],
        },
      ],
    };
    const outputPath = path.join(tmp, 'persian.vcg');
    await exporter.run(scene, outputPath);

    const unpacked = await unpack(await fs.promises.readFile(outputPath));
    const layerEl = unpacked.scene.layers[0]?.children[0];
    if (layerEl?.type === 'text') {
      expect(layerEl.text).toBe('خبر فوری: نتایج انتخابات');
    } else {
      throw new Error('expected text element');
    }
  });
});
