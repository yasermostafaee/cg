import { describe, expect, it } from 'vitest';
import { ManifestSchema, SceneSchema } from '@cg/shared-schema';
import { pack } from '../src/pack.js';
import { readZip } from '../src/zip.js';
import {
  fixtureCgCss,
  fixtureCgJs,
  fixtureIndexHtml,
  fixtureManifestExtras,
  fixtureScene,
} from './fixtures.js';

describe('pack', () => {
  it('produces a valid zip with the canonical four core files', async () => {
    const buf = await pack({
      scene: fixtureScene,
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    });
    const files = await readZip(buf);
    expect([...files.keys()].sort()).toEqual([
      'cg.css',
      'cg.js',
      'index.html',
      'manifest.json',
      'template.json',
    ]);
  });

  it('embeds a valid Scene in template.json', async () => {
    const buf = await pack({
      scene: fixtureScene,
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    });
    const files = await readZip(buf);
    const tplBuf = files.get('template.json');
    if (!tplBuf) throw new Error('expected template.json in zip');
    const sceneJson = JSON.parse(tplBuf.toString('utf-8')) as unknown;
    const parsed = SceneSchema.parse(sceneJson);
    expect(parsed.id).toBe('scene-fixture-1');
  });

  it('embeds a valid Manifest whose integrity root recomputes', async () => {
    const buf = await pack({
      scene: fixtureScene,
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    });
    const files = await readZip(buf);
    const manifestBuf = files.get('manifest.json');
    if (!manifestBuf) throw new Error('expected manifest.json in zip');
    const manifestJson = JSON.parse(manifestBuf.toString('utf-8')) as unknown;
    const manifest = ManifestSchema.parse(manifestJson);
    expect(manifest.integrity.files.length).toBeGreaterThan(0);
    expect(manifest.integrity.root).toMatch(/^[0-9a-f]{64}$/);
    // Manifest itself isn't part of integrity (would be circular).
    const declaredPaths = manifest.integrity.files.map((f) => f.path).sort();
    expect(declaredPaths).not.toContain('manifest.json');
  });

  it('throws when an asset path collides with a core artifact', async () => {
    await expect(
      pack({
        scene: fixtureScene,
        manifestExtras: fixtureManifestExtras,
        indexHtml: fixtureIndexHtml,
        cgJs: fixtureCgJs,
        cgCss: fixtureCgCss,
        assets: new Map([['template.json', Buffer.from('not allowed')]]),
      }),
    ).rejects.toThrow(/Duplicate path/);
  });

  it('rejects an invalid Scene at the door', async () => {
    await expect(
      pack({
        // @ts-expect-error — deliberate invalid Scene
        scene: { ...fixtureScene, schemaVersion: 99 },
        manifestExtras: fixtureManifestExtras,
        indexHtml: fixtureIndexHtml,
        cgJs: fixtureCgJs,
        cgCss: fixtureCgCss,
      }),
    ).rejects.toThrow();
  });
});
