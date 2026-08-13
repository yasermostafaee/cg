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

  it('B-129 — the packed scene carries NO editor backdrop', async () => {
    // The artifact side of the split. The guard is the render path's `author`-mode
    // check; this is defence in depth, so the value cannot travel even if a future
    // renderer forgot the mode. Asserted on a scene that DOES carry a backdrop, so a
    // regression cannot hide behind an already-transparent fixture.
    const buf = await pack({
      scene: { ...fixtureScene, editorBackdrop: '#123456' },
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    });
    const { scene } = await unpack(buf);
    expect(scene.editorBackdrop).toBe('transparent');
    // Everything else survives — the stripper is not a general-purpose scrubber.
    expect({ ...scene, editorBackdrop: '#123456' }).toEqual({
      ...fixtureScene,
      editorBackdrop: '#123456',
    });
  });

  it('D-042 — round-trips a per-corner cornerRadius + a stroke on a non-shape element', async () => {
    const baseLayer = fixtureScene.layers[0];
    if (!baseLayer) throw new Error('fixture missing layer 0');
    const children = baseLayer.children.map((c, j) =>
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
      layers: [{ ...baseLayer, children }, ...fixtureScene.layers.slice(1)],
    };
    const buf = await pack({
      scene,
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    });
    const out = (await unpack(buf)).scene;
    const outLayer = out.layers[0];
    const outChild = outLayer?.children[0];
    if (!outChild) throw new Error('unpacked scene missing layer 0 child 0');
    const el = outChild as { cornerRadius?: unknown; stroke?: unknown };
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
  it.each(['contain', 'cover', 'fill', 'none', 'fit-width', 'fit-height'])(
    "D-149 — an image element's fit `%s` survives the .vcg round-trip",
    async (fit) => {
      // Both new modes and every pre-existing one, through the SAME assertion:
      // `fit-width` / `fit-height` are ordinary enum widenings, so a package
      // written with one must unpack to exactly the value that went in — and
      // `none` must NOT drift to the Designer's "original" LABEL.
      const baseLayer = fixtureScene.layers[0];
      if (!baseLayer) throw new Error('fixture missing layer 0');
      const image = {
        id: 'img-1',
        name: 'Logo',
        type: 'image',
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 0,
        transform: {
          position: { x: 10, y: 20 },
          size: { w: 320, h: 180 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0, y: 0 },
        },
        assetId: 'a1',
        source: 'project',
        fit,
        preserveAspect: true,
      } as unknown as Element;
      const scene: Scene = {
        ...fixtureScene,
        layers: [
          { ...baseLayer, children: [...baseLayer.children, image] },
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
      const packed = out.layers[0]?.children.find((c) => c.id === 'img-1') as
        | { fit?: unknown }
        | undefined;
      expect(packed?.fit).toBe(fit);
    },
  );
});

/**
 * ⭐ Task 1.5e — the frame survives the `.vcg` exporter (the other half, the
 * single-file HTML export, is pinned in
 * `packages/single-file-export/tests/exporter-single-file.test.ts`).
 *
 * Not a formality: `pack()` runs `SceneSchema.parse` before writing
 * `template.json`, so an element field that the schema does not know is a hard
 * failure at export rather than a silently dropped property — which is exactly what
 * makes this the assertion worth having on a NEW optional field.
 *
 * Maps `specs/designer-live-source/spec.md`:
 *   - "A Live Source may carry a FRAME, and the frame never enters the hole"
 */
describe('1.5e — a Live Source FRAME round-trips through the `.vcg` exporter', () => {
  const plate = (stroke?: unknown): Element =>
    ({
      id: 'live-a',
      name: 'Guest box',
      type: 'video-placeholder',
      transform: {
        position: { x: 300, y: 200 },
        size: { w: 640, h: 360 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0, y: 0 },
      },
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
      routeKey: 'guest-1',
      ...(stroke !== undefined ? { stroke } : {}),
    }) as unknown as Element;

  const packWith = async (el: Element): Promise<Scene> => {
    const baseLayer = fixtureScene.layers[0];
    if (!baseLayer) throw new Error('fixture missing layer 0');
    const buf = await pack({
      scene: {
        ...fixtureScene,
        layers: [{ ...baseLayer, children: [el] }, ...fixtureScene.layers.slice(1)],
      },
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    });
    return (await unpack(buf)).scene;
  };

  it('carries width, colour and dash through pack → unpack', async () => {
    const out = await packWith(plate({ width: 6, color: '#FF8800', dash: [8, 4] }));
    const el = out.layers[0]?.children[0] as { stroke?: unknown } | undefined;
    expect(el?.stroke).toEqual({ width: 6, color: '#FF8800', dash: [8, 4] });
  });

  it('carries a ZERO width — "no frame" is a stored state, not an absence', async () => {
    // The falsy-zero trap at the artifact boundary: a serializer that treated 0 as
    // "unset" would drop the key, and the plate would reopen at its remembered
    // colour the next time the width went up.
    const out = await packWith(plate({ width: 0, color: '#00FF00' }));
    const el = out.layers[0]?.children[0] as { stroke?: unknown } | undefined;
    expect(el?.stroke).toEqual({ width: 0, color: '#00FF00' });
  });

  it('an UNFRAMED plate round-trips with the key still absent', async () => {
    const out = await packWith(plate());
    const el = out.layers[0]?.children[0] as Record<string, unknown> | undefined;
    expect(el && 'stroke' in el).toBe(false);
  });
});
