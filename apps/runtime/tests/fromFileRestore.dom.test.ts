// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetFromFileForTest,
  attachFileSource,
  detachFileSource,
  fromFileState,
  restoreFromFileAttachments,
} from '../src/renderer/features/inspector/fromFileStore.js';
import type * as PersistenceModule from '../src/renderer/features/inspector/fromFilePersistence.js';
import type { PersistedAttachment } from '../src/renderer/features/inspector/fromFilePersistence.js';

/**
 * B-113 — an attachment survives a page refresh, and a restored one is never
 * presented as readable when it is not.
 *
 * The IndexedDB layer is mocked: jsdom has no IndexedDB, and what is worth
 * pinning here is not that IDB works but that the STORE asks it at the right
 * moments and honours what comes back — in particular that a handle whose read
 * permission did not survive is restored VISIBLY but marked unreadable.
 */

const saved = new Map<string, PersistedAttachment>();
const pruneCalls: string[][] = [];

vi.mock('../src/renderer/features/inspector/fromFilePersistence.js', async () => {
  const actual = await vi.importActual<PersistenceModule>(
    '../src/renderer/features/inspector/fromFilePersistence.js',
  );
  return {
    attachmentKey: actual.attachmentKey,
    saveAttachment: (r: PersistedAttachment) => {
      saved.set(r.key, r);
      return Promise.resolve();
    },
    deleteAttachment: (k: string) => {
      saved.delete(k);
      return Promise.resolve();
    },
    loadAttachments: () => Promise.resolve([...saved.values()]),
    pruneAttachments: (ids: Iterable<string>) => {
      pruneCalls.push([...ids]);
      return Promise.resolve();
    },
  };
});

/** A stand-in handle whose permission answer the test controls. */
function fakeHandle(name: string, permission: PermissionState): FileSystemFileHandle {
  return {
    name,
    kind: 'file',
    getFile: () => Promise.resolve(new File(['content'], name)),
    queryPermission: () => Promise.resolve(permission),
    requestPermission: () => Promise.resolve('granted' as PermissionState),
  } as unknown as FileSystemFileHandle;
}

function source(handle: FileSystemFileHandle) {
  return { name: handle.name, handle, read: () => Promise.resolve('content') };
}

describe('from-file attachments survive a refresh', () => {
  beforeEach(() => {
    saved.clear();
    pruneCalls.length = 0;
    __resetFromFileForTest();
  });
  afterEach(() => {
    __resetFromFileForTest();
  });

  it('an attachment is written through, and comes back after the store is wiped', async () => {
    const handle = fakeHandle('names.txt', 'granted');
    attachFileSource('item-1', ['anchor'], source(handle), { split: true, delimiter: '|' });
    expect(saved.size).toBe(1);

    // The page reloads: the in-memory store is gone, durable storage is not.
    __resetFromFileForTest();
    expect(fromFileState('item-1', ['anchor'])).toBeUndefined();

    await restoreFromFileAttachments(['item-1']);
    const restored = fromFileState('item-1', ['anchor']);
    expect(restored?.source.name).toBe('names.txt');
    // The split CONFIG comes back with the file — restoring one without the
    // other would silently change how the file is read.
    expect(restored?.split).toBe(true);
    expect(restored?.delimiter).toBe('|');
    expect(restored?.permission).toBe('granted');
  });

  it('a handle whose permission did NOT survive is restored visibly but marked unreadable', async () => {
    const handle = fakeHandle('needs-grant.txt', 'prompt');
    attachFileSource('item-1', ['anchor'], source(handle), { split: false, delimiter: '\\n' });
    __resetFromFileForTest();

    await restoreFromFileAttachments(['item-1']);
    const restored = fromFileState('item-1', ['anchor']);
    // Visible — the operator must know WHICH file was attached…
    expect(restored?.source.name).toBe('needs-grant.txt');
    // …but not claimed readable, so nothing reads stale content in its place.
    expect(restored?.permission).toBe('needs-gesture');
  });

  it('does not restore onto an item that is no longer on the stack, and prunes it', async () => {
    attachFileSource('item-gone', ['anchor'], source(fakeHandle('x.txt', 'granted')), {
      split: false,
      delimiter: '\\n',
    });
    __resetFromFileForTest();

    await restoreFromFileAttachments(['item-still-here']);
    expect(fromFileState('item-gone', ['anchor'])).toBeUndefined();
    expect(pruneCalls.at(-1)).toEqual(['item-still-here']);
  });

  it('never overwrites a LIVE attachment with a restored one', async () => {
    attachFileSource('item-1', ['anchor'], source(fakeHandle('old.txt', 'granted')), {
      split: false,
      delimiter: '\\n',
    });
    __resetFromFileForTest();
    // The operator picks a different file before the restore lands.
    attachFileSource('item-1', ['anchor'], source(fakeHandle('just-picked.txt', 'granted')), {
      split: false,
      delimiter: '\\n',
    });

    await restoreFromFileAttachments(['item-1']);
    expect(fromFileState('item-1', ['anchor'])?.source.name).toBe('just-picked.txt');
  });

  it('detaching forgets the durable copy too — it must not come back on the next reload', async () => {
    attachFileSource('item-1', ['anchor'], source(fakeHandle('x.txt', 'granted')), {
      split: false,
      delimiter: '\\n',
    });
    detachFileSource('item-1', ['anchor']);
    expect(saved.size).toBe(0);

    __resetFromFileForTest();
    await restoreFromFileAttachments(['item-1']);
    expect(fromFileState('item-1', ['anchor'])).toBeUndefined();
  });
});
