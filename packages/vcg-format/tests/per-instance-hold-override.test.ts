import { describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { pack } from '../src/pack.js';
import { unpack } from '../src/unpack.js';
import {
  fixtureCgCss,
  fixtureCgJs,
  fixtureIndexHtml,
  fixtureManifestExtras,
  fixtureScene,
} from './fixtures.js';

/**
 * D-112 — a composition-instance element's optional `holdOverrides` (per-instance hold overrides)
 * must survive the `.vcg` round-trip. Zod strips unknown fields on `unpack`, so this guards that
 * the schema actually carries the field (single-file HTML inlines the same scene JSON, covered by
 * apps/designer/tests/exporter-single-file.test.ts).
 */
describe('D-112 — per-instance holdOverrides round-trip', () => {
  it('round-trips holdOverrides on a composition instance through pack → unpack', async () => {
    const baseLayer = fixtureScene.layers[0];
    if (!baseLayer) throw new Error('fixture missing layer 0');
    const instanceEl = {
      id: 'inst-1',
      name: 'nested',
      type: 'composition',
      compositionId: 'child-comp',
      transform: {
        position: { x: 0, y: 0 },
        size: { w: 100, h: 100 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0, y: 0 },
      },
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 9,
      // Both directions: exclude a (would-be) driver and force-include another.
      holdOverrides: { 'seq-1': false, 'tk-1': true },
    } as unknown as Element;
    const scene: Scene = {
      ...fixtureScene,
      layers: [
        { ...baseLayer, children: [...baseLayer.children, instanceEl] },
        ...fixtureScene.layers.slice(1),
      ],
    };

    const buf = await pack({
      scene,
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    });
    const out = (await unpack(buf)).scene;
    const outInst = out.layers[0]?.children.find((c) => c.id === 'inst-1');
    if (!outInst) throw new Error('unpacked scene missing the composition instance');
    expect((outInst as { holdOverrides?: unknown }).holdOverrides).toEqual({
      'seq-1': false,
      'tk-1': true,
    });
  });

  it('a composition instance WITHOUT holdOverrides round-trips unchanged (backward compatible)', async () => {
    const baseLayer = fixtureScene.layers[0];
    if (!baseLayer) throw new Error('fixture missing layer 0');
    const instanceEl = {
      id: 'inst-plain',
      name: 'nested-plain',
      type: 'composition',
      compositionId: 'child-comp',
      transform: {
        position: { x: 0, y: 0 },
        size: { w: 100, h: 100 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0, y: 0 },
      },
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 9,
    } as unknown as Element;
    const scene: Scene = {
      ...fixtureScene,
      layers: [
        { ...baseLayer, children: [...baseLayer.children, instanceEl] },
        ...fixtureScene.layers.slice(1),
      ],
    };

    const buf = await pack({
      scene,
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    });
    const out = (await unpack(buf)).scene;
    const outInst = out.layers[0]?.children.find((c) => c.id === 'inst-plain');
    if (!outInst) throw new Error('unpacked scene missing the plain composition instance');
    expect((outInst as { holdOverrides?: unknown }).holdOverrides).toBeUndefined();
  });
});
