import {
  type Workspace,
  type KeyValueStore,
  MemoryWorkspace,
  LocalStorageKv,
  MemoryKv,
  isOpfsSupported,
  isFileSystemAccessSupported,
  openOpfsWorkspace,
  connectAndRememberDirectory,
  restoreRememberedDirectory,
} from '@cg/storage';

/**
 * The Designer's persistence root. Defaults to OPFS (real files, no prompt,
 * works in every modern browser). The operator can upgrade to a real
 * on-disk folder via `connectDirectory()` (File System Access, Chromium),
 * which is remembered across sessions.
 */
const HANDLE_ID = 'designer-library';

let active: Workspace | null = null;

export async function initWorkspace(): Promise<Workspace> {
  if (active !== null) return active;

  // Prefer a previously-connected on-disk folder when its permission survives.
  if (isFileSystemAccessSupported()) {
    try {
      const restored = await restoreRememberedDirectory(HANDLE_ID);
      if (restored !== null) {
        active = restored;
        return active;
      }
    } catch {
      // fall through to OPFS
    }
  }

  active = isOpfsSupported() ? await openOpfsWorkspace('designer') : new MemoryWorkspace();
  return active;
}

export function workspace(): Workspace {
  if (active === null) throw new Error('Workspace not initialized — call initWorkspace() first');
  return active;
}

/**
 * Prompt for a real on-disk folder (File System Access). Must be called from
 * a user gesture. The handle is persisted so the same folder reopens next
 * session. Returns the new active workspace.
 */
export async function connectDirectory(): Promise<Workspace> {
  active = await connectAndRememberDirectory(HANDLE_ID, { id: 'cg-designer', mode: 'readwrite' });
  return active;
}

export function isPersistentFolderSupported(): boolean {
  return isFileSystemAccessSupported();
}

/** Small preferences store (recent files, UI flags). */
export const prefs: KeyValueStore =
  typeof localStorage !== 'undefined' ? new LocalStorageKv('cg-designer') : new MemoryKv();
