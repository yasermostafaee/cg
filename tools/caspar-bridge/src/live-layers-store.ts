import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  PersistedLiveLayersSchema,
  fromPersistedLiveLayers,
  toPersistedLiveLayers,
  type LiveLayerLedger,
} from './live-layers.js';

/**
 * B-145 — bridge-side persistence of the LIVE LAYER LEDGER.
 *
 * `#liveLayers` was process memory with release on `stopItem` / `out` / `remove` and on no
 * other path — not on disconnect, not on restart. So a bridge restart lost the ledger while
 * the CasparCG producers kept running: the layers stayed lit and **nothing in the product
 * could name them, clear them or re-adopt them.** A live guest on air with no handle to it.
 *
 * ── 🔴 WHY THIS FILE FAILS *SOFT* WHERE ITS SIBLINGS FAIL HARD ──────────────
 *
 * `reserved-layers-store.ts` and `fixed-layers-store.ts` treat a file that is PRESENT but
 * unusable as a **hard startup failure**, and they are right to: booting with an empty
 * reservation while the operator believes the playout range is fenced can put one of our
 * graphics on top of the company's playout output. The danger is in proceeding.
 *
 * **Here the danger runs the other way.** An empty ledger is exactly the behaviour that
 * shipped before this item — it is the bug, not a hazard the bridge must refuse to boot
 * into. Refusing to start because a bookkeeping file is malformed would take the WHOLE
 * console off the air to avoid a degradation the console lived with for months. So an
 * unusable file is reported loudly and treated as ABSENT, and the bridge boots knowing
 * nothing — no worse than yesterday, and it says so.
 *
 * ⚠ The asymmetry is deliberate and is the kind that gets "tidied" into consistency by a
 * later reader. It is written down here so that reader can see the two failure modes are
 * not the same shape.
 */

/** Why a ledger file could not be used. Reported, never thrown. */
export interface LiveLayersLoadProblem {
  readonly file: string;
  readonly reason: string;
}

export interface LiveLayersLoadResult {
  /** The persisted ledger, or `null` for an absent (or unusable) file. */
  readonly ledger: LiveLayerLedger | null;
  /** Set when a file was present but could not be used — see the header. */
  readonly problem?: LiveLayersLoadProblem;
}

/**
 * Load the persisted ledger. ABSENT → `{ ledger: null }` (the normal first-boot case).
 * PRESENT but unusable → `{ ledger: null, problem }` — never a throw.
 */
export function loadPersistedLiveLayers(filePath: string): LiveLayersLoadResult {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ledger: null };
    return {
      ledger: null,
      problem: { file: filePath, reason: err instanceof Error ? err.message : String(err) },
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ledger: null,
      problem: {
        file: filePath,
        reason: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
  const result = PersistedLiveLayersSchema.safeParse(parsed);
  if (!result.success) {
    return { ledger: null, problem: { file: filePath, reason: result.error.message } };
  }
  return { ledger: fromPersistedLiveLayers(result.data) };
}

/**
 * Write the ledger.
 *
 * ⚠ **Written via a temp file and renamed**, because the failure this item exists to fix is
 * a bridge that stopped without warning. A half-written JSON file is precisely what a
 * process killed mid-write leaves behind, and `rename` is atomic on both platforms this
 * runs on — so the file on disk is always a whole ledger or the previous whole ledger,
 * never a torn one.
 */
export function savePersistedLiveLayers(filePath: string, ledger: LiveLayerLedger): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(toPersistedLiveLayers(ledger), null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

// ─────────────────────── WHERE THE LEDGER LIVES BY DEFAULT ───────────────────────

/**
 * 🔴 **B-145 completion — persistence is ON by default, and OFF is a thing you SAY.**
 *
 * The first cut of this item shipped the store behind a `liveLayersPath` option that
 * nothing defaulted, so a station that never configured it still lost its ledger — a
 * safety mechanism defaulting to off is a safety mechanism the station does not have.
 * Worse, the tests passed either way, so nothing would have caught the default drifting
 * back. That is the same class as `autoSqueeze`'s reader-less schema field (`B-147`) and
 * `resolvePlateAspect`'s zero-reader `assumed` flag (`B-143`): written, unreachable.
 *
 * ── WHY THE DEFAULT IS RESOLVED HERE AND APPLIED BY THE CLI, NOT BY `createBridge` ──
 *
 * The repo has already decided this exact question, out loud, in a test:
 * `tests/default-bank-boot.integration.test.ts:164` — *"`createBridge({})` is not a
 * station. The default applies to a CONFIGURED location that holds no file, which is what
 * every real install has."* Every sibling store (connection, fixed bank, reserved layers,
 * templates, source catalog, assignments, audit log) follows it: the default path is
 * applied by `bin/caspar-bridge.mjs`, which is what a station actually runs.
 *
 * There is a second, concrete reason not to default inside `createBridge`: ~40 tests
 * construct a bridge with no paths at all. Defaulting there would have every one of them
 * READ the developer's real `~/.cg-runtime/bridge-live-layers.json` — and any test that
 * seats or releases a live layer would WRITE it, clobbering a running station's ledger
 * from a unit test.
 *
 * ⚠ What the first cut got wrong was not the layer — it was that the default did not
 * exist at all, and that its absence was untestable because it lived in an inline
 * `path.join` inside a `.mjs` script no test could reach. So the resolution lives HERE,
 * as one exported function, and `live-layers-default.test.ts` holds it to its answer.
 */

/** The station-standard location: the same `~/.cg-runtime/bridge-*.json` shape as every sibling store. */
export function defaultLiveLayersPath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, '.cg-runtime', 'bridge-live-layers.json');
}

/**
 * What a caller may say about persistence. `false` is the ONLY way to switch it off —
 * absence means "not configured", and not-configured must never mean "unprotected".
 */
export type LiveLayersPathOption = string | false;

/**
 * Resolve the configured option to the path the bridge should use, or `null` for a
 * deliberate OFF.
 *
 * - `undefined` (said nothing) → the station default. **Persistence is on.**
 * - `false` (said "off")       → `null`. Explicit, and reported at boot as a choice.
 * - a string                   → exactly that path.
 */
export function resolveLiveLayersPath(
  configured: LiveLayersPathOption | undefined,
  homeDir: string = os.homedir(),
): string | null {
  if (configured === false) return null;
  if (typeof configured === 'string') return configured;
  return defaultLiveLayersPath(homeDir);
}
