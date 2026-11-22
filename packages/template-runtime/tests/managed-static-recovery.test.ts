import {
  CG_MANAGED_BOOK_RESUME_RUNTIME_VERSION,
  CG_MANAGED_SEQUENCE_RESUME_RUNTIME_VERSION,
  CG_MANAGED_STATIC_RESUME_RUNTIME_VERSION,
  SequenceElementSchema,
  managedResumePageCount,
  withPageLists,
  type Scene,
  type SequenceElement,
} from '@cg/shared-schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installCasparGlobals } from '../src/adapters/caspar-globals.js';
import { createRuntime } from '../src/runtime.js';
import { lowerThirdScene } from './fixtures.js';

const state = {
  revision: 1,
  graphicInstanceId: 'test-graphic',
  data: { anchor: 'Studio' },
  page: 0,
  visibility: 'shown',
  resume: true,
  resumeWithoutReplay: true,
};

function sequenceScene(overrides: Partial<SequenceElement> = {}): Scene {
  const scene = structuredClone(lowerThirdScene);
  const layer = scene.layers[0];
  if (layer?.children[1]?.type !== 'text') throw new Error('Fixture has no title.');
  const { font, transform, opacity, locked, zIndex } = layer.children[1];
  layer.children.push(
    SequenceElementSchema.parse({
      id: 'chapters',
      name: 'Chapters',
      type: 'sequence',
      transform,
      visible: true,
      color: '#FFFFFF',
      direction: 'rtl',
      font,
      opacity,
      locked,
      zIndex,
      advance: 'manual',
      repeat: 1,
      transitionIn: 'none',
      transitionOut: 'none',
      items: [
        { id: 'a', text: 'صفحهٔ اول' },
        { id: 'b', text: 'صفحهٔ دوم' },
      ],
      ...overrides,
    }),
  );
  return scene;
}

