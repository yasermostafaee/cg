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

/**
 * 🔴 `B-353` — **EVERY ORDER OF CLICKS ENDS IN A PAGE LIST.** The owner's `telavat2.vcg` reached CG
 * Control with a Data key and no `pages` mark. Each case below is one order an author can work in; the
 * rule is the one in `@cg/shared-schema` (`isPageListField`): a list bound to a sequence's items is a
 * page list exactly when every item is a picture.
 */
describe('🔴 B-353 — a picture sequence’s Data key is a page list, whatever the order', () => {
  function keyField(id: string) {
    const st = designerStore.get();
    return editSceneOf(st.scene, st.activeCompositionId)!.fields.find((f) => f.id === id);
  }
  function book(): void {
    freshScene();
    designerStore.addElement(defaultSequence('sq', 0, 0));
  }

  it('key set BEFORE `Add folder…`: the samples are replaced and the key is KEPT, as a page list', () => {
    book();
    expect(designerStore.setElementDataKey('sq', 'a1')).toBe(true);
    expect(keyField('a1')).not.toHaveProperty('pages'); // three text samples: a text list
    designerStore.addSequencePictures('sq', pages(3));
    expect(keyField('a1')).toMatchObject({ pages: true, default: sequenceOf('sq').items });
  });

  it('key set AFTER the pictures, then "Allow file source" ticked: still a page list', () => {
    book();
    designerStore.addSequencePictures('sq', pages(3));
    designerStore.setElementDataKey('sq', 'a1');
    designerStore.setElementFieldMeta('sq', { allowFileSource: true });
    // telavat2's `a1`, exactly — and now with its mark.
    expect(keyField('a1')).toMatchObject({ allowFileSource: true, pages: true });
  });

  it('Title, Description, Required and Digits edits keep the mark', () => {
    book();
    designerStore.addSequencePictures('sq', pages(2));
    designerStore.setElementDataKey('sq', 'a1');
    designerStore.setElementFieldMeta('sq', { title: 'کتاب' });
    designerStore.setElementFieldMeta('sq', { description: 'صفحات' });
    designerStore.setElementFieldMeta('sq', { required: true });
    designerStore.setElementFieldMeta('sq', { digits: 'latin' });
    expect(keyField('a1')).toMatchObject({ label: 'کتاب', required: true, pages: true });
  });

  it('`Manage pages…` edits after the key (remove, reorder) keep the mark and the pages in step', () => {
    book();
    designerStore.addSequencePictures('sq', pages(3));
    designerStore.setElementDataKey('sq', 'a1');
    const [p1, p2, p3] = sequenceOf('sq').items;
    designerStore.setSequenceItems('sq', [p3!, p1!] as never);
    expect(keyField('a1')).toMatchObject({ pages: true });
    expect((keyField('a1') as { default: { id: string }[] }).default.map((i) => i.id)).toEqual([
      p3!.id,
      p1!.id,
    ]);
    expect(p2).toBeDefined();
  });

  it('changing Advance changes nothing about the key', () => {
    book();
    designerStore.addSequencePictures('sq', pages(2));
    designerStore.setElementDataKey('sq', 'a1');
    designerStore.updateElement('sq', { advance: 'auto' } as never);
    expect(keyField('a1')).toMatchObject({ pages: true });
  });

  it('an ORPHANED list re-adopted by a picture sequence becomes its page list, with its pages', () => {
    book();
    designerStore.addField({
      id: 'a1',
      label: 'a1',
      required: false,
      type: 'list',
      default: [{ id: 'old', text: 'متن' }],
    });
    designerStore.addSequencePictures('sq', pages(2));
    expect(designerStore.setElementDataKey('sq', 'a1')).toBe(true);
    expect(keyField('a1')).toMatchObject({ pages: true, default: sequenceOf('sq').items });
  });

  it('a list bound FROM THE CANVAS to a picture sequence becomes its page list, with its pages', () => {
    book();
    designerStore.addSequencePictures('sq', pages(2));
    designerStore.addField({ id: 'a1', label: 'a1', required: false, type: 'list', default: [] });
    designerStore.addBinding({
      fieldId: 'a1',
      target: { kind: 'sequence-items', elementId: 'sq' },
    });
    expect(keyField('a1')).toMatchObject({ pages: true, default: sequenceOf('sq').items });
  });

  it('pictures replaced by text: the key is kept and is a text list again', () => {
    book();
    designerStore.addSequencePictures('sq', pages(2));
    designerStore.setElementDataKey('sq', 'a1');
    designerStore.setSequenceItems('sq', [{ id: 't', text: 'خبر' }]);
    expect(keyField('a1')).toEqual(
      expect.objectContaining({ type: 'list', default: [{ id: 't', text: 'خبر' }] }),
    );
    expect(keyField('a1')).not.toHaveProperty('pages');
  });

  it('an old project re-opened with telavat2’s field gets its mark back, and opens clean', () => {
    freshScene();
    const st = designerStore.get();
    const compId = st.activeCompositionId!;
    const seq = {
      ...defaultSequence('sq', 0, 0),
      items: [{ kind: 'image', id: 'p1', assetId: 'a' }],
    };
    const broken = {
      ...st.scene!,
      compositions: st.scene!.compositions!.map((c) =>
        c.id !== compId
          ? c
          : {
              ...c,
              layers: [{ ...c.layers[0]!, children: [seq] }],
              fields: [
                {
                  id: 'a1',
                  label: 'a1',
                  required: false,
                  type: 'list',
                  default: seq.items,
                  digits: 'persian',
                  allowFileSource: true,
                },
              ],
              bindings: [{ fieldId: 'a1', target: { kind: 'sequence-items', elementId: 'sq' } }],
            },
      ),
    } as unknown as Scene;
    designerStore.setScene(broken, null);
    expect(keyField('a1')).toMatchObject({ pages: true });
    expect(designerStore.get().dirty).toBe(false);
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

  /** The package `produce` writes for `scene`, unpacked. */
  async function exported(scene: Scene): Promise<Scene> {
    const exporter = new Exporter({
      assets,
      cgJs: 'export const createRuntime = () => ({ ready: Promise.resolve() }); export const installCasparGlobals = () => {};',
      cgCss: 'html{background:transparent}',
    });
    return (await unpack((await exporter.produce(scene)).vcg)).scene;
  }

  function bookScene(fields: unknown[], bindings: unknown[]): Scene {
    const seq = {
      ...defaultSequence('sq', 0, 0),
      items: [
        { kind: 'image', id: 'p1', assetId: 'asset-1', name: 'page1.png' },
        { kind: 'image', id: 'p2', assetId: 'asset-2', name: 'page2.png' },
      ],
    };
    return {
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
      fields,
      bindings,
      fonts: [],
      metadata: { createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z' },
    } as unknown as Scene;
  }

  it('🔴 B-353 (BOOK-EXPORT Q2) — a book with NO Data key exports with a page list of its own', async () => {
    const back = await exported(bookScene([], []));
    expect(back.fields).toEqual([
      expect.objectContaining({
        id: 'pages-sq',
        label: 'Sequence',
        type: 'list',
        pages: true,
      }),
    ]);
    expect(back.bindings).toEqual([
      { fieldId: 'pages-sq', target: { kind: 'sequence-items', elementId: 'sq' } },
    ]);
  });

  it('🔴 B-353 — a key that lost its mark (telavat2’s `a1`) is exported marked', async () => {
    const a1 = {
      id: 'a1',
      label: 'a1',
      required: false,
      type: 'list',
      default: [
        { kind: 'image', id: 'p1', assetId: 'asset-1', name: 'page1.png' },
        { kind: 'image', id: 'p2', assetId: 'asset-2', name: 'page2.png' },
      ],
      digits: 'persian',
      allowFileSource: true,
    };
    const back = await exported(
      bookScene([a1], [{ fieldId: 'a1', target: { kind: 'sequence-items', elementId: 'sq' } }]),
    );
    expect(back.fields).toEqual([{ ...a1, pages: true }]);
  });
});
