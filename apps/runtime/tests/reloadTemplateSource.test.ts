import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { reloadTemplateSource } from '../src/renderer/features/library/reloadTemplateSource.js';
import { importVcgFile } from '../src/renderer/features/library/importVcgFile.js';

vi.mock('../src/renderer/features/library/importVcgFile.js', () => ({
  importVcgFile: vi.fn(() =>
    Promise.resolve({
      templateId: 'tpl',
      packageId: 'pkg',
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
const shared = { bridgeAddress: 'bridge:5280', root: '/share', folder: 'خبر', name: 'weather.vcg' };
const bridgeAddress = vi.fn(() => shared.bridgeAddress);
const templateFolder = vi.fn(() => Promise.resolve({ root: shared.root, folder: '', entries: [] }));
const templateRead = vi.fn(() =>
  Promise.resolve({
    root: shared.root as string | undefined,
    name: shared.name,
    base64: 'cGFja2FnZQ==',
  }),
);

beforeEach(() => {
  updates.length = 0;
  vi.mocked(importVcgFile).mockClear();
  bridgeAddress.mockReset().mockReturnValue(shared.bridgeAddress);
  templateFolder.mockClear();
  templateRead.mockClear();
  const cg = {
    link: { bridgeAddress },
    sharedFiles: { templateFolder, templateRead },
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
    const result = await reloadTemplateSource(TEMPLATE, 1, { handle, packageId: 'pkg' }, 'keep');
    expect(importVcgFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'weather.vcg' }),
      1,
      undefined,
      { templateId: 'tpl', packageId: 'pkg' },
    );
    expect(result?.resetRows).toBe(0);
    expect(updates).toEqual([]);
  });

  it('file-defaults replaces only rows on the template channel', async () => {
    const result = await reloadTemplateSource(TEMPLATE, 1, { handle }, 'file-defaults');
    expect(result?.resetRows).toBe(1);
    expect(updates).toEqual([
      { itemId: 'ch1', fields: { title: 'new-file' }, mergeMode: 'replace' },
    ]);
  });

  it('reads the shared package from its exact Bridge and root, then uses the same data policy', async () => {
    const result = await reloadTemplateSource(
      TEMPLATE,
      1,
      { shared, packageId: 'pkg' },
      'file-defaults',
    );
    expect(templateRead).toHaveBeenCalledWith({
      folder: shared.folder,
      name: shared.name,
      expectedRoot: shared.root,
    });
    expect(importVcgFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: shared.name }),
      1,
      undefined,
      { templateId: 'tpl', packageId: 'pkg' },
    );
    expect(result?.resetRows).toBe(1);
    expect(updates).toEqual([
      { itemId: 'ch1', fields: { title: 'new-file' }, mergeMode: 'replace' },
    ]);
  });

  it('never reads a shared source from another station', async () => {
    bridgeAddress.mockReturnValue('other:5280');
    await expect(reloadTemplateSource(TEMPLATE, 1, { shared }, 'keep')).rejects.toThrow(
      'remembered on another CG Bridge',
    );
    expect(templateRead).not.toHaveBeenCalled();
    expect(importVcgFile).not.toHaveBeenCalled();
  });

  it('checks an older Bridge shared root before and after reading its bytes', async () => {
    templateFolder.mockResolvedValueOnce({ root: '/moved', folder: '', entries: [] });
    await expect(reloadTemplateSource(TEMPLATE, 1, { shared }, 'keep')).rejects.toThrow(
      'The Shared files path has changed.',
    );
    expect(templateRead).not.toHaveBeenCalled();

    templateRead.mockResolvedValueOnce({
      root: undefined,
      name: shared.name,
      base64: 'cGFja2FnZQ==',
    });
    templateFolder
      .mockResolvedValueOnce({ root: shared.root, folder: '', entries: [] })
      .mockResolvedValueOnce({ root: '/moved', folder: '', entries: [] });
    await expect(reloadTemplateSource(TEMPLATE, 1, { shared }, 'keep')).rejects.toThrow(
      'The Shared files path has changed.',
    );
    expect(templateRead).toHaveBeenCalledOnce();
    expect(importVcgFile).not.toHaveBeenCalled();
  });
});
