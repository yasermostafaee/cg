import { describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
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

  it('D-042 — round-trips a per-corner cornerRadius + a stroke on a non-shape element', async () => {
    const children = fixtureScene.layers[0]!.children.map((c, j) =>
      j === 0
        ? ({
            ...c,
            cornerRadius: [4, 8, 12, 16],
            stroke: { width: 3, color: '#00FF00' },
          } as Element)
        : c,
    );
    const scene: Scene = {
      ...fixtureScene,
      layers: [{ ...fixtureScene.layers[0]!, children }, ...fixtureScene.layers.slice(1)],
    };
    const buf = await pack({
      scene,
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    });
    const out = (await unpack(buf)).scene;
    const el = out.layers[0]!.children[0]! as { cornerRadius?: unknown; stroke?: unknown };
    expect(el.cornerRadius).toEqual([4, 8, 12, 16]);
    expect(el.stroke).toEqual({ width: 3, color: '#00FF00' });
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
