import * as fs from 'node:fs';
import * as path from 'node:path';
import { EMPTY_SOURCE_CATALOG, SourceCatalogSchema, type SourceCatalog } from '@cg/shared-ipc';

/**
 * D-137 / C-015 phase 4 — the SOURCE CATALOG store: bridge-side loading,
 * validation and persistence of the installation's LIST of lives (each with its
 * own generated id, its human NAME and its producer definition), and of the
 * layer band those producers are placed on.
 *
 * ⚠ It is the INSTALLATION half alone. Which template plate USES which of these
 * lives is the other store — `source-assignments-store.ts`, beside the template
 * registry — because that is the half the bridge resolves at take. The two are
 * deliberately independent: the catalog is built with no reference to any
 * template, and one operator action joins them.
 *
 * Written as MODULE FUNCTIONS rather than a class, deliberately, because it
 * follows `fixed-layers-store.ts` in every respect that matters here: the value
 * in force is held by `CasparRuntime` beside the other config it owns, and
 * `bridge.ts` persists after a successful apply (the R-010 order — validate →
 * apply → persist → publish).
 *
 * This module is the FILE half alone. What a LEGAL catalog is lives in
 * `@cg/shared-ipc` (`validateSourceCatalog`), so the bridge and the offline mock
 * cannot come to refuse different things — only the filesystem half needs a
 * filesystem.
 *
 * ── 🔴 THE ABSENT FILE IS A SAFETY PROPERTY, NOT A CONVENIENCE ──────────────
 *
 * An ABSENT file means NO SOURCES and there is NO BUILT-IN DEFAULT. This
 * diverges from `fixed-layers-store.ts`, whose absent file means the built-in
 * 70–99 bank, and the divergence is the whole point: a default BANK is a guess
 * about our own layer numbering, while a default INPUT DEFINITION is a guess
 * about hardware nobody in this project can see. A wrong guess there puts the
 * wrong camera behind a guest's frame — silently, and on air.
 *
 * A PRESENT but unusable file is a HARD BOOT FAILURE, for the same reason and
 * one step harder: a PARTIALLY parsed catalog is worse than none. Dropping the
 * unreadable half would boot a station that defines three of its four lives and
 * says nothing about the fourth.
 *
 * ── ⚠ WHERE THE FILE LIVES ─────────────────────────────────────────────────
 *
 * NOT in `templatesDir`. `TemplateRegistry.loadPersisted` reads EVERY `*.json`
 * there as a template (`template-registry.ts:75,87` — a bare `.endsWith('.json')`
 * include-filter is the only filter there is), so a config file placed beside
 * the templates becomes a "skipping unusable persisted template" warning on
 * every boot. That is B-116, already filed for `delimiters.json` landing in the
 * same trap, and this file does not repeat it: it is resolved from its own
 * `--source-catalog-path` flag, defaulting to
 * `~/.cg-runtime/bridge-source-catalog.json`.
 */

/**
 * The VALIDATION lives in `@cg/shared-ipc` (`validateSourceCatalog`), not here,
 * so the bridge and the offline mock share ONE implementation of what a legal
 * catalog is. Re-exported for the callers that already reach for this module.
 */
export {
  SourceCatalogConfigError,
  validateSourceCatalog,
  type SourcesSetConfigReason as SourceCatalogErrorCode,
} from '@cg/shared-ipc';

/** A catalog file that is present but unusable (hard startup failure — see the header). */
export class SourceCatalogFileError extends Error {
  override readonly name = 'SourceCatalogFileError';
  constructor(
    readonly file: string,
    reason: string,
  ) {
    super(`source-catalog file ${file} is present but unusable: ${reason}`);
  }
}

/**
 * Load the persisted catalog. ABSENT file → `null`, which the caller reads as NO
 * SOURCES (never as a default). PRESENT but unusable →
 * {@link SourceCatalogFileError}, a hard startup failure.
 */
export function loadSourceCatalog(filePath: string): SourceCatalog | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new SourceCatalogFileError(filePath, err instanceof Error ? err.message : String(err));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new SourceCatalogFileError(
      filePath,
      `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const result = SourceCatalogSchema.safeParse(parsed);
  if (!result.success) {
    throw new SourceCatalogFileError(filePath, `schema-invalid: ${result.error.message}`);
  }
  return result.data;
}

/** Atomically persist the catalog (mkdir -p + tmp + rename), the store precedent. */
export function saveSourceCatalog(filePath: string, value: SourceCatalog): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

/**
 * WHERE the catalog in force came from — named in the CLI's boot line.
 *
 * `absent` is the ordinary un-configured station and is NOT an error; `none` is
 * the embedder case (no path configured at all). The two are held apart because
 * only one of them has a file the operator can go and write.
 */
export type SourceCatalogSource = 'explicit' | 'file' | 'absent' | 'none';

/**
 * THE boot precedence, in one place, mirroring `resolveFixedBank` — EXCEPT for
 * the last step, which is the whole doctrine: there is no built-in default, so
 * the fall-through is the EMPTY catalog.
 *
 *   1. an explicit in-process value (tests, embedders);
 *   2. the persisted file (present-but-unusable is still a hard failure);
 *   3. NOTHING — `{ sources: [] }`, and no plate can be assigned.
 */
export function resolveSourceCatalog(options: {
  sourceCatalog?: SourceCatalog;
  sourceCatalogPath?: string;
}): { value: SourceCatalog; source: SourceCatalogSource } {
  if (options.sourceCatalog !== undefined) {
    return { value: options.sourceCatalog, source: 'explicit' };
  }
  if (options.sourceCatalogPath === undefined) {
    return { value: EMPTY_SOURCE_CATALOG, source: 'none' };
  }
  const persisted = loadSourceCatalog(options.sourceCatalogPath);
  return persisted !== null
    ? { value: persisted, source: 'file' }
    : { value: EMPTY_SOURCE_CATALOG, source: 'absent' };
}
