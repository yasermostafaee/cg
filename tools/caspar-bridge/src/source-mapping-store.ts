import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EMPTY_SOURCE_MAPPINGS,
  SourceMappingsSchema,
  type FixedLayerBank,
  type LiveSourceLayerRange,
  type SOURCES_SET_CONFIG_REASONS,
  type SourceMappings,
} from '@cg/shared-ipc';

/**
 * D-137 / C-015 phase 4 — the `SourceMappingStore`: bridge-side loading,
 * validation and persistence of the installation's symbolic-id → producer
 * mapping, and of the layer band those producers are placed on.
 *
 * Written as MODULE FUNCTIONS rather than a class, deliberately, because it
 * follows `fixed-layers-store.ts` in every respect that matters here: the
 * validators are pure and exported so unit tests exercise every refusal, the
 * value in force is held by `CasparRuntime` beside the other config it owns,
 * and `bridge.ts` persists after a successful apply (the R-010 order —
 * validate → apply → persist → publish).
 *
 * ── 🔴 THE ABSENT FILE IS A SAFETY PROPERTY, NOT A CONVENIENCE ──────────────
 *
 * An ABSENT file means NO MAPPINGS and there is NO BUILT-IN DEFAULT. This
 * diverges from `fixed-layers-store.ts`, whose absent file means the built-in
 * 70–99 bank, and the divergence is the whole point: a default BANK is a guess
 * about our own layer numbering, while a default INPUT MAPPING is a guess about
 * hardware nobody in this project can see. A wrong guess there puts the wrong
 * camera behind a guest's frame — silently, and on air.
 *
 * A PRESENT but unusable file is a HARD BOOT FAILURE, for the same reason and
 * one step harder: a PARTIALLY parsed mapping is worse than none. Dropping the
 * unreadable half would boot a station that resolves three of its four ids and
 * says nothing about the fourth.
 *
 * ── ⚠ WHERE THE FILE LIVES ─────────────────────────────────────────────────
 *
 * NOT in `templatesDir`. `TemplateRegistry.loadPersisted` reads EVERY `*.json`
 * there as a template (`template-registry.ts:75,87` — a bare `.endsWith('.json')`
 * include-filter is the only filter there is), so a mapping file placed beside
 * the templates becomes a "skipping unusable persisted template" warning on
 * every boot. That is B-116, already filed for `delimiters.json` landing in the
 * same trap, and this file does not repeat it: it is resolved from its own
 * `--source-mappings-path` flag, defaulting to
 * `~/.cg-runtime/bridge-source-mappings.json`.
 */

/** DERIVED from the wire const, so the channel's `reason` union and this cannot drift. */
export type SourceMappingsErrorCode = (typeof SOURCES_SET_CONFIG_REASONS)[number];

