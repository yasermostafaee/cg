import { describe, expect, it, vi } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import { importVcgToStation } from '../src/renderer/features/fixedLayers/fixedSlotLoad.js';
import {
  importVcgFile,
  type ChooseOnClash,
} from '../src/renderer/features/library/importVcgFile.js';
import * as feedback from '../src/renderer/features/status/commandFeedback.js';
import { buildValidVcg } from './e2e/fixtures/runtime.js';

/**
 * 🔴 `B-352` — **AN IMPORT NEVER REPLACES A TEMPLATE IN SILENCE.** Every composition of one Designer
 * project used to carry the project's id, so each import replaced the one before it on the channel.
 * The Designer now gives each composition its own id; and a package whose id the channel already
 * lists is a question — Update it (its rows and Source defaults stay) or Add it as a new template.
 */

function fakeStation(): { registry: Map<string, TemplateInfo>; imports: TemplateInfo[] } {
  const registry = new Map<string, TemplateInfo>();
  const imports: TemplateInfo[] = [];
  const cg = {
    templates: {
      import: (req: { template: TemplateInfo }) => {
        registry.set(req.template.templateId, req.template);
        imports.push(req.template);
        return Promise.resolve({ registered: true, templateId: req.template.templateId });
      },
      get: (req: { templateId: string }) => Promise.resolve(registry.get(req.templateId) ?? null),
      list: () => Promise.resolve([...registry.values()]),
    },
  };
  (globalThis as unknown as { window: { cg: typeof cg } }).window = { cg };
  return { registry, imports };
}

const file = async (templateId: string, name: string): Promise<File> =>
  new File([new Uint8Array(await buildValidVcg(templateId))], name);

describe('🔴 B-352 — two compositions of one project, side by side', () => {
  it('two packages with their own ids import as two templates, and nothing is asked', async () => {
    const station = fakeStation();
    const choose = vi.fn<ChooseOnClash>();
    await importVcgToStation(async () => file('comp-a-id', 'telavat-a.vcg'), 1, choose);
    await importVcgToStation(async () => file('comp-b-id', 'telavat-b.vcg'), 1, choose);
    expect([...station.registry.keys()]).toEqual(['comp-a-id', 'comp-b-id']);
    expect(choose).not.toHaveBeenCalled();
  });
});

describe('🔴 B-352 — a package whose id the channel already lists', () => {
  it('Update: the same template, and the line says Updated', async () => {
    const station = fakeStation();
    const success = vi.spyOn(feedback, 'reportCommandSuccess');
    await importVcgToStation(
      async () => file('tpl-1', 'telavat.vcg'),
      1,
      () => {
        throw new Error('not asked on a first import');
      },
    );
    const choose = vi.fn<ChooseOnClash>(() => Promise.resolve('update'));
    const back = await importVcgToStation(async () => file('tpl-1', 'telavat.vcg'), 1, choose);
    expect(choose).toHaveBeenCalledTimes(1);
    expect(choose.mock.calls[0]?.[0].templateId).toBe('tpl-1');
    expect([...station.registry.keys()]).toEqual(['tpl-1']);
    expect(back?.templateId).toBe('tpl-1');
    expect(success).toHaveBeenLastCalledWith('Updated · telavat');
  });

  it('Add as a new template: a library id of its own, and the name gets (2)', async () => {
    const station = fakeStation();
    const success = vi.spyOn(feedback, 'reportCommandSuccess');
    await importVcgToStation(async () => file('tpl-1', 'telavat.vcg'), 1);
    const back = await importVcgToStation(
      async () => file('tpl-1', 'telavat.vcg'),
      1,
      () => Promise.resolve('add'),
    );
    expect(station.registry.size).toBe(2);
    expect(back?.templateId).not.toBe('tpl-1');
    expect(back?.sourceFileName).toBe('telavat (2).vcg');
    expect(success).toHaveBeenLastCalledWith('Imported · telavat (2)');
    // A third copy takes the next free name.
    const third = await importVcgToStation(
      async () => file('tpl-1', 'telavat.vcg'),
      1,
      () => Promise.resolve('add'),
    );
    expect(third?.sourceFileName).toBe('telavat (3).vcg');
  });

  it('declined (the dialog closed): nothing is imported', async () => {
    const station = fakeStation();
    await importVcgToStation(async () => file('tpl-1', 'telavat.vcg'), 1);
    const back = await importVcgToStation(
      async () => file('tpl-1', 'telavat.vcg'),
      1,
      () => Promise.resolve(null),
    );
    expect(back).toBeNull();
    expect(station.imports).toHaveLength(1);
  });

  it('a caller with nowhere to ask updates, as every import did', async () => {
    const station = fakeStation();
    await importVcgToStation(async () => file('tpl-1', 'telavat.vcg'), 1);
    await importVcgToStation(async () => file('tpl-1', 'telavat.vcg'), 1);
    expect(station.registry.size).toBe(1);
    expect(station.imports).toHaveLength(2);
  });
});

describe('R-108 — Reload remains bound to the remembered template', () => {
  it('refuses a different package during Reload all before importing anything', async () => {
    const station = fakeStation();
    await expect(
      importVcgFile(await file('different-id', 'weather.vcg'), 1, undefined, {
        templateId: 'expected-id',
        packageId: 'expected-id',
      }),
    ).rejects.toThrow(/Reload it individually/);
    expect(station.imports).toEqual([]);
  });

  it('keeps the registered id and label when a copied catalogue entry reloads its original package', async () => {
    const station = fakeStation();
    const source = () => file('tpl-1', 'ghab-title.vcg');
    await importVcgToStation(source, 1);
    const copy = await importVcgToStation(source, 1, () => Promise.resolve('add'));
    if (copy === null) throw new Error('Copy not created');
    const result = await importVcgFile(await source(), 1, undefined, {
      templateId: copy.templateId,
      packageId: 'tpl-1',
    });
    expect(station.registry.size).toBe(2);
    expect(result).toMatchObject({
      templateId: copy.templateId,
      packageId: 'tpl-1',
      outcome: 'updated',
    });
    expect(station.imports.at(-1)?.sourceFileName).toBe(copy.sourceFileName);
  });

  it('updates only the chosen entry after explicit approval of a new package id', async () => {
    const station = fakeStation();
    await importVcgToStation(() => file('old-id', 'ghab-title.vcg'), 1);
    const replacement = await file('new-id', 'ghab-title.vcg');
    const target = { templateId: 'old-id', packageId: 'old-id' };
    const cancelled = await importVcgFile(replacement, 1, undefined, {
      ...target,
      approvePackageChange: () => Promise.resolve(false),
    });
    expect(cancelled).toBeNull();
    expect(station.imports).toHaveLength(1);
    const approved = await importVcgFile(replacement, 1, undefined, {
      ...target,
      approvePackageChange: () => Promise.resolve(true),
    });
    expect(approved).toMatchObject({ templateId: 'old-id', packageId: 'new-id' });
    expect([...station.registry.keys()]).toEqual(['old-id']);
    expect(station.imports).toHaveLength(2);
  });
});
