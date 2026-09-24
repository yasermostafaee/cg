import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type FIXED_LAYERS_SET_CONFIG_REASONS,
  bankForChannel,
  FixedLayerBankSchema,
  FixedLayerBanksSchema,
  fixedBankEnd,
  fixedBankSlots,
  isLayerVisible,
  lowBankEnd,
  LAYER_BANDS,
  bandText,
  sortBanks,
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
 * The highest layer a bank may reach — the top of the TEMPLATE band.
 *
 * ⚠ **DERIVED, not restated (`LAYER-BANDS-16`, 2026-09-14).** The value is unchanged at
 * 99; what changed is that it is now the same 99 `LAYER_BANDS.template.end` is, so a re-cut
 * of the map moves the ceiling with it. It was a bare literal before, and a bare literal
 * here is a ceiling that survives a renumbering of the band it is supposed to be the top of.
 */
export const MAX_FIXED_LAYER = LAYER_BANDS.template.end;

/**
 * 🔴 **THE OLD-MAP DECISION: a fixed-layers file written under the pre-2026-09-14 map is
 * REFUSED, out loud, naming both maps.**
 *
 * The choice was refuse / ignore / rewrite, and refuse is the only one of the three that
 * cannot put a graphic somewhere nobody asked for. IGNORING it would silently discard an
 * operator's aliases and ticks and boot on a bank they did not declare. REWRITING it would
 * have this process guess which of the old rows map onto which of the new ones — a 30-row
 * bank onto a 20-row band has no answer, and a wrong guess is a named row pointing at a
 * different layer, discovered on air.
 *
 * Most old files are caught by the SCHEMA first (`count: 30` exceeds the band's twenty), and
 * a bare zod error names a field rather than the decision. This turns whichever way it is
 * caught into one sentence, so the operator is told to move the file aside rather than left
 * reading a parse failure. The remedy is the same in both directions: the file is renamed,
 * the built-in default applies, and the aliases are re-entered against the new rows.
 */
export function describeOldMapBank(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const low =
    typeof record['low'] === 'object' && record['low'] !== null
      ? (record['low'] as Record<string, unknown>)
      : null;
  const start = record['start'];
  const lowStart = low?.['start'];
  const offenders: string[] = [];
  if (typeof start === 'number' && start < LAYER_BANDS.template.start) {
    offenders.push(
      `its operator rows start at layer ${String(start)}, below the template band ` +
        `${bandText(LAYER_BANDS.template)}`,
    );
  }
  if (typeof lowStart === 'number' && lowStart < LAYER_BANDS.bed.start) {
    offenders.push(
      `its graphics-bed rows start at layer ${String(lowStart)}, below the bed band ` +
        `${bandText(LAYER_BANDS.bed)}`,
    );
  }
  if (offenders.length === 0) return null;
  return (
    `it was written under the OLD layer map — ${offenders.join(' and ')}. The map was ` +
    `re-cut on 2026-09-14 to beds ${bandText(LAYER_BANDS.bed)}, live plates ` +
    `${bandText(LAYER_BANDS.plate)} and templates ${bandText(LAYER_BANDS.template)}, ` +
    `leaving 1-${String(LAYER_BANDS.bed.start - 1)} free for the playout server. Two maps ` +
    `are never mixed: move this file aside (rename it, do not delete it) and the built-in ` +
    `default bank applies, then re-enter the aliases and ticks against the new rows`
  );
}

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
  /**
   * `DESKTOP-APPS-01-D` e — does anything of OURS still hold air on this channel (on air,
   * unsettled or unverified, or a producer resident)? The one condition under which the bank's
   * channel may NOT be replaced. Absent means "cannot tell", which refuses — fail closed.
   */
  channelHoldsOurAir?: (channel: number) => boolean;
}

/** `DESKTOP-APPS-01-D` e — the one sentence a refused channel change says. */
export function channelChangeRefusal(channel: number): string {
  return `Something of ours is still on air on channel ${String(channel)} — take it off air first.`;
}

