import { describe, expect, it } from 'vitest';
import { pack } from '../src/pack.js';
import { unpack } from '../src/unpack.js';
import { verify } from '../src/verify.js';
import {
  fixtureCgCss,
  fixtureCgJs,
  fixtureIndexHtml,
  fixtureManifestExtras,
  fixtureScene,
} from './fixtures.js';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('pack → unpack round-trip', () => {
  it('preserves Scene identity and field values', async () => {
    const buf = await pack({
      scene: fixtureScene,
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    });
    const { scene } = await unpack(buf);
    expect(scene).toEqual(fixtureScene);
  });

  it('preserves text content with Persian characters', async () => {
    const buf = await pack({
      scene: fixtureScene,
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    });
    const { scene } = await unpack(buf);
    const field = scene.fields[0];
    expect(field?.type).toBe('text');
    if (field?.type === 'text') expect(field.default).toBe('سارا نادری');
  });

  it('is byte-identical across two re-packs (determinism)', async () => {
    const input = {
      scene: fixtureScene,
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    };
    const a = await pack(input);
    const b = await pack(input);
    expect(a).toEqual(b);
  });

  it('verify() passes on a freshly-packed archive', async () => {
    const buf = await pack({
      scene: fixtureScene,
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    });
    const result = await verify(buf);
    expect(result.ok).toBe(true);
  });

  it('packs and unpacks with assets and fonts', async () => {
    const buf = await pack({
      scene: fixtureScene,
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
      assets: new Map([['assets/img/logo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47])]]),
      fonts: new Map([['fonts/Vazirmatn-Variable.woff2', enc('font-bytes')]]),
    });
    const { files } = await unpack(buf);
    expect(files.has('assets/img/logo.png')).toBe(true);
    expect(files.has('fonts/Vazirmatn-Variable.woff2')).toBe(true);
    const result = await verify(buf);
    expect(result.ok).toBe(true);
  });
});
