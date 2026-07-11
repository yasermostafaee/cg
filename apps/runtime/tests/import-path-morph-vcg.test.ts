import { describe, expect, it } from 'vitest';
import { pack } from '@cg/vcg-format';
import type { AnchorPoint, Manifest, Scene } from '@cg/shared-schema';
import type { AssetEntry, FontReference } from '@cg/shared-schema';
import { produceTemplateDelivery } from '../src/renderer/features/library/templateDelivery.js';

/**
 * D-110 cross-app boundary regression (owner-reported 2026-07-11): a Designer
 * exported `.vcg` carrying a path-morph track (`'path'` animatable property +
 * `{ kind: 'path', points }` keyframe values) was REJECTED by the runtime app's
 * import ("could not be unpacked: … received 'path'" against the pre-D-110
 * animatable-property enum) because the runtime validated against a stale
 * schema build. The Designer's own round-trip tests never crossed this
 * boundary — this test drives the RUNTIME's real import path
 * (`produceTemplateDelivery` = `verify` → `unpack` → single-file render) with a
 * `pack()`-built morph package, so ANY schema drift between the apps (a new
 * animatable property, a new keyframe-value variant) fails HERE, loudly, at the
 * boundary the operator actually crosses.
 */

const corner = (id: string, x: number, y: number): AnchorPoint => ({ id, x, y, smooth: false });

function morphScene(): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-path-morph-1',
    name: 'morph-import',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [
      {
        id: 'layer-1',
        name: 'Content',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            id: 'el-path',
            name: 'Morph',
            type: 'path',
            transform: {
              position: { x: 100, y: 100 },
              size: { w: 100, h: 80 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              anchor: { x: 0, y: 0 },
            },
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 0,
            closed: true,
            points: [corner('a', 0, 0), corner('b', 100, 0), corner('c', 100, 80)],
            fill: { kind: 'solid', color: '#22C55E' },
            stroke: { width: 2, color: '#101010' },
            animation: {
              tracks: {
                path: {
                  keyframes: [
                    {
                      id: 'k1',
                      frame: 0,
                      value: {
                        kind: 'path',
                        points: [corner('a', 0, 0), corner('b', 100, 0), corner('c', 100, 80)],
                      },
                      easing: 'ease-in-out',
                    },
                    {
                      id: 'k2',
                      frame: 40,
                      value: {
                        kind: 'path',
                        points: [
                          corner('a', 0, 20),
                          { id: 'b', x: 160, y: 0, smooth: true, out: { x: 20, y: 10 } },
                          corner('c', 60, 80),
                        ],
                      },
                      easing: 'linear',
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-07-11T00:00:00.000Z', updatedAt: '2026-07-11T00:00:00.000Z' },
  } as unknown as Scene;
}

/** A verifiable `.vcg` carrying the morph scene — the same `pack()` the Designer's Exporter uses. */
async function buildMorphVcg(): Promise<Uint8Array> {
  const fontDeps: readonly FontReference[] = [];
  const assetIndex: readonly AssetEntry[] = [];
  const manifestExtras = {
    id: 'tpl-path-morph-1',
    name: 'morph-import',
    authoring: {
      designerVersion: '0.0.0',
      createdAt: '2026-07-11T00:00:00.000Z',
      exportedAt: '2026-07-11T00:01:00.000Z',
    },
    compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
    fontDeps,
    assetIndex,
  } satisfies Pick<Manifest, 'id' | 'name' | 'authoring' | 'compatibility'> & {
    fontDeps: readonly FontReference[];
    assetIndex: readonly AssetEntry[];
  };
  return pack({
    scene: morphScene(),
    manifestExtras,
    indexHtml: '<!doctype html><html><body>placeholder</body></html>',
    cgJs: '/* placeholder template runtime */',
    cgCss: '/* placeholder template styles */',
    assets: new Map(),
  });
}

describe('runtime import — a Designer path-morph .vcg crosses the boundary (D-110)', () => {
  it('verify → unpack → render accepts the path track and preserves it verbatim', async () => {
    const bytes = await buildMorphVcg();
    const delivery = await produceTemplateDelivery(bytes);
    expect(delivery.template.templateId).toBe('tpl-path-morph-1');
    // The rendered single-file HTML embeds the scene verbatim — the path track,
    // its snapshot values, and the anchor ids all survive to the playout side.
    expect(delivery.html).toContain('"path"');
    expect(delivery.html).toContain('"kind":"path"');
    expect(delivery.html).toContain('"ease-in-out"');
    const anchorIds = ['"a"', '"b"', '"c"'];
    for (const id of anchorIds) expect(delivery.html).toContain(id);
  });

  it('the morph track survives unpack round-trip exactly (ids, frames, handles)', async () => {
    const { unpack } = await import('@cg/vcg-format');
    const bytes = await buildMorphVcg();
    const { scene } = await unpack(bytes);
    const el = scene.layers[0]?.children[0];
    if (el?.type !== 'path') throw new Error('expected the path element');
    const track = el.animation?.tracks['path'];
    expect(track?.keyframes.map((k) => k.frame)).toEqual([0, 40]);
    const v = track?.keyframes[1]?.value;
    if (typeof v !== 'object' || v === null || !('points' in v)) {
      throw new Error('expected a path snapshot value');
    }
    expect(v.points.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(v.points[1]).toMatchObject({ x: 160, smooth: true, out: { x: 20, y: 10 } });
  });
});
