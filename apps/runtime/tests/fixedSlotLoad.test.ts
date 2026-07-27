import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  importAndLoadOntoFixedSlot,
  loadTemplateOntoFixedSlot,
} from '../src/renderer/features/fixedLayers/fixedSlotLoad.js';
import { buildValidVcg } from './e2e/fixtures/runtime.js';

/**
 * R-021 stage 3 (task 5.3) — the one-action chain, tested as a chain: pick a
 * `.vcg` → the SHARED library import (it stays there for reuse) → an item bound
 * to the EXACT slot → load.
 *
 * The chain runs against a fake `window.cg` rather than the mock bridge because
 * what is under test is the ORDER and the COORDINATE: that the template really
 * is registered before the load, that it is still there afterwards, and that
 * the load carries the row's own slot verbatim — never a layer chosen anywhere
 * else. `fixedLayers.load` is the only channel it may call: reaching
 * `stack.load` would mean the item allocated dynamically, which is the exact
 * failure this task exists to prevent.
 */

const SLOT = { channel: 1, layer: 72 };

interface FakeBridge {
  imported: { templateId: string; templateType: string }[];
  loads: unknown[];
  stackLoads: unknown[];
}

function fakeBridge(): FakeBridge {
  const state: FakeBridge = { imported: [], loads: [], stackLoads: [] };
  const registry = new Map<string, { templateId: string; templateType: string; fields: never[] }>();
  const cg = {
    templates: {
      import: (req: { template: { templateId: string; templateType: string } }) => {
        registry.set(req.template.templateId, { ...req.template, fields: [] });
        state.imported.push(req.template);
        return Promise.resolve({ registered: true, templateId: req.template.templateId });
      },
      get: (req: { templateId: string }) => Promise.resolve(registry.get(req.templateId) ?? null),
      list: () => Promise.resolve([...registry.values()]),
    },
    fixedLayers: {
      load: (req: unknown) => {
        state.loads.push(req);
        return Promise.resolve({ accepted: true });
      },
    },
    // Present ONLY so a stray call would be recorded rather than throwing an
    // error that could be mistaken for something else. It must stay empty.
    stack: {
      load: (req: unknown) => {
        state.stackLoads.push(req);
        return Promise.resolve({ accepted: true });
      },
    },
  };
  (globalThis as unknown as { window: { cg: typeof cg } }).window = { cg };
  return state;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the fixed row’s one-action import+load chain', () => {
  it('imports into the shared library, then loads onto the EXACT slot', async () => {
    const bridge = fakeBridge();
    const bytes = await buildValidVcg('tpl-fixed-chain');
    const file = new File([bytes], 'clock.vcg');

    const result = await importAndLoadOntoFixedSlot(SLOT, () => Promise.resolve(file));

    expect(result.accepted).toBe(true);
    // The template went into the SHARED library — and stays there for reuse.
    expect(bridge.imported.map((t) => t.templateId)).toEqual(['tpl-fixed-chain']);
    expect(await window.cg.templates.list()).toHaveLength(1);
    // One load, on the exact-slot channel, carrying THIS row's coordinate.
    expect(bridge.loads).toHaveLength(1);
    expect(bridge.loads[0]).toMatchObject({
      channel: 1,
      layer: 72,
      templateId: 'tpl-fixed-chain',
    });
    // …and NEVER the dynamic path, which would allocate some other layer.
    expect(bridge.stackLoads).toEqual([]);
  });

  it('a dismissed file picker is the operator’s own “no” — nothing imported, nothing loaded', async () => {
    const bridge = fakeBridge();
    const result = await importAndLoadOntoFixedSlot(SLOT, () => Promise.resolve(null));
    // Not a success (no flash) and not an error (no toast) — the cancelled path.
    expect(result).toEqual({ accepted: false, cancelled: true });
    expect(bridge.imported).toEqual([]);
    expect(bridge.loads).toEqual([]);
  });

  it('a bad package registers nothing and loads nothing — it throws the file’s name', async () => {
    const bridge = fakeBridge();
    const file = new File([new TextEncoder().encode('not a .vcg')], 'broken.vcg');
    await expect(importAndLoadOntoFixedSlot(SLOT, () => Promise.resolve(file))).rejects.toThrow(
      /broken\.vcg/,
    );
    expect(bridge.imported).toEqual([]);
    expect(bridge.loads).toEqual([]);
  });

  it('Load-from-library uses the SAME binding, skipping only the import step', async () => {
    const bridge = fakeBridge();
    await loadTemplateOntoFixedSlot(
      { channel: 2, layer: 75 },
      { templateId: 'tpl-existing', templateType: 'lower-third', fields: [] },
    );
    expect(bridge.imported).toEqual([]);
    expect(bridge.loads).toHaveLength(1);
    expect(bridge.loads[0]).toMatchObject({
      channel: 2,
      layer: 75,
      templateId: 'tpl-existing',
    });
    expect(bridge.stackLoads).toEqual([]);
  });
});
