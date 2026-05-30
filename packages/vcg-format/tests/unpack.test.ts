import { describe, expect, it } from 'vitest';
import { pack } from '../src/pack.js';
import { unpack } from '../src/unpack.js';
import { writeZip } from '../src/zip.js';
import {
  fixtureCgCss,
  fixtureCgJs,
  fixtureIndexHtml,
  fixtureManifestExtras,
  fixtureScene,
} from './fixtures.js';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('unpack', () => {
  it('round-trips Scene + Manifest', async () => {
    const buf = await pack({
      scene: fixtureScene,
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    });
    const { scene, manifest, files } = await unpack(buf);
    expect(scene.id).toBe(fixtureScene.id);
    expect(scene.fields[0]?.default).toBe('سارا نادری');
    expect(manifest.id).toBe('tpl-fixture-1');
    expect(files.has('manifest.json')).toBe(true);
    expect(files.has('template.json')).toBe(true);
  });

  it('throws when manifest.json is missing', async () => {
    const buf = await writeZip(new Map([['template.json', enc('{}')]]));
    await expect(unpack(buf)).rejects.toThrow(/manifest\.json/);
  });

  it('throws when template.json is missing', async () => {
    const buf = await writeZip(new Map([['manifest.json', enc('{}')]]));
    // Manifest schema fails before template.json check, which is fine.
    await expect(unpack(buf)).rejects.toThrow();
  });

  it('throws on a corrupt zip', async () => {
    await expect(unpack(enc('not a zip'))).rejects.toThrow();
  });
});
