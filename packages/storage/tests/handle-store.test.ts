import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureHandlePermission,
  forgetFileHandle,
  loadFileHandle,
  saveFileHandle,
} from '../src/handle-store.js';

/**
 * D-088 — file-handle persistence + permission gating. IndexedDB isn't present in the
 * node test env, so a tiny in-memory shim stands in (the real plumbing is the browser's);
 * the round-trip proves keys round-trip and file/directory namespaces don't collide.
 * Permission gating is tested directly against a mocked handle.
 */

// ── minimal in-memory IndexedDB shim ───────────────────────────────────────
interface ShimRequest {
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded: (() => void) | null;
  result: unknown;
  error: unknown;
}
const store = new Map<string, unknown>();
function request(compute: () => unknown): ShimRequest {
  const req: ShimRequest = {
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: undefined,
    error: null,
  };
  queueMicrotask(() => {
    try {
      req.result = compute();
      req.onsuccess?.();
    } catch (e) {
      req.error = e;
      req.onerror?.();
    }
  });
  return req;
}
const objectStore = {
  put: (value: unknown, key: string) => request(() => store.set(key, value)),
  get: (key: string) => request(() => store.get(key)),
  delete: (key: string) => request(() => store.delete(key)),
};
const db = {
  transaction: () => ({ objectStore: () => objectStore }),
  createObjectStore: () => objectStore,
};
const indexedDBShim = {
  open: (): ShimRequest => {
    const req: ShimRequest = {
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      result: db,
      error: null,
    };
    queueMicrotask(() => {
      req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  },
};

beforeEach(() => {
  store.clear();
  (globalThis as { indexedDB?: unknown }).indexedDB = indexedDBShim;
});
afterEach(() => {
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
  vi.restoreAllMocks();
});

const fakeFileHandle = (name: string): FileSystemFileHandle =>
  ({ kind: 'file', name }) as unknown as FileSystemFileHandle;

describe('file-handle store (D-088)', () => {
  it('round-trips a saved file handle by project id', async () => {
    const h = fakeFileHandle('demo.cg.json');
    await saveFileHandle('proj-1', h);
    expect(await loadFileHandle('proj-1')).toBe(h);
    expect(await loadFileHandle('missing')).toBeNull();
  });

  it('forgets a file handle', async () => {
    await saveFileHandle('proj-1', fakeFileHandle('a.cg.json'));
    await forgetFileHandle('proj-1');
    expect(await loadFileHandle('proj-1')).toBeNull();
  });

  it('file-handle keys are namespaced (do not collide with a same-id directory key)', async () => {
    const fileH = fakeFileHandle('p.cg.json');
    await saveFileHandle('shared', fileH);
    // A directory handle stored under the bare same id must not be returned as the file handle.
    store.set('shared', { kind: 'directory' });
    expect(await loadFileHandle('shared')).toBe(fileH);
  });
});

describe('ensureHandlePermission (D-088)', () => {
  function handleWith(query: PermissionState, request_?: PermissionState): FileSystemFileHandle {
    return {
      kind: 'file',
      name: 'x',
      queryPermission: vi.fn().mockResolvedValue(query),
      requestPermission: vi.fn().mockResolvedValue(request_ ?? query),
    } as unknown as FileSystemFileHandle;
  }

  it('returns true when already granted (no prompt)', async () => {
    const h = handleWith('granted');
    expect(await ensureHandlePermission(h)).toBe(true);
    expect(
      (h as unknown as { requestPermission: ReturnType<typeof vi.fn> }).requestPermission,
    ).not.toHaveBeenCalled();
  });

  it('prompts and returns true when the prompt is granted', async () => {
    expect(await ensureHandlePermission(handleWith('prompt', 'granted'))).toBe(true);
  });

  it('returns false when the prompt is denied', async () => {
    expect(await ensureHandlePermission(handleWith('prompt', 'denied'))).toBe(false);
  });

  it('treats a handle with no permission methods (OPFS) as usable', async () => {
    expect(
      await ensureHandlePermission({ kind: 'file', name: 'x' } as unknown as FileSystemFileHandle),
    ).toBe(true);
  });
});
