import { afterEach, describe, expect, it } from 'vitest';
import { unpack } from '@cg/vcg-format';
import type { AssetMeta } from '@cg/shared-ipc';
import type { Scene, SequenceElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { Exporter } from '../src/platform/Exporter.js';
import type { AssetStore } from '../src/platform/AssetStore.js';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultSequence } from '../src/renderer/state/element-defaults.js';

/**
 * `D-163` — a book of pictures in the Designer: the pages a sequence holds, how the first pictures
 * turn it into a book, how a picture-only sequence binds a PAGE LIST, and that the pages travel in
 * the `.vcg`.
 */

afterEach(() => {
  designerStore._reset();
});

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
}

function sequenceOf(id: string): SequenceElement {
  const st = designerStore.get();
  const scene = editSceneOf(st.scene, st.activeCompositionId)!;
  for (const layer of scene.layers) {
    for (const el of layer.children) if (el.id === id && el.type === 'sequence') return el;
  }
  throw new Error(`no sequence ${id}`);
}

const pages = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    assetId: `asset-${String(i + 1)}`,
    name: `page${String(i + 1)}.png`,
  }));

describe('D-163 — adding pictures to a sequence', () => {
  it('🔴 the first pictures REPLACE the untouched samples and make a book', () => {
    freshScene();
    designerStore.addElement(defaultSequence('sq', 0, 0));
    expect(designerStore.addSequencePictures('sq', pages(12))).toBe(12);
    const seq = sequenceOf('sq');
    expect(seq.items).toHaveLength(12);
    expect(seq.items.every((i) => i.kind === 'image')).toBe(true);
    expect(seq.items.map((i) => (i.kind === 'image' ? i.name : ''))).toEqual(
      pages(12).map((p) => p.name),
    );
    // A book CROSSFADES between pages (the owner: a Cut's jump is "not good").
    expect([seq.transitionIn, seq.transitionOut, seq.transitionTiming]).toEqual([
      'fade',
      'fade',
      'simultaneous',
    ]);
    expect(seq.advance).toBe('manual');
    expect(seq.repeat).toBe(1);
  });

  it('an item the author wrote is KEPT, and later pictures change no setting', () => {
    freshScene();
    designerStore.addElement(defaultSequence('sq', 0, 0));
    designerStore.setSequenceItems('sq', [{ id: 'cover', text: 'جلد کتاب' }]);
    designerStore.addSequencePictures('sq', pages(2));
    designerStore.updateElement('sq', { transitionIn: 'right', transitionOut: 'left' } as never);
    designerStore.addSequencePictures('sq', pages(1));
    const seq = sequenceOf('sq');
    expect(seq.items.map((i) => i.id)[0]).toBe('cover');
    expect(seq.items).toHaveLength(4);
    expect(seq.transitionIn).toBe('right'); // not reset by the second batch
  });

  it('🔴 a picture-only sequence takes a Data key and seeds a PAGE LIST', () => {
    freshScene();
    designerStore.addElement(defaultSequence('sq', 0, 0));
    designerStore.addSequencePictures('sq', pages(3));
    expect(designerStore.setElementDataKey('sq', 'book')).toBe(true);
    const st = designerStore.get();
    const doc = editSceneOf(st.scene, st.activeCompositionId)!;
    const field = doc.fields.find((f) => f.id === 'book');
    expect(field?.type).toBe('list');
    expect(field).toMatchObject({ pages: true });
    expect(doc.bindings).toContainEqual({
      fieldId: 'book',
      target: { kind: 'sequence-items', elementId: 'sq' },
    });
  });

  it('a sequence MIXING text and pictures cannot take a Data key', () => {
    freshScene();
    designerStore.addElement(defaultSequence('sq', 0, 0));
    designerStore.setSequenceItems('sq', [{ id: 'cover', text: 'جلد' }]);
    designerStore.addSequencePictures('sq', pages(1));
    expect(designerStore.setElementDataKey('sq', 'book')).toBe(false);
  });

  it('a bound TEXT list that gains pictures loses its binding (it is no longer either surface)', () => {
    freshScene();
    designerStore.addElement(defaultSequence('sq', 0, 0));
    designerStore.setSequenceItems('sq', [{ id: 'a', text: 'متن' }]);
    expect(designerStore.setElementDataKey('sq', 'rundown')).toBe(true);
    designerStore.addSequencePictures('sq', pages(1));
    const st = designerStore.get();
    const doc = editSceneOf(st.scene, st.activeCompositionId)!;
    expect(doc.fields.some((f) => f.id === 'rundown')).toBe(false);
  });
});

describe('D-163 — the pages travel in the .vcg', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const meta = (i: number): AssetMeta => ({
    assetId: `asset-${String(i)}`,
    kind: 'image',
    filename: `page${String(i)}.png`,
    sha256: String(i).repeat(64).slice(0, 64),
    byteSize: PNG.byteLength,
    workingPath: `projects/p/assets/image/${String(i)}.png`,
  });
  const assets = {
    list: async () => [meta(1), meta(2)],
    get: async (id: string) => [meta(1), meta(2)].find((m) => m.assetId === id) ?? null,
    bytes: async () => PNG,
  } as unknown as AssetStore;

  it('🔴 a picture sequence round-trips: items, fit, and every page’s asset in the package', async () => {
    const seq = {
      ...defaultSequence('sq', 0, 0),
      items: [
        { kind: 'image', id: 'p1', assetId: 'asset-1', name: 'page1.png' },
        { kind: 'image', id: 'p2', assetId: 'asset-2', name: 'page2.png' },
      ],
      imageFit: 'cover',
    };
    const scene = {
      schemaVersion: 1,
      id: 's-book',
      name: 'Book',
      templateType: 'custom',
      resolution: { width: 1920, height: 1080 },
      frameRate: 50,
      safeAreas: { title: 10, action: 5 },
      frameRange: { in: 0, out: 50 },
      editorBackdrop: 'transparent',
      layers: [
        {
          id: 'L1',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [seq],
        },
      ],
      compositions: [],
      fields: [],
      bindings: [],
      fonts: [],
      metadata: { createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z' },
    } as unknown as Scene;
    const exporter = new Exporter({
      assets,
      cgJs: 'export const createRuntime = () => ({ ready: Promise.resolve() }); export const installCasparGlobals = () => {};',
      cgCss: 'html{background:transparent}',
    });
    const { vcg } = await exporter.produce(scene);
    const { scene: back, manifest } = await unpack(vcg);
    const backSeq = back.layers[0]!.children[0] as SequenceElement;
    expect(backSeq.items).toEqual(seq.items);
    expect(backSeq.imageFit).toBe('cover');
    expect(manifest.assetIndex.map((e) => e.id).sort()).toEqual(['asset-1', 'asset-2']);
  });
});
