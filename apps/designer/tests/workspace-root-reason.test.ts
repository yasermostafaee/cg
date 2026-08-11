/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as StorageModule from '@cg/storage';
import type { Workspace } from '@cg/storage';
import type * as WorkspaceModule from '../src/platform/workspace.js';

/**
 * D-150 / B-104 — `initWorkspace()` must never substitute a storage root in silence.
 *
 * The code these tests replace had two bare `catch {}` legs and no way to say what
 * happened. That silence is half of B-104: a remembered folder whose permission did not
 * survive a browser restart dropped the author onto a different root without a word, and
 * `projects/<id>/assets/...` then resolved somewhere the bytes were not.
 *
 * 🔴 The sharpest of these is `folder-permission-lost` vs `folder-restore-failed`. They
 * are DIFFERENT conditions with different remedies, and a single `catch` cannot tell
 * them apart — which is exactly how both stayed invisible.
 */

const mocks = vi.hoisted(() => ({
  isFileSystemAccessSupported: vi.fn(() => false),
  isOpfsSupported: vi.fn(() => true),
  openOpfsWorkspace: vi.fn(),
  restoreRememberedDirectory: vi.fn(),
  loadDirectoryHandle: vi.fn(),
  connectAndRememberDirectory: vi.fn(),
}));

vi.mock('@cg/storage', async () => {
  const actual = await vi.importActual<typeof StorageModule>('@cg/storage');
  return { ...actual, ...mocks };
});

function fakeWorkspace(label: string): Workspace {
  return { label } as unknown as Workspace;
}

async function loadWorkspaceModule(): Promise<typeof WorkspaceModule> {
  // The module caches the resolved root, so every case needs a fresh instance.
  vi.resetModules();
  return import('../src/platform/workspace.js');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isFileSystemAccessSupported.mockReturnValue(false);
  mocks.isOpfsSupported.mockReturnValue(true);
  mocks.openOpfsWorkspace.mockResolvedValue(fakeWorkspace('opfs:designer'));
  mocks.loadDirectoryHandle.mockResolvedValue(null);
  mocks.restoreRememberedDirectory.mockResolvedValue(null);
  window.history.replaceState({}, '', '/');
  delete (window as { CG_E2E?: boolean }).CG_E2E;
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
  delete (window as { CG_E2E?: boolean }).CG_E2E;
});

