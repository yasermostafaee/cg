import * as fs from 'node:fs';
import * as path from 'node:path';
import { FixedLayerBankSchema, type FixedLayerBank } from '@cg/shared-ipc';
import type { LayerPolicy, LayerSlot } from '@cg/caspar-client';

/**
 * R-021 stage 1 — validation + bridge-side persistence of the fixed operator
 * layer bank (modelled on `connection-store.ts`: atomic tmp+rename write).
 *
 * THE CONTRACT: the bank is validated ONCE, loudly, at config time — never
 * adjudicated at Clear/allocation time (design.md's governing principle). The
 * validators are pure and exported so unit tests exercise every refusal, and
 * every refusal carries a machine code plus a message that names what the
 * operator must fix (a1/e1: an overlap names BOTH ranges; a refused shrink
 * names the occupied slot NUMBERS).
 *
 * DELIBERATE DIVERGENCE from connection-store's warn-and-ignore: a fixed-layers
 * file that is PRESENT but unusable (unreadable, bad JSON, schema-invalid) is a
 * HARD startup failure, not a warning. Silently ignoring a declared bank would
 * leave the operator believing a layer is protected/fenced when it is not —
 * exactly the silent config/state divergence design.md (e) refuses. An ABSENT
 * file is the normal no-bank case and changes nothing.
 */

/** The highest layer a bank may reach (design.md (e): 70–89 is the free space). */
export const MAX_FIXED_LAYER = 89;

export type FixedLayersErrorCode =
  | 'exceeds-ceiling'
  | 'overlaps-policy'
  | 'overlaps-reserved'
  | 'alias-out-of-bank'
  | 'renumber-refused'
  | 'channel-change-refused'
  | 'shrink-occupied';

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
   * Layers reserved by other subsystems on the bank's channel. C-015's Live
   * Source layer plan is the future provider; the bridge passes `[]` until it
   * exists. A non-empty set overlapping the bank is refused (a1).
   */
  reservedLayers: readonly number[];
}

export interface ValidateChangeOptions extends ValidateOptions {
  /** True when the slot currently holds a resident item or retained intent. */
  isSlotBusy: (slot: LayerSlot) => boolean;
}

function bankEnd(bank: FixedLayerBank): number {
  return bank.start + bank.count - 1;
}

function bankSlots(bank: FixedLayerBank): readonly LayerSlot[] {
  const out: LayerSlot[] = [];
  for (let layer = bank.start; layer <= bankEnd(bank); layer++) {
    out.push({ channel: bank.channel, layer });
  }
  return out;
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
    throw new FixedLayersConfigError(
      'overlaps-reserved',
      `fixed bank ${range} overlaps reserved (Live Source, C-015) layer(s) ` +
        `${reservedHits.map(String).join(', ')} — the two must be disjoint`,
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
  return bankSlots(bank);
}

/**
 * Validate a bank CHANGE against a currently-active bank (design.md (e)):
 * grow-at-end within the ceiling and alias changes are accepted; moving
 * `start` or `channel` mid-session is refused; a shrink is refused while any
 * removed slot is busy (resident item / retained intent) — the error names the
 * occupied slot numbers. Returns the NEXT bank's slots.
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
        `${String(next.start)}) — the bank is extendable only at the end, never renumbered`,
    );
  }
  if (next.channel !== current.channel) {
    throw new FixedLayersConfigError(
      'channel-change-refused',
      `fixed bank channel cannot change mid-session (${String(current.channel)} → ` +
        `${String(next.channel)})`,
    );
  }
  if (next.count < current.count) {
    const removed: LayerSlot[] = [];
    for (let layer = bankEnd(next) + 1; layer <= bankEnd(current); layer++) {
      removed.push({ channel: current.channel, layer });
    }
    const busy = removed.filter((s) => options.isSlotBusy(s)).map((s) => s.layer);
    if (busy.length > 0) {
      throw new FixedLayersConfigError(
        'shrink-occupied',
        `fixed bank shrink refused: slot(s) ${busy.map(String).join(', ')} still hold a ` +
          `resident item or retained intent — clear them first (a pending shrink is invisible ` +
          `state; config never silently diverges from reality)`,
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