/** A refused mapping (or mapping change). `code` is stable; the message names specifics. */
export class SourceMappingsConfigError extends Error {
  override readonly name = 'SourceMappingsConfigError';
  constructor(
    readonly code: SourceMappingsErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** A mapping file that is present but unusable (hard startup failure — see the header). */
export class SourceMappingsFileError extends Error {
  override readonly name = 'SourceMappingsFileError';
  constructor(
    readonly file: string,
    reason: string,
  ) {
    super(`source-mappings file ${file} is present but unusable: ${reason}`);
  }
}

export interface ValidateSourceMappingsOptions {
  /**
   * The operator's candidate bank in force, or `null` when none is declared.
   * The SAME object the LayerManager was given — never a second reading.
   */
  fixedBank: FixedLayerBank | null;
  /**
   * The layers the PLAYOUT system owns, expanded (`reservedLayerNumbers`). The
   * SAME list the boot validator and the allocation fence were given.
   */
  reservedLayers: readonly number[];
}

function rangeText(range: LiveSourceLayerRange): string {
  return `${String(range.start)}-${String(range.end)}`;
}

/** Compress a layer list into human-readable inclusive ranges (`60-69, 105`). */
function formatRanges(layers: readonly number[]): string {
  const sorted = [...new Set(layers)].sort((a, b) => a - b);
  const parts: string[] = [];
  let runStart: number | null = null;
  let prev = Number.NaN;
  for (const layer of sorted) {
    if (runStart === null) {
      runStart = layer;
    } else if (layer !== prev + 1) {
      parts.push(runStart === prev ? String(runStart) : `${String(runStart)}-${String(prev)}`);
      runStart = layer;
    }
    prev = layer;
  }
  if (runStart !== null) {
    parts.push(runStart === prev ? String(runStart) : `${String(runStart)}-${String(prev)}`);
  }
  return parts.join(', ');
}

/**
 * Validate a mapping against itself and against this station's other declared
 * layer classes. Throws {@link SourceMappingsConfigError} naming the conflict.
 *
 * CALLED AT LOAD **AND** AT EVERY CHANGE, from the same function. "At change" is
 * the half that gets forgotten, and it is the half an operator can trigger with
 * a graphic on air — a band edited into the candidate bank at 21:59 would put a
 * live producer on top of an operator row.
 *
 * The band carries NO CHANNEL (a Live Source lands on whatever channel its
 * template is on), so the overlap tests compare layer NUMBERS and ignore which
 * channel the bank declares. That refuses more than is strictly necessary, and
 * that is the correct direction for a check whose failure mode is a graphic
 * landing on somebody else's layer.
 */
export function validateSourceMappings(
  value: SourceMappings,
  options: ValidateSourceMappingsOptions,
): void {
  const seen = new Set<string>();
  for (const mapping of value.mappings) {
    if (seen.has(mapping.id)) {
      throw new SourceMappingsConfigError(
        'duplicate-id',
        `two mappings claim the id "${mapping.id}" — which producer a template got would ` +
          `depend on the order of the list; give each id exactly one producer`,
      );
    }
    seen.add(mapping.id);
  }

  const range = value.layerRange;
  if (range === undefined) return;

  const bank = options.fixedBank;
  if (bank !== null) {
    const bankEnd = bank.start + bank.count - 1;
    if (range.start <= bankEnd && range.end >= bank.start) {
      // Name BOTH ranges, the `overlaps-reserved` stance: the operator has to
      // be able to see which side to move.
      throw new SourceMappingsConfigError(
        'overlaps-fixed-bank',
        `the Live Source layer band ${rangeText(range)} overlaps the operator's candidate ` +
          `layer bank ${String(bank.start)}-${String(bankEnd)} (channel ${String(bank.channel)}) ` +
          `— the two must be disjoint; move the band or the bank`,
      );
    }
  }

  const reservedHits = options.reservedLayers.filter((l) => l >= range.start && l <= range.end);
  if (reservedHits.length > 0) {
    throw new SourceMappingsConfigError(
      'overlaps-reserved',
      `the Live Source layer band ${rangeText(range)} overlaps the reserved playout range ` +
        `${formatRanges(options.reservedLayers)} on layer(s) ${reservedHits.map(String).join(', ')} ` +
        `— the two must be disjoint; move the band or the reservation`,
    );
  }
}

/**
 * Load the persisted mapping. ABSENT file → `null`, which the caller reads as
 * NO MAPPINGS (never as a default). PRESENT but unusable →
 * {@link SourceMappingsFileError}, a hard startup failure.
 */
export function loadSourceMappings(filePath: string): SourceMappings | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new SourceMappingsFileError(filePath, err instanceof Error ? err.message : String(err));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new SourceMappingsFileError(
      filePath,
      `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const result = SourceMappingsSchema.safeParse(parsed);
  if (!result.success) {
    throw new SourceMappingsFileError(filePath, `schema-invalid: ${result.error.message}`);
  }
  return result.data;
}

/** Atomically persist the mapping (mkdir -p + tmp + rename), the store precedent. */
export function saveSourceMappings(filePath: string, value: SourceMappings): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

/**
 * WHERE the mapping in force came from — named in the CLI's boot line.
 *
 * `absent` is the ordinary un-configured station and is NOT an error; `none` is
 * the embedder case (no path configured at all). The two are held apart because
 * only one of them has a file the operator can go and write.
 */
export type SourceMappingsSource = 'explicit' | 'file' | 'absent' | 'none';

/**
 * THE boot precedence, in one place, mirroring `resolveFixedBank` — EXCEPT for
 * the last step, which is the whole doctrine: there is no built-in default, so
 * the fall-through is the EMPTY mapping.
 *
 *   1. an explicit in-process value (tests, embedders);
 *   2. the persisted file (present-but-unusable is still a hard failure);
 *   3. NOTHING — `{ mappings: [] }`, and no id resolves.
 */
export function resolveSourceMappings(options: {
  sourceMappings?: SourceMappings;
  sourceMappingsPath?: string;
}): { value: SourceMappings; source: SourceMappingsSource } {
  if (options.sourceMappings !== undefined) {
    return { value: options.sourceMappings, source: 'explicit' };
  }
  if (options.sourceMappingsPath === undefined) {
    return { value: EMPTY_SOURCE_MAPPINGS, source: 'none' };
  }
  const persisted = loadSourceMappings(options.sourceMappingsPath);
  return persisted !== null
    ? { value: persisted, source: 'file' }
    : { value: EMPTY_SOURCE_MAPPINGS, source: 'absent' };
}
