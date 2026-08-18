import * as fs from 'node:fs';
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
