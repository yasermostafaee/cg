import { CG_MANAGED_STATIC_RESUME_RUNTIME_VERSION, type Scene } from '@cg/shared-schema';
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

describe('External CG static graphic recovery', () => {
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
