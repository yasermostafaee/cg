import { describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { pack } from '../src/pack.js';
import { unpack } from '../src/unpack.js';
import { verify } from '../src/verify.js';
import { buildTemplateLiveSources } from '../src/live-sources.js';
import { readZip } from '../src/zip.js';
import {
  fixtureCgCss,
  fixtureCgJs,
  fixtureIndexHtml,
  fixtureManifestExtras,
  fixtureScene,
} from './fixtures.js';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);

/** `B-188` helpers — a plate, a full-frame look composition, and its root instance. */
const elBase = { opacity: 1, visible: true, locked: false, zIndex: 0 };
const xf = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});
const box = (id: string, routeKey: string, x: number, y: number): Element =>
  ({
    ...elBase,
    id,
    name: id,
    type: 'video-placeholder',
    transform: xf(x, y, 640, 360),
    routeKey,
  }) as unknown as Element;
const inst = (id: string, compositionId: string): Element =>
  ({
    ...elBase,
    id,
    name: id,
    type: 'composition',
    compositionId,
    transform: xf(0, 0, 1920, 1080),
  }) as unknown as Element;
const lookComp = (id: string, children: Element[]) => ({
  id,
  name: id,
  resolution: { width: 1920, height: 1080 },
  frameRange: { in: 0, out: 50 },
  editorBackdrop: 'transparent',
  layers: [
    { id: `${id}-l`, name: 'l', visible: true, locked: false, blendMode: 'normal', children },
  ],
  fields: [],
  bindings: [],
});

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

/**
 * TEXT-FILE-OPT-01 — the authored file-source grant survives the `.vcg` exporter.
 *
 * Worth pinning for the reason stated above `1.5e`: `pack()` runs `SceneSchema.parse`
 * before writing `template.json`, so a field key the schema does not know is DROPPED
 * silently at export. The grant is an authored decision that must reach the operator's
 * Inspector on another machine — a drop here would look exactly like "the author never
 * ticked the box".
 */
describe('the authored file-source grant round-trips through the `.vcg` exporter', () => {
  const packWithFields = async (fields: Scene['fields']): Promise<Scene> => {
    const buf = await pack({
      scene: { ...fixtureScene, fields },
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    });
    return (await unpack(buf)).scene;
  };

  it('carries the grant on a granted multiline field', async () => {
    const out = await packWithFields([
      {
        id: 'crawl',
        label: 'Crawl',
        required: false,
        type: 'multiline',
        default: '',
        allowFileSource: true,
      },
    ]);
    expect(out.fields[0]).toMatchObject({ id: 'crawl', allowFileSource: true });
  });

  it('an UN-granted field round-trips with the key still ABSENT — absent is the OFF default', async () => {
    const out = await packWithFields([
      { id: 'headline', label: 'Headline', required: false, type: 'text', default: '' },
    ]);
    const f = out.fields[0] as Record<string, unknown> | undefined;
    expect(f && 'allowFileSource' in f).toBe(false);
  });

  it('carries the grant on a granted LIST field, beside its items', async () => {
    const out = await packWithFields([
      {
        id: 'items',
        label: 'Items',
        required: false,
        type: 'list',
        default: [{ id: 'i1', text: 'یک' }],
        allowFileSource: true,
      },
    ]);
    expect(out.fields[0]).toMatchObject({ id: 'items', allowFileSource: true });
    expect((out.fields[0] as { default: unknown }).default).toEqual([{ id: 'i1', text: 'یک' }]);
  });
});

/**
 * 🔴 **`B-188` — A `.vcg` EXPORTED BEFORE THE DECLARATION WAS DELETED STILL OPENS.**
 *
 * `LookGroupSchema.sources` is gone. The owner's question, and it is the right one to ask of a
 * format change while the plant is running builds: does an existing package still load, get
 * ignored, or get REJECTED?
 *
 * 🔴 **The fixture is a GENUINE legacy archive, not a simulated one, and that is what makes this
 * test worth having.** `pack` serialises the INPUT object (`pack.ts`, `withoutEditorBackdrop(
 * input.scene)`) rather than the parsed one, so packing a scene that still carries `sources`
 * writes the field into `template.json` AND hashes it. The bytes are indistinguishable from an
 * old export, and the integrity block is self-consistent — so `verify()` is exercised for real
 * rather than reasoned about. CG Control's import runs `verify` and THEN `unpack`
 * (`templateDelivery.ts`), and this test runs them in that order for that reason.
 */
