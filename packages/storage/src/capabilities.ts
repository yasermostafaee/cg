import { DirectoryWorkspace } from './directory-workspace.js';
import {
  ensureHandlePermission,
  loadDirectoryHandle,
  saveDirectoryHandle,
} from './handle-store.js';

/** True iff the File System Access directory picker is available (Chromium). */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** True iff the Origin Private File System (OPFS) is available. */
export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function'
  );
}

/**
 * Prompt the user to pick a folder and return a Workspace over it. The
 * folder becomes the project library root — real files the operator can
 * see, back up, and copy between machines. Chromium-only.
 */
export async function pickDirectoryWorkspace(
  options?: DirectoryPickerOptions,
): Promise<DirectoryWorkspace> {
  if (!window.showDirectoryPicker) {
    throw new Error('File System Access API is not supported in this browser');
  }
  const handle = await window.showDirectoryPicker(options);
  return new DirectoryWorkspace(handle, handle.name);
}

/**
 * Open a Workspace over the Origin Private File System. Real files, but
 * sandboxed inside the browser profile (not visible in the OS file
 * manager). Available in all modern browsers. `subdir` namespaces the
 * library so multiple apps on the same origin don't collide.
 */
export async function openOpfsWorkspace(subdir = 'cg'): Promise<DirectoryWorkspace> {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(subdir, { create: true });
  return new DirectoryWorkspace(dir, `opfs:${subdir}`);
}

/**
 * Pick an on-disk folder (File System Access) and remember it under `id` so
 * a later `restoreRememberedDirectory(id)` reopens it without prompting.
 * Must be called from a user gesture. Chromium-only.
 */
export async function connectAndRememberDirectory(
  id: string,
  options?: DirectoryPickerOptions,
): Promise<DirectoryWorkspace> {
  if (!window.showDirectoryPicker) {
    throw new Error('File System Access API is not supported in this browser');
  }
  const handle = await window.showDirectoryPicker(options);
  await ensureHandlePermission(handle);
  try {
    await saveDirectoryHandle(id, handle);
  } catch {
    // Persisting the handle is best-effort; a fresh prompt next session is fine.
  }
  return new DirectoryWorkspace(handle, handle.name);
}

/**
 * Reopen a previously-remembered on-disk folder. Returns null when nothing
 * was stored or permission can no longer be granted.
 */
export async function restoreRememberedDirectory(id: string): Promise<DirectoryWorkspace | null> {
  const handle = await loadDirectoryHandle(id);
  if (handle === null) return null;
  if (!(await ensureHandlePermission(handle))) return null;
  return new DirectoryWorkspace(handle, handle.name);
}
