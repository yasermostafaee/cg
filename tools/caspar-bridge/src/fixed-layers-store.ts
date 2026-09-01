import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type FIXED_LAYERS_SET_CONFIG_REASONS,
  FixedLayerBankSchema,
  fixedBankSlots,
  isLayerVisible,
  lowBankEnd,
  type FixedLayerBank,
} from '@cg/shared-ipc';
import type { LayerPolicy, LayerSlot } from '@cg/caspar-client';

/**
 * R-021 stage 1 / R-028 — validation + bridge-side persistence of the fixed
 * candidate-layer bank (modelled on `connection-store.ts`: atomic tmp+rename
 * write). R-028 made the bank a FIXED CEILING: the count never changes
 * mid-session (`resize-refused`), and the live-change surface is visibility
 * ticks + aliases only, with unticking fail-closed on occupancy.
 *
 * THE CONTRACT: the bank is validated ONCE, loudly, at config time — never
 * adjudicated at Clear/allocation time (design.md's governing principle). The
 * validators are pure and exported so unit tests exercise every refusal, and
 * every refusal carries a machine code plus a message that names what the
 * operator must fix (an overlap names BOTH ranges; an untick refusal names
 * the layer and distinguishes OCCUPIED from UNKNOWN).
 *
 * DELIBERATE DIVERGENCE from connection-store's warn-and-ignore: a fixed-layers
 * file that is PRESENT but unusable (unreadable, bad JSON, schema-invalid) is a
 * HARD startup failure, not a warning. Silently ignoring a declared bank would
 * leave the operator believing a layer is protected/fenced when it is not —
 * exactly the silent config/state divergence design.md (e) refuses. An ABSENT
 * file is the normal no-bank case and changes nothing.
 *
 * DEPLOYMENT INVARIANT (b′, R-021 design): every station sharing one CasparCG
 * MUST declare the SAME fixed bank as this file. b1's confirm-gated Clear is
 * legitimate only under that agreement — a divergent bank makes one station's
 * "fixed layer" another station's dynamic/Live Source layer, recreating the
 * cross-subsystem destruction the disjointness checks below exist to prevent.
 * NOT validatable here: one bridge cannot see another's config (stations share
 * only the CasparCG wire, which carries none), so it is an INSTALLATION
 * requirement — documented for operators in `docs/operator-guide/README.md`
 * ("Fixed layers"), the C-009 operator-contract class.
 */

/**
 * The highest layer a bank may reach.
 *
 * RAISED FROM 89 TO 99 by owner decision, so the operator's candidate bank can be the
 * full 70–99 (thirty rows). design.md (e) recorded 70–89 as the free space because
 * `logo-bug` held 90–99 in the dynamic policy; that range MOVED to 40–49 in the same
 * change (`DEFAULT_LAYER_POLICY`), so 90–99 is genuinely free now rather than merely
 * declared free.
 *
 * The two had to move TOGETHER. Raising this alone would have produced a bank the
 * validator accepts and then refuses on `overlaps-policy`, or — worse, if that check
 * were also weakened — a bank sharing layers with automatic allocation, which is the
 * cross-subsystem destruction the disjointness rules exist to prevent.
 */
export const MAX_FIXED_LAYER = 99;

/**
 * R-021 stage 2a — DERIVED from the wire contract's shared const, so the
 * `fixedLayers.set-config` response's `reason` union and the validator's codes
 * are one definition and cannot drift.
 */
export type FixedLayersErrorCode = (typeof FIXED_LAYERS_SET_CONFIG_REASONS)[number];