describe('B-188 — a legacy `.vcg` carrying `lookGroups[].sources`', () => {
  /** `guest-9` is deliberately NOT in the declared list: the old export-blocking case. */
  const legacyGroup = {
    id: 'g1',
    sources: [
      { routeKey: 'l1', dynamic: false, expectedAspect: 1.7777777777777777 },
      { routeKey: 'l2', dynamic: true },
      { routeKey: 'never-placed', dynamic: false },
    ],
    looks: [
      { id: 'look-a', name: 'look-a', instanceId: 'inst-a', entered: { mode: 'cut' } },
      { id: 'look-b', name: 'look-b', instanceId: 'inst-b', entered: { mode: 'cut' } },
    ],
    defaultLookId: 'look-a',
  };

  const legacyScene = (): Scene =>
    ({
      ...fixtureScene,
      layers: [
        {
          id: 'L1',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [inst('inst-a', 'comp-a'), inst('inst-b', 'comp-b')],
        },
      ],
      compositions: [
        lookComp('comp-a', [box('a1', 'l1', 0, 0), box('a2', 'l2', 900, 0)]),
        lookComp('comp-b', [box('b1', 'guest-9', 320, 180)]),
      ],
      lookGroups: [legacyGroup],
    }) as unknown as Scene;

  const packLegacy = async (): Promise<Uint8Array> =>
    pack({
      scene: legacyScene(),
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    });

  it('🔴 the archive really does carry the retired field — the control for every assertion below', async () => {
    const onDisk = JSON.parse(
      dec((await readZip(await packLegacy())).get('template.json') as Uint8Array),
    ) as { lookGroups: { sources?: unknown[] }[] };
    // Without this the rest of the describe would be asserting that a field nobody wrote is
    // absent, which is true of any file and proves nothing.
    expect(onDisk.lookGroups[0]?.sources).toHaveLength(3);
  });

  it('🔴 it VERIFIES and OPENS — not rejected, and the field is STRIPPED rather than migrated', async () => {
    const buf = await packLegacy();
    const v = await verify(buf);
    expect(v.ok).toBe(true);

    const { scene } = await unpack(buf);
    expect('sources' in (scene.lookGroups?.[0] ?? {})).toBe(false);
    // Everything else about the group survives untouched.
    expect(scene.lookGroups?.[0]?.looks.map((l) => l.id)).toEqual(['look-a', 'look-b']);
    expect(scene.lookGroups?.[0]?.defaultLookId).toBe('look-a');
  });

  it('🔴 the operator gets the DERIVED list, including the plate the file never declared', async () => {
    const { scene } = await unpack(await packLegacy());
    const carrier = buildTemplateLiveSources(scene);
    // The file declared `l1, l2, never-placed`. `guest-9` was an export-blocking error and
    // `never-placed` was dropped at export even then, so what the operator sees CHANGES by
    // exactly one entry — the plate that was previously refused.
    expect(carrier.sources.map((d) => d.sourceId)).toEqual(['l1', 'l2', 'guest-9']);
    expect(carrier.looks?.map((l) => Object.keys(l.rects))).toEqual([['l1', 'l2'], ['guest-9']]);
  });

  it('⚠ `dynamic` is RE-DERIVED, so a hand-written `true` in the file does not survive', async () => {
    const { scene } = await unpack(await packLegacy());
    const l2 = buildTemplateLiveSources(scene).sources.find((d) => d.sourceId === 'l2');
    // The file says `dynamic: true` for `l2`. It comes from the FILL field bindings now, and
    // this scene has none. Recorded rather than hidden: it is the one value a re-import
    // changes. It costs nothing today — `dynamic` has no reader anywhere downstream, and
    // `addLookSource` only ever wrote `false`, so a stored `true` was never product-written.
    expect(l2?.dynamic).toBe(false);
  });
});
