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

/**
 * E2E test mode. Playwright sets `window.CG_E2E = true` via `addInitScript` BEFORE
 * any app JS runs (a real user can't trigger it — it isn't a URL/env flag). In test
 * mode the Designer uses fresh in-memory storage so runs are isolated and
 * deterministic and never touch OPFS / the File System Access API (no native
 * dialogs). This is the ONLY effect of the flag; the Playwright harness separately
 * neutralizes the native pickers. Test-only — do NOT rely on it in production.
 */
export function isE2E(): boolean {
  return typeof window !== 'undefined' && (window as { CG_E2E?: boolean }).CG_E2E === true;
}

export async function initWorkspace(): Promise<Workspace> {
  if (active !== null) return active;

  // E2E: isolated in-memory storage, fresh per page load (no OPFS / FS Access).
  if (isE2E()) {
    active = new MemoryWorkspace();
    return active;
  }

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

  try {
    active = isOpfsSupported() ? await openOpfsWorkspace('designer') : new MemoryWorkspace();
  } catch {
    // OPFS can throw in insecure contexts or private modes — never let storage
    // init blank the app; fall back to in-memory (this-session-only) storage.
    active = new MemoryWorkspace();
  }
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

/** Small preferences store (recent files, UI flags). In E2E test mode it is
 *  in-memory so prefs never leak between runs. */
export const prefs: KeyValueStore =
  isE2E() || typeof localStorage === 'undefined'
    ? new MemoryKv()
    : new LocalStorageKv('cg-designer');