/** A refused bank (or bank change). `code` is stable; the message names specifics. */
export class FixedLayersConfigError extends Error {
  override readonly name = 'FixedLayersConfigError';
  constructor(
    readonly code: FixedLayersErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** A fixed-layers file that is present but unusable (hard startup failure — see header). */
export class FixedLayersFileError extends Error {
  override readonly name = 'FixedLayersFileError';
  constructor(
    readonly file: string,
    reason: string,
  ) {
    super(`fixed-layers file ${file} is present but unusable: ${reason}`);
  }
}

export interface ValidateOptions {
  /** The layer policy in force — THE SAME object handed to the LayerManager. */
  policy: LayerPolicy;
  /**
   * R-028 / C-015 — the layers the PLAYOUT system owns, from real config
   * (`reserved-layers-store.ts` / the `--reserved-layers` flag). A non-empty
   * set overlapping the bank is refused (`overlaps-reserved`), naming BOTH
   * ranges — at load and at every change.
   */
  reservedLayers: readonly number[];
}

/**
 * R-028 (2.3) — what the bridge can say about ONE candidate layer when asked
 * whether it may be hidden. `occupied` covers BOTH knowledge sources: the
 * bridge's own records (a bound item / retained intent — valid even with no
 * OSC) and a fresh OSC observation of a producer. `unknown` means occupancy
 * cannot be verified (no healthy primary / the tap has no fresh OSC) — and
 * unknown REFUSES the untick exactly like occupied does (fail closed).
 */
export type SlotOccupancy = 'occupied' | 'empty' | 'unknown';

export interface ValidateChangeOptions extends ValidateOptions {
  /** The occupancy verdict for a slot — see {@link SlotOccupancy}. */
  slotOccupancy: (slot: LayerSlot) => SlotOccupancy;
}

function bankEnd(bank: FixedLayerBank): number {
  return bank.start + bank.count - 1;
}

/**
 * Validate a bank against the ceiling, the dynamic policy ranges, the reserved
 * (C-015) layers, and its own aliases. Returns the bank's slots; throws
 * {@link FixedLayersConfigError} naming the conflict.
 */
export function validateFixedBank(
  bank: FixedLayerBank,
  options: ValidateOptions,
): readonly LayerSlot[] {
  const end = bankEnd(bank);
  const range = `${String(bank.start)}–${String(end)}`;
  if (end > MAX_FIXED_LAYER) {
    throw new FixedLayersConfigError(
      'exceeds-ceiling',
      `fixed bank ${range} exceeds the layer ceiling ${String(MAX_FIXED_LAYER)} — ` +
        `the bank is extendable only up to layer ${String(MAX_FIXED_LAYER)}`,
    );
  }
  for (const [templateType, [low, high]] of Object.entries(options.policy)) {
    if (bank.start <= high && end >= low) {
      throw new FixedLayersConfigError(
        'overlaps-policy',
        `fixed bank ${range} overlaps the '${templateType}' dynamic range ` +
          `${String(low)}–${String(high)} — the two must be disjoint (validated at config ` +
          `load, never adjudicated at Clear time)`,
      );
    }
  }
  const reservedHits = options.reservedLayers.filter((l) => l >= bank.start && l <= end);
  if (reservedHits.length > 0) {
    // R-028 (2.5) — name BOTH ranges: the candidate ceiling AND the declared
    // playout range, so the operator can see which side to move.
    throw new FixedLayersConfigError(
      'overlaps-reserved',
      `candidate layer ceiling ${range} overlaps the reserved playout range ` +
        `${formatRanges(options.reservedLayers)} (C-015) on layer(s) ` +
        `${reservedHits.map(String).join(', ')} — the two must be disjoint; move the ` +
        `ceiling or the reservation`,
    );
  }
  for (const key of Object.keys(bank.aliases ?? {})) {
    const layer = Number(key);
    if (layer < bank.start || layer > end) {
      throw new FixedLayersConfigError(
        'alias-out-of-bank',
        `alias key ${key} is outside the fixed bank ${range}`,
      );
    }
  }
  // R-028 — visibility ticks must name layers of the ceiling, like aliases.
  for (const key of Object.keys(bank.visibility ?? {})) {
    const layer = Number(key);
    if (layer < bank.start || layer > end) {
      throw new FixedLayersConfigError(
        'visibility-out-of-bank',
        `visibility key ${key} is outside the fixed bank ${range}`,
      );
    }
  }
  validateLowBank(bank, options, range);
  return fixedBankSlots(bank);
}

/**
 * `single-clock-look-switch` — the BED half, against everything the operator half is
 * checked against PLUS the operator half itself.
 *
 * Its own ceiling is the schema's (`MAX_LOW_FIXED_LAYER`), so there is no `exceeds-ceiling`
 * arm here: a bed range that ran past 9 could not have parsed. What the schema cannot see
 * is the rest of the installation, and that is exactly what this checks.
 *
 * ⚠ THE ONE RULE THAT IS NOT HERE is "beds sit below the Live Source band", and its
 * absence is deliberate: the bed range is fixed at install while the BAND is edited from
 * the Sources surface, so that relationship is policed by the door the change actually
 * passes through (`validateSourceCatalog`, `low-bank-not-below-band`). Putting a copy here
 * would be a second spelling of one rule — and the copy in the door that cannot fire.
 */
function validateLowBank(bank: FixedLayerBank, options: ValidateOptions, highRange: string): void {
  const lowEnd = lowBankEnd(bank);
  const lowRange = `${String(bank.low.start)}–${String(lowEnd)}`;
  if (bank.low.start <= bankEnd(bank) && lowEnd >= bank.start) {
    throw new FixedLayersConfigError(
      'banks-overlap',
      `the graphics-bed rows ${lowRange} overlap the operator's candidate layer bank ` +
        `${highRange} — a layer cannot be both, because the two answer opposite questions ` +
        `about whether a template composites above the live plates or below them`,
    );
  }
  for (const [templateType, [low, high]] of Object.entries(options.policy)) {
    if (bank.low.start <= high && lowEnd >= low) {
      throw new FixedLayersConfigError(
        'overlaps-policy',
        `the graphics-bed rows ${lowRange} overlap the '${templateType}' dynamic range ` +
          `${String(low)}–${String(high)} — the two must be disjoint`,
      );
    }
  }
  const reservedHits = options.reservedLayers.filter((l) => l >= bank.low.start && l <= lowEnd);
  if (reservedHits.length > 0) {
    throw new FixedLayersConfigError(
      'overlaps-reserved',
      `the graphics-bed rows ${lowRange} overlap the reserved playout range ` +
        `${formatRanges(options.reservedLayers)} (C-015) on layer(s) ` +
        `${reservedHits.map(String).join(', ')} — the two must be disjoint; move the bed rows ` +
        `or the reservation`,
    );
  }
  for (const key of Object.keys(bank.low.aliases ?? {})) {
    const layer = Number(key);
    if (layer < bank.low.start || layer > lowEnd) {
      throw new FixedLayersConfigError(
        'alias-out-of-bank',
        `alias key ${key} is outside the graphics-bed rows ${lowRange}`,
      );
    }
  }
  for (const key of Object.keys(bank.low.visibility ?? {})) {
    const layer = Number(key);
    if (layer < bank.low.start || layer > lowEnd) {
      throw new FixedLayersConfigError(
        'visibility-out-of-bank',
        `visibility key ${key} is outside the graphics-bed rows ${lowRange}`,
      );
    }
  }
}

/** Compress a layer list into human-readable inclusive ranges (`60–69, 105`). */
function formatRanges(layers: readonly number[]): string {
  const sorted = [...new Set(layers)].sort((a, b) => a - b);
  const parts: string[] = [];
  let runStart: number | null = null;
  let prev = Number.NaN;
  for (const layer of sorted) {
    if (runStart === null) {
      runStart = layer;
    } else if (layer !== prev + 1) {
      parts.push(runStart === prev ? String(runStart) : `${String(runStart)}–${String(prev)}`);
      runStart = layer;
    }
    prev = layer;
  }
  if (runStart !== null) {
    parts.push(runStart === prev ? String(runStart) : `${String(runStart)}–${String(prev)}`);
  }
  return parts.join(', ');
}

/**
 * Validate a bank CHANGE against a currently-active bank (R-028): alias and
 * visibility changes are the ONLY live changes. Moving `start` or `channel`
 * mid-session is refused (unchanged from R-021), and the COUNT is now refused
 * too (`resize-refused`) — the candidate ceiling is FIXED at install; a
 * mutable count is exactly what R-028 rejected (design.md §b3). Hiding a row
 * (`visibility` tick going false) is refused while its layer is OCCUPIED and
 * while its occupancy is UNKNOWN — fail closed; unknown is never treated as
 * empty. The two refusals carry DISTINCT codes and messages naming the layer.
 * Returns the NEXT bank's slots.
 */
export function validateFixedBankChange(
  current: FixedLayerBank,
  next: FixedLayerBank,
  options: ValidateChangeOptions,
): readonly LayerSlot[] {
  const slots = validateFixedBank(next, options);
  if (next.start !== current.start) {
    throw new FixedLayersConfigError(
      'renumber-refused',
      `fixed bank start cannot move mid-session (${String(current.start)} → ` +
        `${String(next.start)}) — the candidate ceiling is fixed at install, never renumbered`,
    );
  }
  if (next.channel !== current.channel) {
    throw new FixedLayersConfigError(
      'channel-change-refused',
      `fixed bank channel cannot change mid-session (${String(current.channel)} → ` +
        `${String(next.channel)})`,
    );
  }
  if (next.count !== current.count) {
    throw new FixedLayersConfigError(
      'resize-refused',
      `the candidate layer ceiling cannot change mid-session (${String(current.count)} → ` +
        `${String(next.count)} layers) — it is fixed at install; edit the persisted ` +
        `fixed-layers config and restart the bridge to change it`,
    );
  }
  // R-028 (2.3) — every layer flipping VISIBLE → HIDDEN must be provably
  // empty. Occupied refuses; UNKNOWN refuses too (fail closed): hiding a row
  // that may be on air would leave the operator no surface for a live graphic.
  for (let layer = next.start; layer <= bankEnd(next); layer++) {
    if (!isLayerVisible(current, layer) || isLayerVisible(next, layer)) continue;
    const occupancy = options.slotOccupancy({ channel: next.channel, layer });
    if (occupancy === 'occupied') {
      throw new FixedLayersConfigError(
        'untick-occupied',
        `cannot hide layer ${String(layer)}: it is OCCUPIED (an item or producer is on it) — ` +
          `remove its template first (removal implies clear), then untick`,
      );
    }
    if (occupancy === 'unknown') {
      throw new FixedLayersConfigError(
        'untick-unknown',
        `cannot hide layer ${String(layer)}: its occupancy is UNKNOWN (no healthy CasparCG ` +
          `link or no fresh OSC), and unknown is never treated as empty — a hidden row may ` +
          `be on air. Restore the link/OSC so the layer reads empty, then untick`,
      );
    }
  }
  return slots;
}

/**
 * Load the persisted bank. ABSENT file → null (no bank, byte-identical
 * behaviour to today). PRESENT but unusable → {@link FixedLayersFileError}
 * (hard startup failure — see the module header for why this deliberately
 * diverges from connection-store's warn-and-ignore).
 */
export function loadFixedLayerBank(filePath: string): FixedLayerBank | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new FixedLayersFileError(filePath, err instanceof Error ? err.message : String(err));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new FixedLayersFileError(
      filePath,
      `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const result = FixedLayerBankSchema.safeParse(parsed);
  if (!result.success) {
    throw new FixedLayersFileError(filePath, `schema-invalid: ${result.error.message}`);
  }
  return result.data;
}

/** Atomically persist the bank (mkdir -p + tmp + rename), the connection-store pattern. */
export function saveFixedLayerBank(filePath: string, bank: FixedLayerBank): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(bank, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}