describe('initWorkspaceWithRoot — the root is always NAMED', () => {
  it('the healthy sandboxed default reports no degradation, and shows nothing', async () => {
    const ws = await loadWorkspaceModule();
    const { root } = await ws.initWorkspaceWithRoot();

    expect(root).toMatchObject({ kind: 'opfs', reason: 'opfs' });
    // A notice that appears when everything is fine is a notice people learn to ignore.
    expect(ws.isDegradedRoot(root)).toBe(false);
    expect(ws.isSessionOnlyRoot(root)).toBe(false);
  });

  it('a folder that reopens cleanly is the connected root', async () => {
    mocks.isFileSystemAccessSupported.mockReturnValue(true);
    mocks.loadDirectoryHandle.mockResolvedValue({ name: 'Broadcast Projects' });
    mocks.restoreRememberedDirectory.mockResolvedValue(fakeWorkspace('Broadcast Projects'));

    const ws = await loadWorkspaceModule();
    const { root } = await ws.initWorkspaceWithRoot();

    expect(root).toMatchObject({
      kind: 'directory',
      reason: 'connected-folder',
      folderName: 'Broadcast Projects',
    });
    expect(ws.isDegradedRoot(root)).toBe(false);
  });

  it('a remembered folder whose PERMISSION is gone is reported, and names the folder', async () => {
    // The ordinary case after a full browser restart: Chromium requires a user gesture
    // for `requestPermission()` and boot has none, so this leg is not avoidable by
    // writing the startup code differently — only by saying so.
    mocks.isFileSystemAccessSupported.mockReturnValue(true);
    mocks.loadDirectoryHandle.mockResolvedValue({ name: 'Broadcast Projects' });
    mocks.restoreRememberedDirectory.mockResolvedValue(null);

    const ws = await loadWorkspaceModule();
    const { root } = await ws.initWorkspaceWithRoot();

    expect(root.reason).toBe('folder-permission-lost');
    expect(root.folderName).toBe('Broadcast Projects');
    // It still WORKS — it fell back to the sandboxed store, as before. What changed is
    // that the fallback is announced instead of silent.
    expect(root.kind).toBe('opfs');
    expect(ws.isDegradedRoot(root)).toBe(true);
  });

  it('a restore that THREW is a different reason, and keeps the error message', async () => {
    mocks.isFileSystemAccessSupported.mockReturnValue(true);
    mocks.loadDirectoryHandle.mockResolvedValue({ name: 'Broadcast Projects' });
    mocks.restoreRememberedDirectory.mockRejectedValue(new Error('User activation is required'));

    const ws = await loadWorkspaceModule();
    const { root } = await ws.initWorkspaceWithRoot();

    expect(root.reason).toBe('folder-restore-failed');
    // Nothing is swallowed: the message survives to the notice.
    expect(root.detail).toMatch(/User activation is required/);
    expect(ws.isDegradedRoot(root)).toBe(true);
  });

  it('no sandboxed store means SESSION-ONLY, said out loud', async () => {
    mocks.isOpfsSupported.mockReturnValue(false);

    const ws = await loadWorkspaceModule();
    const { root } = await ws.initWorkspaceWithRoot();

    expect(root).toMatchObject({ kind: 'memory', reason: 'opfs-unavailable' });
    expect(ws.isSessionOnlyRoot(root)).toBe(true);
    expect(ws.isDegradedRoot(root)).toBe(true);
  });

  it('a THROWING sandboxed store also lands in memory, with its message kept', async () => {
    mocks.openOpfsWorkspace.mockRejectedValue(new Error('SecurityError: insecure context'));

    const ws = await loadWorkspaceModule();
    const { root } = await ws.initWorkspaceWithRoot();

    expect(root).toMatchObject({ kind: 'memory', reason: 'opfs-unavailable' });
    expect(root.detail).toMatch(/insecure context/);
    expect(ws.isSessionOnlyRoot(root)).toBe(true);
  });

  it('?storage=memory is a NAMED diagnostic state, not an anonymous one', async () => {
    window.history.replaceState({}, '', '/?storage=memory');

    const ws = await loadWorkspaceModule();
    const { root } = await ws.initWorkspaceWithRoot();

    expect(root).toMatchObject({ kind: 'memory', reason: 'forced-memory' });
    expect(ws.isSessionOnlyRoot(root)).toBe(true);
  });

  it('the E2E harness is a deliberate choice, not a degradation — so it stays quiet', async () => {
    (window as { CG_E2E?: boolean }).CG_E2E = true;

    const ws = await loadWorkspaceModule();
    const { root } = await ws.initWorkspaceWithRoot();

    expect(root.reason).toBe('e2e');
    expect(ws.isDegradedRoot(root)).toBe(false);
    expect(ws.isSessionOnlyRoot(root)).toBe(false);
  });

  it('?storage=memory outranks the E2E flag, so a spec can drive the real notice', async () => {
    // Both legs produce the same isolated MemoryWorkspace, so test isolation is
    // identical — but only `forced-memory` is degraded, and a state no test can reach
    // is a state that quietly rots.
    (window as { CG_E2E?: boolean }).CG_E2E = true;
    window.history.replaceState({}, '', '/?storage=memory');

    const ws = await loadWorkspaceModule();
    const { root } = await ws.initWorkspaceWithRoot();

    expect(root.reason).toBe('forced-memory');
    expect(ws.isDegradedRoot(root)).toBe(true);
  });

  it('an unreadable handle store is NOT a degradation — there is no folder to miss', async () => {
    mocks.isFileSystemAccessSupported.mockReturnValue(true);
    mocks.loadDirectoryHandle.mockRejectedValue(new Error('IndexedDB unavailable'));

    const ws = await loadWorkspaceModule();
    const { root } = await ws.initWorkspaceWithRoot();

    expect(root.reason).toBe('opfs');
    expect(ws.isDegradedRoot(root)).toBe(false);
  });
});