describe('External CG settled graphic recovery', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.body.innerHTML = '';
    document.body.className = '';
  });

  function boot(scene: Scene = lowerThirdScene) {
    const runtime = createRuntime(scene, { skipFontLoad: true });
    cleanup = installCasparGlobals(runtime);
    return runtime;
  }

  function managedApi() {
    const api = window.apasaiCg;
    if (api === undefined) throw new Error('Fixture has no managed callback.');
    return api;
  }

  it('recovers fields and visibility from the absolute state without running the legacy entrance', async () => {
    const runtime = boot();
    const play = vi.fn();
    const stop = vi.fn();
    runtime.on('play.start', play);
    runtime.on('stop.start', stop);
    const managed = managedApi();
    expect(managed.version).toBe(CG_MANAGED_STATIC_RESUME_RUNTIME_VERSION);
    expect(document.body.classList.contains('cg-pending')).toBe(true);

    await managed.applyState(state);
    expect(document.querySelector('[data-cg-element-id="name"]')?.textContent).toBe('Studio');
    expect(document.body.classList.contains('cg-pending')).toBe(false);

    await managed.applyState({ ...state, revision: 2, visibility: 'stopped', data: {} });
    expect(document.querySelector('[data-cg-element-id="name"]')?.textContent).toBe('سارا نادری');
    expect(document.body.classList.contains('cg-pending')).toBe(true);
    await runtime.play({ anchor: 'Legacy' });
    await runtime.update({ anchor: 'Legacy' });
    expect(document.querySelector('[data-cg-element-id="name"]')?.textContent).toBe('سارا نادری');
    expect(document.body.classList.contains('cg-pending')).toBe(true);
    expect(play).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it('keeps the applied state when a nonzero page or missing asset is requested', async () => {
    const scene = structuredClone(lowerThirdScene);
    const layer = scene.layers[0];
    const source = layer?.children[0];
    if (layer === undefined || source === undefined)
      throw new Error('Fixture has no graphic layer.');
    layer.children.push({
      ...source,
      type: 'image',
      id: 'logo',
      name: 'Logo',
      assetId: 'missing-image',
      fit: 'contain',
      preserveAspect: true,
      source: 'project',
    });
    boot(scene);
    await expect(managedApi().applyState({ ...state, page: 1 })).rejects.toThrow('static page');
    await expect(managedApi().applyState(state)).rejects.toThrow('image is missing');
    expect(document.querySelectorAll('.cg-stage')).toHaveLength(1);
    expect(document.body.classList.contains('cg-pending')).toBe(true);
    expect(document.querySelector('[data-cg-element-id="name"]')?.textContent).not.toBe('Studio');
  });

  it('restores the same fields on a fresh runtime after a Core restart', async () => {
    const runtime = boot();
    await managedApi().applyState(state);
    runtime.remove();
    cleanup?.();
    document.body.className = '';
    boot();
    await managedApi().applyState(state);
    expect(document.querySelector('[data-cg-element-id="name"]')?.textContent).toBe('Studio');
    expect(document.body.classList.contains('cg-pending')).toBe(false);
  });

  it('applies a nonzero absolute sequence page on a cold replica without a legacy Next or entrance', async () => {
    const scene = sequenceScene();
    const runtime = boot(scene);
    const play = vi.fn();
    runtime.on('play.start', play);
    const selectedPage = '[data-cg-element-id="chapters"] [data-cg-sequence-item]';
    expect(managedApi().version).toBe(CG_MANAGED_SEQUENCE_RESUME_RUNTIME_VERSION);
    await managedApi().applyState({ ...state, page: 1 });
    expect(document.querySelector(selectedPage)?.textContent).toBe('صفحهٔ دوم');
    expect(document.querySelector('[data-cg-element-id="name"]')?.textContent).toBe('Studio');
    expect(document.body.classList.contains('cg-pending')).toBe(false);
    await expect(managedApi().applyState({ ...state, page: 2 })).rejects.toThrow('sequence page');
    expect(document.querySelector(selectedPage)?.textContent).toBe('صفحهٔ دوم');

    expect(runtime.next).toBeTypeOf('function');
    await runtime.next?.();
    await managedApi().applyState({ ...state, revision: 2, page: 0, data: {} });
    expect(document.querySelector(selectedPage)?.textContent).toBe('صفحهٔ اول');
    expect(document.querySelector('[data-cg-element-id="name"]')?.textContent).toBe('سارا نادری');
    expect(play).not.toHaveBeenCalled();
  });

  it('resolves the entry in a retained wrapper using its own layers, fields and timing', async () => {
    const pageScene = sequenceScene();
    const entry = {
      id: 'entry',
      name: pageScene.name,
      resolution: { width: 1280, height: 720 },
      frameRange: pageScene.frameRange,
      editorBackdrop: pageScene.editorBackdrop,
      layers: pageScene.layers,
      fields: pageScene.fields,
      bindings: pageScene.bindings,
    };
    const wrapped = {
      ...pageScene,
      layers: [],
      fields: [],
      bindings: [],
      entryCompositionId: entry.id,
      compositions: [entry],
    };
    expect(managedResumePageCount(wrapped)).toBe(2);
    expect(
      managedResumePageCount({
        ...wrapped,
        compositions: [{ ...entry, lifecycle: { outPoint: 15 } }],
      }),
    ).toBeUndefined();

    boot(wrapped);
    await managedApi().applyState({ ...state, page: 1 });
    expect(document.querySelector<HTMLElement>('.cg-stage')?.style.width).toBe('1280px');
    expect(document.querySelector('[data-cg-element-id="chapters"]')?.textContent).toBe(
      'صفحهٔ دوم',
    );
    expect(document.querySelector('[data-cg-element-id="name"]')?.textContent).toBe('Studio');
  });

  it('only accepts authored finite cuts and matching bundled picture lists', async () => {
    expect(managedResumePageCount(sequenceScene({ advance: 'auto' }))).toBeUndefined();
    expect(managedResumePageCount(sequenceScene({ repeat: 'infinite' }))).toBeUndefined();
    expect(managedResumePageCount(sequenceScene({ transitionIn: 'fade' }))).toBeUndefined();
    expect(managedResumePageCount(sequenceScene({ operatorSteps: false }))).toBeUndefined();
    const pictureSequence = sequenceScene({
      items: [
        { id: 'photo-a', kind: 'image', assetId: 'photo1' },
        { id: 'photo-b', kind: 'image', assetId: 'photo2' },
      ],
    });
    expect(managedResumePageCount(pictureSequence)).toBe(2);
    const packaged = withPageLists(pictureSequence);
    expect(managedResumePageCount(packaged)).toBe(2);
    const field = packaged.fields.find(({ type }) => type === 'list');
    if (field?.type !== 'list') throw new Error('Fixture has no book field.');
    const replaced = [{ kind: 'image', id: 'replacement', media: 'a'.repeat(64) }];
    expect(
      managedResumePageCount({
        ...packaged,
        fields: packaged.fields.map((entry) =>
          entry.id === field.id ? { ...field, default: replaced } : entry,
        ),
      }),
    ).toBeUndefined();
    boot(packaged);
    expect(managedApi().version).toBe(CG_MANAGED_BOOK_RESUME_RUNTIME_VERSION);
    await expect(
      managedApi().applyState({ ...state, page: 1, data: { [field.id]: replaced } }),
    ).rejects.toThrow('bundled');
  });

  it('offers no managed callback for scenes whose layers are driven by frame timing', async () => {
    const scene = structuredClone(lowerThirdScene);
    const title = scene.layers[0]?.children[0];
    if (title === undefined) throw new Error('Fixture has no element.');
    title.lifespan = { in: 0, out: 10 };
    const runtime = boot(scene);
    expect(window.apasaiCg).toBeUndefined();
    await runtime.play({ anchor: 'Legacy' });
    expect(document.querySelector('[data-cg-element-id="name"]')?.textContent).toBe('Legacy');
  });

  it('refuses managed snapshot publication once legacy playout has begun', async () => {
    const runtime = boot();
    await runtime.play({ anchor: 'Legacy' });
    await expect(managedApi().applyState(state)).rejects.toThrow('page is unavailable');
    expect(document.querySelector('[data-cg-element-id="name"]')?.textContent).toBe('Legacy');
  });
});
