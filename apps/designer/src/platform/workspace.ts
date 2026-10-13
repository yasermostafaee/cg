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
  loadDirectoryHandle,
} from '@cg/storage';

/**
 * The Designer's persistence root. Defaults to OPFS (real files, no prompt,
 * works in every modern browser). The operator can upgrade to a real
 * on-disk folder via `connectDirectory()` (File System Access, Chromium),
 * which is remembered across sessions.
 */
const HANDLE_ID = 'designer-library';

let active: Workspace | null = null;
let activeRoot: WorkspaceRoot | null = null;

/**
 * D-150 / B-104 — WHY the active storage root is the one it is.
 *
 * This type exists because the previous implementation had two bare `catch {}`
 * legs and no way to say what happened. That silence is one half of B-104: a
 * remembered folder whose permission did not survive a browser restart dropped
 * the author onto OPFS without a word, so `projects/<id>/assets/...` resolved
 * against a different root and every asset went missing while the scene loaded
 * perfectly.
 *
 * 🔴 The two failure legs are DIFFERENT CONDITIONS with different remedies and
 * must stay distinguishable: `folder-permission-lost` is normal and fixed by one
 * click (re-grant); `folder-restore-failed` is an error that carries a message.
 * A single `catch` cannot tell them apart, which is how they were both invisible.
 */
export type WorkspaceRootKind = 'directory' | 'opfs' | 'memory';

export type WorkspaceRootReason =
  /** The author's connected on-disk folder reopened cleanly. */
  | 'connected-folder'
  /** The normal sandboxed default — real files, per-origin, survives a restart. */
  | 'opfs'
  /** A folder was remembered but its permission grant did not survive. DEGRADED. */
  | 'folder-permission-lost'
  /** Reopening the remembered folder THREW. DEGRADED, and `detail` says why. */
  | 'folder-restore-failed'
  /** No sandboxed store (insecure context / private mode). SESSION-ONLY. */
  | 'opfs-unavailable'
  /** `?storage=memory` — the diagnostic override. SESSION-ONLY. */
  | 'forced-memory'
  /** The Playwright harness. A deliberate test choice, not a degradation. */
  | 'e2e';

export interface WorkspaceRoot {
  kind: WorkspaceRootKind;
  /** Human-meaningful label for the backing store (folder name, `opfs:designer`, `memory`). */
  label: string;
  reason: WorkspaceRootReason;
  /** The remembered folder's name, when one was remembered — so the notice can name it. */
  folderName?: string;
  /** An error message, when a leg failed with one. Never swallowed. */
  detail?: string;
}

export interface WorkspaceInit {
  workspace: Workspace;
  root: WorkspaceRoot;
}

/**
 * The reasons that mean "this is not what the author configured, or it will not
 * survive the tab closing". Every one of these is SHOWN. The rest are silent,
 * because a healthy default should not nag.
 */
const DEGRADED_REASONS: ReadonlySet<WorkspaceRootReason> = new Set([
  'folder-permission-lost',
  'folder-restore-failed',
  'opfs-unavailable',
  'forced-memory',
]);

export function isDegradedRoot(root: WorkspaceRoot): boolean {
  return DEGRADED_REASONS.has(root.reason);
}

/** True when nothing written to the workspace survives the tab closing. */
export function isSessionOnlyRoot(root: WorkspaceRoot): boolean {
  return root.kind === 'memory' && root.reason !== 'e2e';
}

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

/**
 * D-150 — `?storage=memory`: force the session-only store.
 *
 * A diagnostic override, kept deliberately SEPARATE from `CG_E2E` (which stays a
 * non-URL flag precisely so an operator cannot reach it by bookmark or typo). This
 * one is a URL parameter because the in-memory leg is the only root with no natural
 * trigger on a healthy machine, and a state nobody can reach is a state nobody can
 * check.
 *
 * It is only defensible because of what ships alongside it: session-only storage is
 * now announced in an undismissable notice, so this URL cannot produce a silent
 * state. If that notice is ever removed, remove this too.
 */
function isForcedMemory(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('storage') === 'memory';
  } catch {
    return false;
  }
}

export async function initWorkspace(): Promise<Workspace> {
  return (await initWorkspaceWithRoot()).workspace;
}

/**
 * Initialize the workspace and REPORT which root was chosen and why.
 *
 * 🔴 Nothing here is swallowed. Every leg that used to be a bare `catch {}` now
 * produces a named reason (and keeps the error's message in `detail`), because the
 * author is never silently moved to a different storage root — that silence was
 * half of B-104.
 */
export async function initWorkspaceWithRoot(): Promise<WorkspaceInit> {
  if (active !== null && activeRoot !== null) return { workspace: active, root: activeRoot };

  const init = await selectWorkspace();
  active = init.workspace;
  activeRoot = init.root;
  return init;
}

