import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EMPTY_SOURCE_ASSIGNMENTS,
  SourceAssignmentsSchema,
  type SourceAssignments,
} from '@cg/shared-ipc';

/**
 * D-137 / C-015 phase 4 — the ASSIGNMENTS store: which catalog entry each
 * template's each PLATE uses.
 *
 * ── WHY IT IS A SECOND STORE, BRIDGE-SIDE ───────────────────────────────────
 *
 * The catalog is what the INSTALLATION has; this is what a TEMPLATE uses. They
 * are independent by design (the reshape's whole point — a plate is bound by a
 * deliberate operator action, never by a name match against an id the author
 * guessed), and they are separate stores because they have different lifetimes:
 * a live outlives every template that ever pointed at it, and a template is
 * removed without retiring the studio it was showing.
 *
 * It lives BESIDE THE TEMPLATE REGISTRY, on the bridge, because the bridge is
 * what resolves a plate to a producer at take. A browser-local assignment would
 * mean the console that bound the plate is the only console that can take the
 * item — while every other console in the gallery is looking at the same rundown.
 *
 * Same discipline as the catalog store in every respect that matters: module
 * functions, atomic mkdir → tmp → rename, ABSENT ⇒ nothing assigned with no
 * built-in default, PRESENT but unusable ⇒ hard boot failure, and the legality
 * rule itself (`validateSourceAssignments`) in `@cg/shared-ipc` so the bridge
 * and the offline mock share one definition.
 *
 * ── ⚠ WHERE THE FILE LIVES ─────────────────────────────────────────────────
 *
 * NOT in `templatesDir`, and the trap is closer here than for any other config
 * because this file is ABOUT templates: `TemplateRegistry.loadPersisted` reads
 * EVERY `*.json` there as a template (`template-registry.ts:75,87` — a bare
 * `.endsWith('.json')` include-filter is the only filter there is), so a file
 * placed beside the templates becomes a "skipping unusable persisted template"
 * warning on every boot (B-116). It is resolved from its own
 * `--source-assignments-path` flag, defaulting to
 * `~/.cg-runtime/bridge-source-assignments.json`.
 *
 * ── 🔴 A DANGLING ASSIGNMENT IS PRUNED, NOT A BOOT FAILURE ──────────────────
 *
 * An assignment naming a source the catalog does not define is NOT a hard boot
 * failure, and the difference from the unusable-file rule above is real rather
 * than a softening: an unparseable file has NO reading, while a dangling
 * reference has a perfectly clear one — that plate is unassigned, and an
 * unassigned plate already refuses its take legibly. Two hand-editable files
 * restored apart is an ordinary way to reach that state, and refusing to boot
 * the whole bridge over it would take a station off air to protect it from a
 * plate that was already safe. `pruneAssignmentsForCatalog` does the dropping
 * (ONE implementation, shared with the delete cascade) and the caller says so
 * loudly on stderr.
 */

/**
 * The VALIDATION and the PRUNE both live in `@cg/shared-ipc`, not here, so the
 * bridge and the offline mock share ONE implementation. Re-exported for the
 * callers that already reach for this module.
 */
export {
  SourceAssignmentsConfigError,
  pruneAssignmentsForCatalog,
  validateSourceAssignments,
  type SourcesSetAssignmentsReason as SourceAssignmentsErrorCode,
} from '@cg/shared-ipc';

/** An assignments file that is present but unusable (hard startup failure — see the header). */
export class SourceAssignmentsFileError extends Error {
  override readonly name = 'SourceAssignmentsFileError';
  constructor(
    readonly file: string,
    reason: string,
  ) {
    super(`source-assignments file ${file} is present but unusable: ${reason}`);
  }
}

/**
 * Load the persisted assignments. ABSENT file → `null`, which the caller reads
 * as NOTHING ASSIGNED. PRESENT but unusable → {@link SourceAssignmentsFileError},
 * a hard startup failure.
 */
export function loadSourceAssignments(filePath: string): SourceAssignments | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new SourceAssignmentsFileError(
      filePath,
      err instanceof Error ? err.message : String(err),
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new SourceAssignmentsFileError(
      filePath,
      `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const result = SourceAssignmentsSchema.safeParse(parsed);
  if (!result.success) {
    throw new SourceAssignmentsFileError(filePath, `schema-invalid: ${result.error.message}`);
  }
  return result.data;
}

/** Atomically persist the assignments (mkdir -p + tmp + rename), the store precedent. */
export function saveSourceAssignments(filePath: string, value: SourceAssignments): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

/** WHERE the assignments in force came from — named in the CLI's boot line. */
export type SourceAssignmentsSource = 'explicit' | 'file' | 'absent' | 'none';

/**
 * THE boot precedence, mirroring {@link resolveSourceCatalog}: an explicit
 * in-process value, then the persisted file, then NOTHING ASSIGNED.
 */
export function resolveSourceAssignments(options: {
  sourceAssignments?: SourceAssignments;
  sourceAssignmentsPath?: string;
}): { value: SourceAssignments; source: SourceAssignmentsSource } {
  if (options.sourceAssignments !== undefined) {
    return { value: options.sourceAssignments, source: 'explicit' };
  }
  if (options.sourceAssignmentsPath === undefined) {
    return { value: EMPTY_SOURCE_ASSIGNMENTS, source: 'none' };
  }
  const persisted = loadSourceAssignments(options.sourceAssignmentsPath);
  return persisted !== null
    ? { value: persisted, source: 'file' }
    : { value: EMPTY_SOURCE_ASSIGNMENTS, source: 'absent' };
}
