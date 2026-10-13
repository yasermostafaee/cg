import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 🔴 `CENTRAL-BRIDGE-01` §1 A — **ONE-TIME IMPORT OF AN OLDER PER-USER STATE. NOTHING IS DELETED.**
 *
 * CG Control `0.9.x` ran its own bridge and kept that bridge's stores under the Windows user who ran
 * it: `%APPDATA%\CG Control\.cg-runtime\`. When CG Bridge is installed on a machine that ran one,
 * the installer (elevated, so it can read every profile) asks the bridge to import it ONCE:
 *
 *   - the NEWEST per-user state found is copied into the service's `.cg-runtime\` — the templates,
 *     the per-channel lists, the Source defaults, the banks, the ledger of what is on air, the
 *     stack, the audit. What the others were is named in the marker, never merged;
 *   - only into an EMPTY service state: a service that already holds stores is never overwritten;
 *   - never three files: a refresh token belongs to ONE process (the Playout's `2.9.2` §8), and the
 *     service's Playout and CasparCG come from its own configuration file, not from a console's;
 *   - a marker (`imported-state.json`) is written either way, so it is asked once and never again;
 *   - the source is left exactly as it was.
 */

/** Never copied — see the header. */
export const IMPORT_EXCLUDED = new Set([
  'bridge-session.json',
  'bridge-playout.json',
  'bridge-connection.json',
]);

/** The marker's name, in the service's `.cg-runtime\` (the census reads it from {@link markerPath}). */
export const IMPORT_MARKER = 'bridge-imported-state.json';

/** Where the marker lives — spelled whole, as every store's default is, for the persisted-files census. */
function markerPath(stateHome: string): string {
  return path.join(stateHome, '.cg-runtime', 'bridge-imported-state.json');
}

export interface PerUserState {
  /** `…\AppData\Roaming\CG Control\.cg-runtime`. */
  readonly dir: string;
  /** The newest modification time of any file in it (epoch ms). */
  readonly newestMs: number;
}

/**
 * Every user's `CG Control\.cg-runtime` under a users root (`C:\Users`), newest first. A profile
 * that cannot be read is skipped, never an error: an import is a convenience, not a start condition.
 */
export function findPerUserStates(usersRoot: string): PerUserState[] {
  let users: fs.Dirent[];
  try {
    users = fs.readdirSync(usersRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: PerUserState[] = [];
  for (const user of users) {
    if (!user.isDirectory()) continue;
    const dir = path.join(usersRoot, user.name, 'AppData', 'Roaming', 'CG Control', '.cg-runtime');
    const newestMs = newestFileMs(dir);
    if (newestMs !== null) found.push({ dir, newestMs });
  }
  return found.sort((a, b) => b.newestMs - a.newestMs);
}

export type ImportOutcome =
  | { readonly kind: 'imported'; readonly from: string; readonly files: readonly string[] }
  | { readonly kind: 'already'; readonly marker: string }
  | { readonly kind: 'not-empty' }
  | { readonly kind: 'none' };

/**
 * Import the newest candidate into `<stateHome>\.cg-runtime\`, once. Never deletes, never overwrites.
 */
export function importStateOnce(
  stateHome: string,
  candidates: readonly PerUserState[],
  nowMs: number = Date.now(),
): ImportOutcome {
  const marker = markerPath(stateHome);
  const target = path.dirname(marker);
  if (fs.existsSync(marker)) return { kind: 'already', marker };
  fs.mkdirSync(target, { recursive: true });
  const newest = candidates[0];
  const holdsStores = listFiles(target).some((f) => f !== IMPORT_MARKER);
  const outcome: ImportOutcome =
    newest === undefined
      ? { kind: 'none' }
      : holdsStores
        ? { kind: 'not-empty' }
        : { kind: 'imported', from: newest.dir, files: copyStores(newest.dir, target) };
  writeMarker(marker, {
    at: new Date(nowMs).toISOString(),
    outcome: outcome.kind,
    ...(outcome.kind === 'imported' ? { from: outcome.from, files: outcome.files } : {}),
    ...(candidates.length > 1 ? { notImported: candidates.slice(1).map((c) => c.dir) } : {}),
  });
  return outcome;
}

/** Copy every store under `from` into `to` (recursively), skipping {@link IMPORT_EXCLUDED} and temp files. */
function copyStores(from: string, to: string): string[] {
  const copied: string[] = [];
  for (const rel of listFiles(from)) {
    const base = path.basename(rel);
    if (IMPORT_EXCLUDED.has(base) || base.endsWith('.tmp')) continue;
    const dest = path.join(to, rel);
    if (fs.existsSync(dest)) continue; // never overwrite
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(from, rel), dest, fs.constants.COPYFILE_EXCL);
    copied.push(rel.split(path.sep).join('/'));
  }
  return copied.sort();
}

/** Every file under `dir`, relative to it. */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const child = rel === '' ? e.name : path.join(rel, e.name);
      if (e.isDirectory()) walk(child);
      else if (e.isFile()) out.push(child);
    }
  };
  walk('');
  return out;
}

function newestFileMs(dir: string): number | null {
  let newest: number | null = null;
  for (const rel of listFiles(dir)) {
    try {
      const ms = fs.statSync(path.join(dir, rel)).mtimeMs;
      if (newest === null || ms > newest) newest = ms;
    } catch {
      // Vanished while reading: not a candidate's file any more.
    }
  }
  return newest;
}

function writeMarker(file: string, body: Record<string, unknown>): void {
  const tmp = `${file}.${String(process.pid)}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}
