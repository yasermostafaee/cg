import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteTemplateSource,
  ensureTemplateSourcePermission,
  loadTemplateSources,
  pickTemplatePackage,
  saveTemplateSource,
  templateSourceKey,
} from '../src/renderer/features/library/templateSourceStore.js';

interface RequestLike<T = unknown> {
  result: T;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded: (() => void) | null;
  onblocked: (() => void) | null;
}

const records = new Map<string, unknown>();
const request = <T>(result: T): RequestLike<T> => ({
  result,
  onsuccess: null,
  onerror: null,
  onupgradeneeded: null,
  onblocked: null,
});

function installIndexedDb(): void {
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: vi.fn(),
    close: vi.fn(),
    transaction: (_name: string, mode: IDBTransactionMode) => {
      const tx = {
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        objectStore: () => ({
          put: (record: { key: string }) => {
            records.set(record.key, record);
            queueMicrotask(() => tx.oncomplete?.());
            return request(undefined);
          },
          delete: (key: string) => {
            records.delete(key);
            queueMicrotask(() => tx.oncomplete?.());
            return request(undefined);
          },
          getAll: () => {
            const req = request([...records.values()]);
            queueMicrotask(() => req.onsuccess?.());
            return req;
          },
        }),
      };
      if (mode === 'readonly') queueMicrotask(() => tx.oncomplete?.());
      return tx;
    },
  };
  (globalThis as { indexedDB?: unknown }).indexedDB = {
    open: () => {
      const req = request(db);
      queueMicrotask(() => {
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}

function handle(name: string, permission: PermissionState = 'granted'): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: () => Promise.resolve(new File(['vcg'], name)),
    queryPermission: vi.fn(() => Promise.resolve(permission)),
    requestPermission: vi.fn(() => Promise.resolve('granted' as PermissionState)),
  } as unknown as FileSystemFileHandle;
}

beforeEach(() => {
  records.clear();
  installIndexedDb();
});

afterEach(() => {
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
  vi.restoreAllMocks();
});

describe('R-108 template source handles', () => {
  it('persists the same template independently per channel and deletes only the named source', async () => {
    const ch1 = handle('one.vcg');
    const ch2 = handle('two.vcg');
    await saveTemplateSource('tpl', 1, ch1, 'pkg-one');
    await saveTemplateSource('tpl', 2, ch2, 'pkg-two');
    expect((await loadTemplateSources()).map((r) => [r.key, r.handle.name, r.packageId])).toEqual([
      [templateSourceKey('tpl', 1), 'one.vcg', 'pkg-one'],
      [templateSourceKey('tpl', 2), 'two.vcg', 'pkg-two'],
    ]);

    await deleteTemplateSource('tpl', 1);
    expect((await loadTemplateSources()).map((r) => r.handle.name)).toEqual(['two.vcg']);
  });

  it('the picker returns a handle and a fresh File from that same source', async () => {
    const source = handle('weather.vcg');
    const picked = await pickTemplatePackage({
      showOpenFilePicker: () => Promise.resolve([source]),
    } as unknown as Window);
    expect(picked?.handle).toBe(source);
    expect(picked?.file.name).toBe('weather.vcg');
  });

  it('re-asks permission only when the remembered handle needs it', async () => {
    const granted = handle('a.vcg', 'granted');
    const prompt = handle('b.vcg', 'prompt');
    expect(await ensureTemplateSourcePermission(granted)).toBe(true);
    expect(
      (granted as unknown as { requestPermission: ReturnType<typeof vi.fn> }).requestPermission,
    ).not.toHaveBeenCalled();
    expect(await ensureTemplateSourcePermission(prompt)).toBe(true);
    expect(
      (prompt as unknown as { requestPermission: ReturnType<typeof vi.fn> }).requestPermission,
    ).toHaveBeenCalledOnce();
  });
});
