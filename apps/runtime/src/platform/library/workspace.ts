import { MemoryWorkspace, isOpfsSupported, openOpfsWorkspace, type Workspace } from '@cg/storage';

/**
 * E2E test mode. Playwright arms `window.CG_E2E` via `addInitScript` before any
 * app JS runs (the same flag `testMode.ts` reads). In E2E the library uses fresh
 * in-memory storage so runs are isolated and never touch OPFS.
 */
function isE2E(): boolean {
  return (globalThis as { CG_E2E?: boolean }).CG_E2E === true;
}

/**
 * The Runtime's persistence root for the browser-local template library (B-085).
 *
 * OPFS (real files, sandboxed per-origin, no permission prompt, survives reload)
 * in the browser; in-memory for E2E and non-browser contexts (Node tests, where
 * OPFS is unsupported). Unlike the Designer, the runtime library is NOT a
 * user-chosen folder, so there is no File System Access / directory picker — OPFS
 * is the right, prompt-free home for a playout machine's library.
 */
export async function initRuntimeWorkspace(): Promise<Workspace> {
  if (isE2E()) return new MemoryWorkspace();
  try {
    return isOpfsSupported() ? await openOpfsWorkspace('runtime') : new MemoryWorkspace();
  } catch {
    // OPFS can throw in insecure contexts / private modes — never let storage init
    // blank the app; fall back to in-memory (this-session-only) storage.
    return new MemoryWorkspace();
  }
}