async function selectWorkspace(): Promise<WorkspaceInit> {
  // The diagnostic override is checked BEFORE the E2E flag, and the order is
  // deliberate: both legs produce the same isolated `MemoryWorkspace`, so test
  // isolation is identical either way — but only `forced-memory` is a DEGRADED
  // reason, so this ordering is what lets an E2E spec drive the notice and assert
  // what an operator in that state actually sees. A state no test can reach is a
  // state that quietly rots.
  if (isForcedMemory()) {
    return {
      workspace: new MemoryWorkspace(),
      root: { kind: 'memory', label: 'memory', reason: 'forced-memory' },
    };
  }

  // E2E: isolated in-memory storage, fresh per page load (no OPFS / FS Access).
  if (isE2E()) {
    return {
      workspace: new MemoryWorkspace(),
      root: { kind: 'memory', label: 'memory', reason: 'e2e' },
    };
  }

  // Prefer a previously-connected on-disk folder when its permission survives.
  if (isFileSystemAccessSupported()) {
    // Read the remembered handle first so a failure can NAME the folder the author
    // is missing. `loadDirectoryHandle` only reads IndexedDB — it prompts for nothing.
    let folderName: string | undefined;
    try {
      folderName = (await loadDirectoryHandle(HANDLE_ID))?.name;
    } catch {
      // IndexedDB itself is unreadable (private mode, corrupt profile). There is no
      // remembered folder to speak of, so this is the "none was remembered" case —
      // not a degradation, and the OPFS default below is the right answer.
      folderName = undefined;
    }

    if (folderName !== undefined) {
      try {
        const restored = await restoreRememberedDirectory(HANDLE_ID);
        if (restored !== null) {
          return {
            workspace: restored,
            root: {
              kind: 'directory',
              label: restored.label,
              reason: 'connected-folder',
              folderName,
            },
          };
        }
        // Permission is no longer granted. This is the ORDINARY case after a full
        // browser restart: Chromium requires a user GESTURE for
        // `requestPermission()`, and boot has none — so the grant cannot be
        // re-acquired here no matter how the code is written. The fix is to say so
        // and let the author's click supply the gesture (`connectDirectory`).
        return await opfsOrMemory({
          reason: 'folder-permission-lost',
          folderName,
        });
      } catch (err) {
        return await opfsOrMemory({
          reason: 'folder-restore-failed',
          folderName,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return await opfsOrMemory(null);
}

/**
 * The sandboxed default, and the last resort below it.
 *
 * `degraded` carries the reason the PREFERRED root was unavailable. It is reported
 * even though OPFS itself worked, because "your folder is not the root you think it
 * is" is exactly the fact whose absence made B-104 invisible.
 */
async function opfsOrMemory(
  degraded: { reason: WorkspaceRootReason; folderName?: string; detail?: string } | null,
): Promise<WorkspaceInit> {
  if (isOpfsSupported()) {
    try {
      const ws = await openOpfsWorkspace('designer');
      return {
        workspace: ws,
        root:
          degraded === null
            ? { kind: 'opfs', label: ws.label, reason: 'opfs' }
            : {
                kind: 'opfs',
                label: ws.label,
                reason: degraded.reason,
                ...(degraded.folderName !== undefined ? { folderName: degraded.folderName } : {}),
                ...(degraded.detail !== undefined ? { detail: degraded.detail } : {}),
              },
      };
    } catch (err) {
      // OPFS can throw in insecure contexts or private modes — never let storage init
      // blank the app. Falling back is still right; falling back SILENTLY is not.
      return {
        workspace: new MemoryWorkspace(),
        root: {
          kind: 'memory',
          label: 'memory',
          reason: 'opfs-unavailable',
          ...(degraded?.folderName !== undefined ? { folderName: degraded.folderName } : {}),
          detail: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  return {
    workspace: new MemoryWorkspace(),
    root: {
      kind: 'memory',
      label: 'memory',
      reason: 'opfs-unavailable',
      ...(degraded?.folderName !== undefined ? { folderName: degraded.folderName } : {}),
    },
  };
}

export function workspace(): Workspace {
  if (active === null) throw new Error('Workspace not initialized — call initWorkspace() first');
  return active;
}

/** The root the active workspace resolved to, for the storage notice. */
export function workspaceRoot(): WorkspaceRoot {
  if (activeRoot === null)
    throw new Error('Workspace not initialized — call initWorkspace() first');
  return activeRoot;
}

/**
 * Prompt for a real on-disk folder (File System Access). Must be called from
 * a user gesture. The handle is persisted so the same folder reopens next
 * session. Returns the new active workspace.
 *
 * This is also the REPAIR for `folder-permission-lost`: the gesture boot could not
 * supply is supplied by the author's click on Reconnect.
 */
export async function connectDirectory(): Promise<Workspace> {
  const ws = await connectAndRememberDirectory(HANDLE_ID, { id: 'cg-designer', mode: 'readwrite' });
  active = ws;
  activeRoot = {
    kind: 'directory',
    label: ws.label,
    reason: 'connected-folder',
    folderName: ws.label,
  };
  return ws;
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