/**
 * Validate a bank against the ceiling, the dynamic policy ranges, the reserved
 * (C-015) layers, and its own aliases. Returns the bank's slots; throws
 * {@link FixedLayersConfigError} naming the conflict.
 *
 * The operator half's end is `fixedBankEnd` from `@cg/shared-ipc` — this module
 * used to carry a local `bankEnd` that restated it (`P-039`'s guard flagged it),
 * and a local copy of the derivation is exactly how `B-205` came to exist.
 */
export function validateFixedBank(
  bank: FixedLayerBank,
  options: ValidateOptions,
): readonly LayerSlot[] {
  const end = fixedBankEnd(bank);
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
  if (bank.low.start <= fixedBankEnd(bank) && lowEnd >= bank.start) {
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
 * visibility changes are live, and so — since `DESKTOP-APPS-01-D` e — is the CHANNEL, under
 * one condition. Moving `start` mid-session is refused (unchanged from R-021), and the COUNT is now refused
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
  /*
    🔴 `DESKTOP-APPS-01-D` e — **THE CHANNEL MAY BE REPLACED WHEN NOTHING OF OURS HOLDS AIR ON IT.**

    It used to be refused outright ("fixed at install"), and the owner's installed station, set up
    by mistake on the Playout's programme channel, had no way back that did not need a file edit.
    The rule that allows it now: a station-admin's `fixedLayers.set-config` may REPLACE the channel
    while no item of ours on the current channel is on air, unsettled, unverified or holding a
    resident producer (`channelHoldsOurAir`). The refusal it keeps is the one that protects air: a
    channel changed under a live graphic would strand that graphic on a channel no row shows.
    The station stays single-channel — `MULTI-CHANNEL-01` widens it to a set.
  */
  if (next.channel !== current.channel) {
    const holdsAir = options.channelHoldsOurAir?.(current.channel) ?? true;
    if (holdsAir) {
      throw new FixedLayersConfigError(
        'channel-change-refused',
        channelChangeRefusal(current.channel),
      );
    }
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
  //
  // 🔴 `B-205` — EVERY layer means BOTH halves. This walked `next.start …
  // bankEnd(next)`, the operator half, so a bed row could be hidden with the tap
  // blind — "we do not know" is precisely the state this rule refuses to let
  // anyone hide, and it was hideable on every bed row. The rows come from
  // `fixedBankSlots`, the ONE function that returns the bank's range; a second
  // derivation here is how the gate came to cover half of what its name claims.
  for (const { layer } of fixedBankSlots(next)) {
    if (!isLayerVisible(current, layer) || isLayerVisible(next, layer)) continue;
    assertMayHide(layer, options.slotOccupancy({ channel: next.channel, layer }));
  }
  return slots;
}

/**
 * R-028 (2.3) — **MAY THIS ROW BE HIDDEN?** Only while its layer is provably EMPTY. The ONE
 * spelling of both refusals, asked by a change ({@link validateFixedBankChange}) and by a bank
 * installed live ({@link validateFixedBankInstall}) — the second lived in the runtime as its own
 * copy of the same two sentences until `MULTI-CHANNEL-01` needed it for every added channel.
 */
function assertMayHide(layer: number, occupancy: SlotOccupancy): void {
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

/**
 * A bank INSTALLED LIVE — on a bridge that declared nothing on its channel. Validated like a
 * load (`validateFixedBank`), PLUS the fail-closed untick rule, which `validateFixedBank` alone
 * cannot carry: the BOOT path shares it, and at boot occupancy is always unknown (the persisted
 * ticks were adjudicated when applied). A live install that arrives with rows already hidden must
 * not slip an occupied or unverifiable layer out of sight in one step.
 *
 * 🔴 `B-205` — BOTH halves, through `fixedBankSlots`, the one enumeration of a bank's range.
 */
export function validateFixedBankInstall(
  bank: FixedLayerBank,
  options: ValidateChangeOptions,
): readonly LayerSlot[] {
  const slots = validateFixedBank(bank, options);
  for (const { layer } of fixedBankSlots(bank)) {
    if (isLayerVisible(bank, layer)) continue;
    assertMayHide(layer, options.slotOccupancy({ channel: bank.channel, layer }));
  }
  return slots;
}

/**
 * 🔴 `MULTI-CHANNEL-01` — **THE STATION'S SET OF BANKS, validated at boot:** every bank against
 * everything {@link validateFixedBank} checks. One bank per channel is the schema's rule
 * (`FixedLayerBanksSchema`), and two banks on different channels cannot collide on a coordinate,
 * so there is no cross-bank rule beyond it. Returns every bank's slots, in channel order.
 */
export function validateFixedBanks(
  banks: readonly FixedLayerBank[],
  options: ValidateOptions,
): readonly LayerSlot[] {
  return sortBanks(banks).flatMap((bank) => [...validateFixedBank(bank, options)]);
}

/**
 * 🔴 `MULTI-CHANNEL-01` — **A CHANGE TO THE STATION'S SET OF BANKS, validated per channel.**
 *
 *   - a channel in BOTH sets — {@link validateFixedBankChange}, unchanged: `start` and `count` are
 *     fixed at install, and a row may be hidden only while it is provably empty;
 *   - a channel only in `next` — ADDED: {@link validateFixedBankInstall}, as a bank installed on a
 *     bank-less bridge is;
 *   - a channel only in `current` — REMOVED: refused while anything of ours holds air on it
 *     (`channel-change-refused`, `B-269`'s own sentence). The refusal a replaced channel has
 *     always had, and for the same reason: a declaration withdrawn under a live graphic would
 *     strand that graphic on a channel no row shows. Absent `channelHoldsOurAir` refuses — fail
 *     closed, as the single-bank rule does.
 *
 * Nothing about the SET is re-derived from a bank: which channels it declares is exactly the list
 * of their `channel` fields. Returns the next set's slots.
 */
export function validateFixedBanksChange(
  current: readonly FixedLayerBank[],
  next: readonly FixedLayerBank[],
  options: ValidateChangeOptions,
): readonly LayerSlot[] {
  const slots: LayerSlot[] = [];
  for (const bank of sortBanks(next)) {
    const before = bankForChannel(current, bank.channel);
    slots.push(
      ...(before !== null
        ? validateFixedBankChange(before, bank, options)
        : validateFixedBankInstall(bank, options)),
    );
  }
  for (const before of sortBanks(current)) {
    if (bankForChannel(next, before.channel) !== null) continue;
    if (options.channelHoldsOurAir?.(before.channel) ?? true) {
      throw new FixedLayersConfigError(
        'channel-change-refused',
        channelChangeRefusal(before.channel),
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
  const parsed = readFixedLayersJson(filePath);
  return parsed === ABSENT ? null : parseBankRecord(filePath, parsed);
}

/** A file that is not there — the normal no-bank case. */
const ABSENT = Symbol('absent');

/** Read and JSON-parse the file, or {@link ABSENT}; present-but-unusable throws. */
function readFixedLayersJson(filePath: string): unknown {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return ABSENT;
    throw new FixedLayersFileError(filePath, err instanceof Error ? err.message : String(err));
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    throw new FixedLayersFileError(
      filePath,
      `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** ONE bank record, through the old-map sentence and the schema. */
function parseBankRecord(filePath: string, parsed: unknown): FixedLayerBank {
  // `LAYER-BANDS-16` — the OLD-MAP check runs BEFORE the schema and again after it, and
  // both doors are needed. A pre-2026-09-14 file usually trips the schema first (thirty
  // operator rows exceed the template band's twenty, a bed at layer 1 is below the band's
  // floor), and a bare zod message names a field where the operator needs the decision; but
  // an old file whose bank happens to be schema-legal — a four-row bank at 70 — would sail
  // straight through, so the same sentence is the FIRST thing tried.
  const oldMap = describeOldMapBank(parsed);
  if (oldMap !== null) {
    throw new FixedLayersFileError(filePath, oldMap);
  }
  const result = FixedLayerBankSchema.safeParse(parsed);
  if (!result.success) {
    throw new FixedLayersFileError(filePath, `schema-invalid: ${result.error.message}`);
  }
  return result.data;
}

/**
 * 🔴 `MULTI-CHANNEL-01` — **THE STATION'S BANKS FROM THE PERSISTED FILE**, in channel order.
 * ABSENT → `null`, exactly as {@link loadFixedLayerBank}.
 *
 * Two shapes, both read:
 *
 *   - **v1 — ONE bank object.** Every file written before this change, and every file a
 *     one-channel station still writes. It is a SHIPPED format — the owner's `~/.cg-runtime` and
 *     CG Control's own state are v1 — so it reads as a one-entry list rather than failing:
 *     `P-031`'s floor owes nothing to unshipped formats, and this one shipped.
 *   - **`{ "banks": [ … ] }`** — two or more channels.
 *
 * Every entry passes the same old-map sentence and the same schema a v1 file does, and the list
 * passes `FixedLayerBanksSchema` (one bank per channel). Anything else is the existing HARD boot
 * failure: a declared bank silently ignored would leave the operator believing a layer is fenced
 * when it is not.
 */
export function loadFixedLayerBanks(filePath: string): FixedLayerBank[] | null {
  const parsed = readFixedLayersJson(filePath);
  if (parsed === ABSENT) return null;
  if (!isBanksEnvelope(parsed)) return [parseBankRecord(filePath, parsed)];
  const banks = parsed.banks.map((entry) => parseBankRecord(filePath, entry));
  const listed = FixedLayerBanksSchema.safeParse(banks);
  if (!listed.success) {
    throw new FixedLayersFileError(filePath, `schema-invalid: ${listed.error.message}`);
  }
  if (listed.data.length === 0) {
    throw new FixedLayersFileError(
      filePath,
      'it declares no channel — a station with a fixed-layers file declares at least one',
    );
  }
  return sortBanks(listed.data);
}

/** The plural file's shape: an object carrying `banks` and no bank of its own. */
function isBanksEnvelope(parsed: unknown): parsed is { banks: unknown[] } {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;
  const record = parsed as Record<string, unknown>;
  return Array.isArray(record['banks']) && !('channel' in record);
}

/** Atomically persist the bank (mkdir -p + tmp + rename), the connection-store pattern. */
export function saveFixedLayerBank(filePath: string, bank: FixedLayerBank): void {
  writeFixedLayersFile(filePath, bank);
}

/**
 * 🔴 `MULTI-CHANNEL-01` — persist the station's banks. **ONE bank is written as the v1 object,
 * byte for byte** — a one-channel station's file is exactly what it was, and an older build can
 * still read it. Two or more are written as `{ "banks": [ … ] }`, in channel order.
 *
 * An EMPTY set is refused rather than written: no door can produce one (`set-banks` requires a
 * bank, `set-config` carries one), and a file declaring nothing would boot as channel 1 by
 * default — which may be somebody else's programme output.
 */
export function saveFixedLayerBanks(filePath: string, banks: readonly FixedLayerBank[]): void {
  const sorted = sortBanks(banks);
  const only = sorted.length === 1 ? sorted[0] : undefined;
  if (sorted.length === 0) {
    throw new Error('refusing to persist a fixed-layers file that declares no channel');
  }
  writeFixedLayersFile(filePath, only ?? { banks: sorted });
}

/** mkdir -p + tmp + rename — the connection-store pattern, for either shape. */
function writeFixedLayersFile(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}
