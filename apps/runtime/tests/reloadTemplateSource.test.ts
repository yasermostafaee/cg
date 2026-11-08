import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { reloadTemplateSource } from '../src/renderer/features/library/reloadTemplateSource.js';
import { importVcgFile } from '../src/renderer/features/library/importVcgFile.js';

vi.mock('../src/renderer/features/library/importVcgFile.js', () => ({
  importVcgFile: vi.fn(() =>
    Promise.resolve({
      templateId: 'tpl',
      displayName: 'Weather',
      warnings: [],
      listFieldTargets: {},
      declaredPlateIds: [],
      outcome: 'updated',
    }),
  ),
}));

const TEMPLATE: TemplateInfo = {
  templateId: 'tpl',
  name: 'Weather',
  templateType: 'custom',
  fields: [{ id: 'title', type: 'text', label: 'Title', required: false, default: 'new-file' }],
};

const row = (itemId: string, channel: number): StackItemState => ({
  itemId,
  templateId: 'tpl',
  fields: { title: 'operator' },
  status: 'loaded',
  pending: false,
  slot: { channel, layer: 90, server: 'primary' },
});

const handle = {
  kind: 'file',
  name: 'weather.vcg',
  getFile: () => Promise.resolve(new File(['package'], 'weather.vcg')),
  queryPermission: () => Promise.resolve('granted' as PermissionState),
  requestPermission: () => Promise.resolve('granted' as PermissionState),
} as unknown as FileSystemFileHandle;

const updates: unknown[] = [];

beforeEach(() => {
  updates.length = 0;
  vi.mocked(importVcgFile).mockClear();
  const cg = {
    templates: { get: () => Promise.resolve(TEMPLATE) },
    stack: {
      snapshot: () => Promise.resolve([row('ch1', 1), row('ch2', 2)]),
      update: (req: unknown) => {
        updates.push(req);
        return Promise.resolve({ accepted: true });
      },
    },
  };
  (globalThis as unknown as { window: { cg: typeof cg } }).window = { cg };
});

describe('R-108 reload data policy', () => {
  it('keep updates the package and leaves every loaded row untouched', async () => {
    const result = await reloadTemplateSource(TEMPLATE, 1, handle, 'keep');
    expect(importVcgFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'weather.vcg' }),
      1,
      undefined,
      'tpl',
    );
    expect(result.resetRows).toBe(0);
    expect(updates).toEqual([]);
  });

  it('file-defaults replaces only rows on the template channel', async () => {
    const result = await reloadTemplateSource(TEMPLATE, 1, handle, 'file-defaults');
    expect(result.resetRows).toBe(1);
    expect(updates).toEqual([
      { itemId: 'ch1', fields: { title: 'new-file' }, mergeMode: 'replace' },
    ]);
  });
});
