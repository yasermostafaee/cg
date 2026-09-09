import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  importVcgToStation,
  loadTemplateOntoFixedSlot,
} from '../src/renderer/features/fixedLayers/fixedSlotLoad.js';
import { buildValidVcg } from './e2e/fixtures/runtime.js';

/**
 * R-021 stage 3 (task 5.3) — the load path, tested as the two steps it now is.
 *
 * 🔴 `RUNTIME-REPAIR-05` — THE CHAIN SPLIT, AND THE ASSERTIONS GOT STRONGER FOR IT.
 * Importing used to end in a load (`importAndLoadOntoFixedSlot`); the owner has split the
 * picker into two dialogs and importing is now a station act that binds no row. So the case
 * that used to read "imports, THEN loads onto the exact slot" is two cases: import registers
 * and LOADS NOTHING — in every outcome, which is a flat invariant rather than an ordering —
 * and `loadTemplateOntoFixedSlot` carries the row's coordinate verbatim.
 *
 * ⚠ NOT ONE REFUSAL MOVED. `importVcgToStation` calls the same `importVcgFile`, so a bad
 * package still throws the sentence naming the file and still registers nothing (R-001). The
 * third case below is that claim, unchanged in substance and now stated against the function
 * that actually owns it.
 *
 * The chain runs against a fake `window.cg` rather than the mock bridge because
 * what is under test is the ORDER and the COORDINATE: that the template really
 * is registered before the load, that it is still there afterwards, and that
 * the load carries the row's own slot verbatim — never a layer chosen anywhere
 * else. `fixedLayers.load` is the only channel it may call: reaching
 * `stack.load` would mean the item allocated dynamically, which is the exact
 * failure this task exists to prevent.
 */

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

describe('importing is a STATION act, and it binds no row', () => {
  it('🔴 registers into the shared library and LOADS NOTHING', async () => {
    const bridge = fakeBridge();
    const bytes = await buildValidVcg('tpl-fixed-chain');
    const file = new File([new Uint8Array(bytes)], 'clock.vcg');

    const template = await importVcgToStation(() => Promise.resolve(file));

    // It hands back the REGISTERED template — what the Templates dialog selects.
    expect(template?.templateId).toBe('tpl-fixed-chain');
    // The template went into the SHARED library — and stays there for reuse.
    expect(bridge.imported.map((t) => t.templateId)).toEqual(['tpl-fixed-chain']);
    expect(await window.cg.templates.list()).toHaveLength(1);
    /*
      🔴 THE INVARIANT THIS SESSION EXISTS TO CREATE: no row was bound. Not on the fixed
      channel, not on the dynamic one. Importing a package is not a decision about air.
    */
    expect(bridge.loads).toEqual([]);
    expect(bridge.stackLoads).toEqual([]);
  });

  it('a dismissed file picker is the operator’s own “no” — nothing imported, nothing loaded', async () => {
    const bridge = fakeBridge();
    const template = await importVcgToStation(() => Promise.resolve(null));
    // Not a success (no flash) and not an error (no toast) — the cancelled path.
    expect(template).toBeNull();
    expect(bridge.imported).toEqual([]);
    expect(bridge.loads).toEqual([]);
  });

  it('a bad package registers nothing and loads nothing — it throws the file’s name', async () => {
    const bridge = fakeBridge();
    const file = new File([new TextEncoder().encode('not a .vcg')], 'broken.vcg');
    await expect(importVcgToStation(() => Promise.resolve(file))).rejects.toThrow(/broken\.vcg/);
    expect(bridge.imported).toEqual([]);
    expect(bridge.loads).toEqual([]);
  });

  it('the LOAD carries the row’s own coordinate, and never the dynamic path', async () => {
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
