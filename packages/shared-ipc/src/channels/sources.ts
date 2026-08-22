import { z } from 'zod';
import { IdSchema, LiveSourceIdSchema } from '@cg/shared-schema';
import type { FixedLayerBank } from './fixedLayers.js';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * D-137 / C-015 — the installation's LIVE SOURCES, and which of them each
 * template's plates use.
 *
 * ── ⭐ RESHAPED 2026-08-10 (owner) — TWO STORES, JOINED BY ONE OPERATOR ACTION ─
 *
 * Phase 4 first shipped ONE store, keyed by the id a TEMPLATE declares: the
 * operator added `guest-1` because some scene said `guest-1`. That join is a
 * NAME MATCH, and a name match silently requires the AUTHOR to guess the
 * installation's naming convention — which contradicts design.md §12.1's own
 * principle that the Designer knows nothing about the installation.
 *
 * So the model is two independent halves:
 *
 * 1. **The CATALOG** ({@link SourceCatalogSchema}) — the installation's list of
 *    lives, built with NO reference to any template and NO dependence on any
 *    declared id. Each entry carries an installation-generated id, a human NAME
 *    ("Studio A", "Baku", "Skype 1") and its producer definition.
 * 2. **The ASSIGNMENTS** ({@link SourceAssignmentsSchema}) — per template, per
 *    PLATE, which catalog entry that plate uses. The operator assigns once, per
 *    template.
 *
 * The author names plates for the LAYOUT; the installation names sources for
 * what they ARE; one deliberate operator action joins them. **The template stays
 * exactly as portable as before — only the join improves.**
 *
 * ⚠ A template's declared `sourceId` is therefore a **PLATE IDENTIFIER**, not an
 * installation key. The schema field is unchanged (renaming it is a scene
 * migration); what it MEANS is what changed.
 *
 * ── 🔴 ABSENT MEANS NOTHING IS DEFINED, AND THERE IS NO BUILT-IN DEFAULT ─────
 *
 * Both this and `reserved-layers` say "absent = nothing", and the SAFETY
 * DIRECTION IS OPPOSITE — worth stating because it will be mis-copied:
 *
 * - reserved layers, "absent = nothing reserved", is FAIL-OPEN and chosen
 *   anyway, because guessing a reservation is worse;
 * - live sources, "absent = no sources and no assignments", is FAIL-CLOSED.
 *   Nothing resolves and nothing reaches air.
 *
 * A default fixed-layer BANK is safe because it is a guess about OUR OWN layer
 * numbering. A default INPUT definition is a guess about hardware nobody in this
 * project can see, and a wrong guess puts the wrong camera behind a guest's
 * frame. C-015's acceptance already prescribes the empty case: an unassigned
 * plate refuses the take with a distinct errorCode, never a silent hole on air.
 * The absent files are simply the case where EVERY plate is unassigned.
 *
 * ── ONE FORMAT, AT THE ENTRY ────────────────────────────────────────────────
 *
 * design.md §2's pre-amendment sketch also carried a `format` on the DECKLINK
 * arm. It is deliberately NOT carried here: §3a made the ENTRY's format the one
 * that determines the fit, and a second spelling of the same fact on one arm is
 * precisely the drift that decision exists to prevent — two formats that
 * disagree, with nothing to say which one the crop was computed from.
 */

/**
 * The signal FORMAT vocabulary, taken verbatim from the plant's PREVIOUS
 * automation — `ChannelInput` → `Format` in `docs/recon/ciab-client-tools.json`,
 * a 37-value combo whose default is `PAL` (design.md §3a).
 *
 * Adopted rather than invented because the operator already had to state this,
 * and because it is the field that actually determines the raster: `1080i5000`
 * is 16:9 whatever anyone types beside it.
 */
export const LIVE_SOURCE_FORMATS = [
  'AUTO',
  'PAL',
  'NTSC',
  '576p2500',
  '720p2398',
  '720p2400',
  '720p2500',
  '720p2997',
  '720p3000',
  '720p5000',
  '720p5994',
  '720p6000',
  '1080p2398',
  '1080p2400',
  '1080p2500',
  '1080p2997',
  '1080p3000',
  '1080p5000',
  '1080p5994',
  '1080p6000',
  '1080i5000',
  '1080i5994',
  '1080i6000',
  '1556p2398',
  '1556p2400',
  '1556p2500',
  '2160p2398',
  '2160p2400',
  '2160p2500',
  '2160p2997',
  '2160p3000',
  'dci1080p2398',
  'dci1080p2400',
  'dci1080p2500',
  'dci2160p2398',
  'dci2160p2400',
  'dci2160p2500',
] as const;

export const LiveSourceFormatSchema = z.enum(LIVE_SOURCE_FORMATS);
export type LiveSourceFormat = z.infer<typeof LiveSourceFormatSchema>;

/**
 * The DISPLAY aspect a format determines, or `null` where it determines none.
 *
 * `AUTO` is the only listed format that determines nothing — it is a request to
 * the hardware, not a statement about the picture — and it is why a source keeps
 * an explicit `aspect` fallback at all.
 *
 * ⚠ `PAL` and `NTSC` are stated as DISPLAY aspects (4:3), NOT as their rasters.
 * 720×576 and 720×486 have non-square pixels; deriving 720/576 = 1.25 from the
 * raster would crop a 4:3 feed as though it were a shape no display shows.
 * Every other entry is square-pixel, so its raster IS its display aspect.
 */
function displayAspectRatio(format: LiveSourceFormat): readonly [number, number] | null {
  if (format === 'AUTO') return null;
  // DAR, not raster — see the note above.
  if (format === 'PAL' || format === 'NTSC') return [4, 3];
  // `dci*` FIRST: `dci1080p2500` also matches the bare `1080p` test below, and
  // DCI is 2048×1080, not 1920×1080 — a 1.896 source cropped as 1.778 loses a
  // strip of picture down both sides.
  if (format.startsWith('dci1080p')) return [2048, 1080];
  if (format.startsWith('dci2160p')) return [4096, 2160];
  if (format.startsWith('576p')) return [1024, 576];
  if (format.startsWith('720p')) return [1280, 720];
  if (format.startsWith('1080p') || format.startsWith('1080i')) return [1920, 1080];
  if (format.startsWith('1556p')) return [2048, 1556];
  if (format.startsWith('2160p')) return [3840, 2160];
  return null;
}

/**
 * The aspect a format determines, or `null` for `AUTO`.
 *
 * This is step 1 of design.md §3a's fit chain. Steps 3 and 4 — the element's
 * `expectedAspect`, and what happens when neither side states anything — are
 * phase 6's and are deliberately NOT decided here.
 *
 * `AUTO` is the ONLY format in the vocabulary that yields `null`, and
 * `tests/sources.test.ts` pins exactly that: a format added to the list without
 * a raster beside it would otherwise fall through this table silently and be
 * indistinguishable, downstream, from an operator who chose `AUTO`.
 */
export function aspectForFormat(format: LiveSourceFormat): number | null {
  const ratio = displayAspectRatio(format);
  return ratio === null ? null : ratio[0] / ratio[1];
}

/**
 * The concrete producer a source resolves to — a DISCRIMINATED UNION on `kind`,
 * never a free string, so an unreachable producer form is a parse error at the
 * boundary rather than an AMCP `400` at take time.
 */
export const SourceProducerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('route'),
    /** The channel to route FROM. */
    channel: z.number().int().positive(),
    /**
     * Optional because the measured grammar makes it optional
     * (`route://<channel>` with an optional `-<layer>` tail): a channel-only
     * route means that channel's whole output.
     */
    layer: z.number().int().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal('decklink'),
    /** The FILL device index. */
    device: z.number().int().positive(),
    /**
     * The KEY device of a fill/key pair — the plant's previous automation's
     * MASTER + SLAVE on one entry (design.md §1a / §2a).
     *
     * On THIS ARM ALONE, and deliberately: a fill/key pair is two physical SDI
     * inputs. A `route` or an `ndi` source carries its own alpha or none, and
     * offering the field there would invite an operator to configure a pair
     * that cannot exist.
     */
    keyDevice: z.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal('ndi'),
    /** The NDI source name as the network advertises it. */
    source: z.string().min(1),
    lowBandwidth: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('media'),
    /** A clip in CasparCG's media folder — the one producer that needs no signal. */
    file: z.string().min(1),
  }),
]);
export type SourceProducer = z.infer<typeof SourceProducerSchema>;

/**
 * The INSTALLATION-GENERATED handle for one catalog entry.
 *
 * It is NOT {@link LiveSourceIdSchema} and must never become it: that is the
 * SCENE's vocabulary, and the whole point of the reshape is that the catalog is
 * built with no reference to any template. This id is generated by
 * {@link nextSourceId}, is never shown to the operator (the NAME is), and exists
 * only so a RENAME does not break every assignment pointing at the entry.
 *
 * The FORM is permissive on purpose — a hand-written config file is a legal way
 * to configure a station, and refusing an id somebody typed sensibly would make
 * the file unusable by hand. What is NOT permissive is the GENERATOR: see
 * {@link nextSourceId}.
 */
export const SourceDefinitionIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'a source id is alphanumeric with "_" and "-"');

/** ONE live this installation has, defined without reference to any template. */
export const SourceDefinitionSchema = z.object({
  /** Installation-generated and STABLE — see {@link SourceDefinitionIdSchema}. */
  id: SourceDefinitionIdSchema,
  /**
   * What this source IS, in the operator's words: `Studio A`, `Baku`, `Skype 1`.
   *
   * REQUIRED, unlike the optional `label` it replaces. It is the only handle the
   * operator ever sees — the assignment picker lists names, not ids — so an
   * entry without one is an entry nobody can assign. Two entries sharing a name
   * is refused for the same reason (`duplicate-name`).
   */
  name: z.string().trim().min(1),
  /**
   * The signal format. THE FIT INPUT (design.md §3a): the crop-to-fill aspect
   * derives from this, so an operator states a format rather than a number.
   */
  format: LiveSourceFormatSchema.optional(),
  /**
   * The explicit aspect, used ONLY where the format determines none. Read it
   * through {@link sourceAspect}, never directly — the order between the two is
   * the decision.
   */
  aspect: z.number().positive().optional(),
  producer: SourceProducerSchema,
});
export type SourceDefinition = z.infer<typeof SourceDefinitionSchema>;

/**
 * The aspect THIS SOURCE states: derived from the format, falling back to the
 * explicit `aspect` where the format determines none.
 *
 * The order is the decision, not a convenience: a hand-entered aspect is a
 * number that can be wrong on air while looking entirely reasonable, so it is
 * only ever consulted where the format has nothing to say.
 */
export function sourceAspect(source: SourceDefinition): number | null {
  const fromFormat = source.format === undefined ? null : aspectForFormat(source.format);
  return fromFormat ?? source.aspect ?? null;
}

/** Upper bound for a declared Live Source layer — the `MAX_RESERVED_LAYER` stance. */
export const MAX_LIVE_SOURCE_LAYER = 9999;

/**
 * The layer band the bridge places Live Source producers on, INCLUSIVE.
 *
 * DECLARED, never defaulted. design.md §4 names 10–59 as the band R-028's own
 * 6.4 frees, and {@link SUGGESTED_LIVE_SOURCE_LAYER_RANGE} carries it as a
 * SUGGESTION for the editor — applying it automatically would be this project
 * choosing layer numbers for a plant it cannot see, and a station whose
 * reservation already sits inside 10–59 would then fail to boot on upgrade.
 *
 * NO CHANNEL. A Live Source is placed on whatever channel its template is on,
 * so the band is a statement about layer NUMBERS. Disjointness is therefore
 * checked against every declared bank and reservation regardless of channel —
 * the conservative direction, and the right one for a check whose failure mode
 * is a graphic landing on someone else's layer.
 */
export const LiveSourceLayerRangeSchema = z
  .object({
    start: z.number().int().nonnegative().max(MAX_LIVE_SOURCE_LAYER),
    end: z.number().int().nonnegative().max(MAX_LIVE_SOURCE_LAYER),
  })
  .refine((r) => r.end >= r.start, { message: '`end` must be >= `start`' });
export type LiveSourceLayerRange = z.infer<typeof LiveSourceLayerRangeSchema>;

/** design.md §4's band, offered in the editor and never applied on its own. */
export const SUGGESTED_LIVE_SOURCE_LAYER_RANGE: LiveSourceLayerRange = { start: 10, end: 59 };

/**
 * The installation's LIST of lives, replaced at once.
 *
 * Whole-value set, not add/remove verbs, for the `delimiters.set` reason: two
 * browsers editing concurrently would interleave deltas into an order neither
 * operator chose, and the list is small and edited rarely.
 */
export const SourceCatalogSchema = z.object({
  sources: z.array(SourceDefinitionSchema),
  /** Absent ⇒ no band is declared, and phase 5 has nowhere to place a producer. */
  layerRange: LiveSourceLayerRangeSchema.optional(),
});
export type SourceCatalog = z.infer<typeof SourceCatalogSchema>;

/** The empty catalog — what an ABSENT file means, and what a fresh station has. */
export const EMPTY_SOURCE_CATALOG: SourceCatalog = { sources: [] };

/**
 * ONE plate of ONE template, pointed at ONE catalog entry.
 *
 * `plateId` is the template's DECLARED `sourceId`, read as the PLATE IDENTIFIER
 * it now is. The author picked it for the LAYOUT (`guest-1`, `guest-2`); it
 * names a hole in that template and nothing outside it.
 */
export const TemplateSourceAssignmentSchema = z.object({
  templateId: IdSchema,
  plateId: LiveSourceIdSchema,
  sourceId: SourceDefinitionIdSchema,
});
export type TemplateSourceAssignment = z.infer<typeof TemplateSourceAssignmentSchema>;

/** Every assignment this installation holds, replaced at once (the catalog's reason). */
export const SourceAssignmentsSchema = z.object({
  assignments: z.array(TemplateSourceAssignmentSchema),
});
export type SourceAssignments = z.infer<typeof SourceAssignmentsSchema>;

/** The empty assignment set — an ABSENT file, and a station that has assigned nothing. */
export const EMPTY_SOURCE_ASSIGNMENTS: SourceAssignments = { assignments: [] };

/** The id alphabet — lowercase and digits, so a generated id survives a shell, a URL and a log. */
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Random bytes, from the platform CSPRNG where there is one.
 *
 * `globalThis.crypto` is reached through a narrow local type rather than a DOM
 * or Node lib: this package is ISOMORPHIC and compiles with neither. The
 * `Math.random` fall-through is not a weakening — what a source id needs is to
 * be UNIQUE, not unguessable; it is a config handle, never a secret.
 */
function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count);
  const api = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => void } }).crypto;
  if (api?.getRandomValues !== undefined) {
    api.getRandomValues(bytes);
    return bytes;
  }
  /* c8 ignore next 3 -- every supported browser and Node >= 22 has a CSPRNG. */
  for (let i = 0; i < count; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/**
 * Generate an id for a NEW catalog entry.
 *
 * 🔴 **AN ID IS NEVER REUSED, and that is a safety property rather than tidiness.**
 * A counter that handed out the lowest free number would re-issue a deleted
 * source's id, and a stale assignment — one written by hand, or restored with an
 * older file — would then RE-BIND silently to a source nobody chose. Random and
 * collision-checked, a retired id simply never comes back.
 *
 * It is belt to {@link pruneAssignmentsForCatalog}'s braces: the cascade removes
 * the assignments a deletion orphans, and this makes that removal irreversible
 * even against a file the product did not write.
 */
export function nextSourceId(existing: readonly string[]): string {
  const taken = new Set(existing);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    let suffix = '';
    for (const byte of randomBytes(6)) suffix += ID_ALPHABET[byte % ID_ALPHABET.length] ?? 'x';
    const id = `src-${suffix}`;
    if (!taken.has(id)) return id;
  }
  /* c8 ignore next 2 -- 1000 collisions over 36^6 is not a reachable state. */
  throw new Error('could not generate a free source id');
}

/**
 * The catalog's refusal codes, as ONE shared const so the wire contract and the
 * bridge store's error type cannot drift — the `FIXED_LAYERS_SET_CONFIG_REASONS`
 * pattern, and the same reason: a store and a channel that spell a refusal
 * separately eventually spell it differently.
 *
 * - `duplicate-id` — two entries claim one id, so which producer an assignment
 *   reached would depend on array order.
 * - `duplicate-name` — two entries share the operator-facing NAME. The name is
 *   the only handle the assignment picker shows, so two of them leaves the
 *   operator choosing blind between "Studio A" and "Studio A".
 * - `overlaps-fixed-bank` / `overlaps-reserved` — the Live Source band must be
 *   disjoint from the operator's candidate bank AND from the playout system's
 *   reserved layers. Checked at LOAD and at every CHANGE; the message names
 *   BOTH ranges so the operator can see which side to move.
 */
export const SOURCES_SET_CONFIG_REASONS = [
  'duplicate-id',
  'duplicate-name',
  'overlaps-fixed-bank',
  'overlaps-reserved',
] as const;
export type SourcesSetConfigReason = (typeof SOURCES_SET_CONFIG_REASONS)[number];

/**
 * The assignments' refusal codes.
 *
 * - `duplicate-plate` — one template's plate assigned twice, so which source it
 *   used would depend on array order.
 * - `unknown-source` — an assignment naming a catalog entry that does not exist.
 *   Refused AT CHANGE, because the product's own UI cannot produce one and a
 *   caller that does is stale or hand-written. At LOAD the same shape is PRUNED
 *   instead — see {@link pruneAssignmentsForCatalog}, which records why the two
 *   doors answer differently.
 */
export const SOURCES_SET_ASSIGNMENTS_REASONS = ['duplicate-plate', 'unknown-source'] as const;
export type SourcesSetAssignmentsReason = (typeof SOURCES_SET_ASSIGNMENTS_REASONS)[number];

/** A refused catalog (or catalog change). `code` is stable; the message names specifics. */
export class SourceCatalogConfigError extends Error {
  override readonly name = 'SourceCatalogConfigError';
  constructor(
    readonly code: SourcesSetConfigReason,
    message: string,
  ) {
    super(message);
  }
}

/** A refused assignment set. `code` is stable; the message names specifics. */
export class SourceAssignmentsConfigError extends Error {
  override readonly name = 'SourceAssignmentsConfigError';
  constructor(
    readonly code: SourcesSetAssignmentsReason,
    message: string,
  ) {
    super(message);
  }
}

export interface ValidateSourceCatalogOptions {
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

/** Compress a layer list into human-readable inclusive ranges (`60-69, 105`). */
function formatLayerRanges(layers: readonly number[]): string {
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

/** The comparison key for a NAME — case- and whitespace-insensitive (see `duplicate-name`). */
function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Validate a catalog against itself and against this station's other declared
 * layer classes. Throws {@link SourceCatalogConfigError} naming the conflict.
 *
 * IT LIVES HERE, in the wire package, so the BRIDGE and the offline MOCK share
 * ONE implementation rather than two that agree today. The refusal codes are
 * already defined beside it, and a mock that refused differently from the bridge
 * would teach an operator a rule the real station does not have — the
 * `videoModeRaster` precedent, and this repo's one-canonical-predicate rule.
 * The FILE half (load / save / provenance) stays bridge-side: only that half
 * needs a filesystem.
 *
 * CALLED AT LOAD **AND** AT EVERY CHANGE, from this one function. "At change" is
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
export function validateSourceCatalog(
  value: SourceCatalog,
  options: ValidateSourceCatalogOptions,
): void {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  for (const source of value.sources) {
    if (seenIds.has(source.id)) {
      throw new SourceCatalogConfigError(
        'duplicate-id',
        `two sources claim the id "${source.id}" — which producer an assignment reached would ` +
          `depend on the order of the list; give each source exactly one id`,
      );
    }
    seenIds.add(source.id);
    const key = nameKey(source.name);
    if (seenNames.has(key)) {
      throw new SourceCatalogConfigError(
        'duplicate-name',
        `two sources are called "${source.name}" — the name is the only handle the assignment ` +
          `picker shows, so the operator would be choosing blind; rename one`,
      );
    }
    seenNames.add(key);
  }

  const range = value.layerRange;
  if (range === undefined) return;
  const rangeText = `${String(range.start)}-${String(range.end)}`;

  const bank = options.fixedBank;
  if (bank !== null) {
    const bankEnd = bank.start + bank.count - 1;
    if (range.start <= bankEnd && range.end >= bank.start) {
      // Name BOTH ranges, the `overlaps-reserved` stance: the operator has to
      // be able to see which side to move.
      throw new SourceCatalogConfigError(
        'overlaps-fixed-bank',
        `the Live Source layer band ${rangeText} overlaps the operator's candidate layer ` +
          `bank ${String(bank.start)}-${String(bankEnd)} (channel ${String(bank.channel)}) — ` +
          `the two must be disjoint; move the band or the bank`,
      );
    }
  }

  const reservedHits = options.reservedLayers.filter((l) => l >= range.start && l <= range.end);
  if (reservedHits.length > 0) {
    throw new SourceCatalogConfigError(
      'overlaps-reserved',
      `the Live Source layer band ${rangeText} overlaps the reserved playout range ` +
        `${formatLayerRanges(options.reservedLayers)} on layer(s) ` +
        `${reservedHits.map(String).join(', ')} — the two must be disjoint; move the band or ` +
        `the reservation`,
    );
  }
}

/**
 * The same validation, as a RESULT rather than a throw — the shape both the
 * bridge's `sources.set-config` handler and the mock's answer with.
 */
export function checkSourceCatalog(
  value: SourceCatalog,
  options: ValidateSourceCatalogOptions,
): { ok: true } | { ok: false; reason: SourcesSetConfigReason; message: string } {
  try {
    validateSourceCatalog(value, options);
    return { ok: true };
  } catch (err) {
    if (err instanceof SourceCatalogConfigError) {
      return { ok: false, reason: err.code, message: err.message };
    }
    throw err;
  }
}

/**
 * Validate an assignment set against itself and against the catalog IN FORCE.
 *
 * Same split as the catalog's validator and for the same reason: the bridge and
 * the offline mock share ONE definition of a legal assignment.
 */
export function validateSourceAssignments(
  value: SourceAssignments,
  options: { catalog: SourceCatalog },
): void {
  const known = new Set(options.catalog.sources.map((s) => s.id));
  const seen = new Set<string>();
  for (const assignment of value.assignments) {
    /*
      ⚠ **THE SEPARATOR IS AN ESCAPE, NEVER A RAW BYTE (session BP).** This line carried a
      literal NUL byte until BP, and the resulting string is identical either way — what
      differed is that a file containing one reads as BINARY to `grep -r` and to ripgrep, so
      every tree-wide sweep skipped this module in silence. Golden rule 9 makes `git grep` the
      instrument that catches a string change the compiler cannot, so a file the sweep cannot
      read is a hole in it — and this module, which owns `SourceAssignments`, is one of the
      likelier things to be swept for. (`git grep` itself was not blind here: it samples only
      the first 8000 bytes for binary detection and the NUL sat past that, which is exactly the
      sort of accident that makes a hole look closed.)
    */
    const key = `${assignment.templateId}\u0000${assignment.plateId}`;
    if (seen.has(key)) {
      throw new SourceAssignmentsConfigError(
        'duplicate-plate',
        `plate "${assignment.plateId}" of template "${assignment.templateId}" is assigned ` +
          `twice — which source it used would depend on the order of the list`,
      );
    }
    seen.add(key);
    if (!known.has(assignment.sourceId)) {
      throw new SourceAssignmentsConfigError(
        'unknown-source',
        `plate "${assignment.plateId}" of template "${assignment.templateId}" is assigned to ` +
          `source "${assignment.sourceId}", which this installation does not define — assign ` +
          `it to one of the defined sources, or leave it unassigned`,
      );
    }
  }
}

/** The assignment validation as a RESULT — the bridge's and the mock's answer shape. */
export function checkSourceAssignments(
  value: SourceAssignments,
  options: { catalog: SourceCatalog },
): { ok: true } | { ok: false; reason: SourcesSetAssignmentsReason; message: string } {
  try {
    validateSourceAssignments(value, options);
    return { ok: true };
  } catch (err) {
    if (err instanceof SourceAssignmentsConfigError) {
      return { ok: false, reason: err.code, message: err.message };
    }
    throw err;
  }
}

/**
 * Drop every assignment whose source the catalog no longer defines.
 *
 * 🔴 **THIS IS THE DELETE-A-SOURCE ANSWER, and its three parts are one
 * decision.** Deleting a source that is assigned somewhere is NOT refused — an
 * installation must be able to retire a live — and it is NOT left dangling: an
 * assignment that dangles until air is the failure this project exists to
 * prevent. So the deletion CASCADES here, and the caller reports what it removed
 * AT THE MOMENT OF DELETION, naming the templates that referenced it. Those
 * plates then read as unassigned, and the take refuses naming the plate.
 *
 * **Why the assignment is REMOVED rather than TOMBSTONED.** A tombstone would be
 * a second "assigned, but not really" state that every consumer — the row, the
 * take, the picker, C-022's HTTP view — would have to learn and could get wrong,
 * and it would give a re-created id something to silently re-bind to.
 * "Unassigned" is the truth about such a plate, and it is a state the whole
 * feature already handles. What a tombstone would have carried — WHICH source
 * went — the report carries instead, to where the operator actually is.
 *
 * It is also the LOAD-time reading of an assignments file that disagrees with
 * the catalog beside it (two files, hand-editable, restorable apart). A dangling
 * reference has a perfectly clear reading — that plate is unassigned — so it is
 * pruned LOUDLY rather than made a boot failure; the unusable-FILE rule is
 * unchanged, because a file that will not parse has no reading at all.
 */
export function pruneAssignmentsForCatalog(
  value: SourceAssignments,
  catalog: SourceCatalog,
): { value: SourceAssignments; dropped: readonly TemplateSourceAssignment[] } {
  const known = new Set(catalog.sources.map((s) => s.id));
  const kept: TemplateSourceAssignment[] = [];
  const dropped: TemplateSourceAssignment[] = [];
  for (const assignment of value.assignments) {
    (known.has(assignment.sourceId) ? kept : dropped).push(assignment);
  }
  return dropped.length === 0 ? { value, dropped: [] } : { value: { assignments: kept }, dropped };
}

/** The source a plate is assigned to, or `null` when nothing is assigned. */
export function assignedSourceId(
  assignments: SourceAssignments,
  templateId: string,
  plateId: string,
): string | null {
  const hit = assignments.assignments.find(
    (a) => a.templateId === templateId && a.plateId === plateId,
  );
  return hit === undefined ? null : hit.sourceId;
}

/**
 * The plates of `templateId` that no assignment covers, in the order given.
 *
 * A freshly imported template has ALL of them, which is the ordinary state and
 * not an error — the row names them so the operator knows what is left to do.
 */
export function unassignedPlateIds(
  assignments: SourceAssignments,
  templateId: string,
  plateIds: readonly string[],
): string[] {
  return plateIds.filter((plateId) => assignedSourceId(assignments, templateId, plateId) === null);
}

/** Read the catalog in force. An empty `sources` list = nothing is defined (see the header). */
export const SourcesConfigChannel = defineChannel('sources.config', z.void(), SourceCatalogSchema);

/**
 * Replace the catalog in force: validate → apply → CASCADE → persist → publish.
 *
 * The BRIDGE is authoritative for the refusal and supplies the wording, so a
 * second browser, a stale client or a hand-written call cannot create a state
 * the UI is careful to prevent.
 *
 * `droppedAssignments` is how a DELETION reports itself: the plates this change
 * orphaned, so the surface can name them at the moment of deletion instead of
 * leaving the operator to meet them at a take.
 */
export const SourcesSetConfigChannel = defineChannel(
  'sources.set-config',
  SourceCatalogSchema,
  z.object({
    ok: z.boolean(),
    reason: z.enum(SOURCES_SET_CONFIG_REASONS).optional(),
    message: z.string().optional(),
    droppedAssignments: z.array(TemplateSourceAssignmentSchema).optional(),
  }),
);

/** Read the per-template, per-plate assignments in force. */
export const SourcesAssignmentsChannel = defineChannel(
  'sources.assignments',
  z.void(),
  SourceAssignmentsSchema,
);

/** Replace the assignments in force: validate against the catalog → apply → persist → publish. */
export const SourcesSetAssignmentsChannel = defineChannel(
  'sources.set-assignments',
  SourceAssignmentsSchema,
  z.object({
    ok: z.boolean(),
    reason: z.enum(SOURCES_SET_ASSIGNMENTS_REASONS).optional(),
    message: z.string().optional(),
  }),
);

/** Pushed with the FULL catalog whenever it changes, so every browser converges. */
export const SourcesConfigChangedChannel = definePublishChannel(
  'sources.config-changed',
  SourceCatalogSchema,
);

/**
 * Pushed with the FULL assignment set whenever it changes — including when a
 * catalog deletion cascaded through it, which is a change no browser asked for
 * and every browser must see.
 */
export const SourcesAssignmentsChangedChannel = definePublishChannel(
  'sources.assignments-changed',
  SourceAssignmentsSchema,
);

/**
 * 🔴 **SESSION BQ — THE ONE RESOLUTION OF "WHICH SOURCE DOES THIS PLATE SHOW, IN THIS
 * LOOK", CALLABLE FROM BOTH PROCESSES.**
 *
 * ── WHY IT MOVED HERE ───────────────────────────────────────────────────────
 *
 * The four-level precedence lived bridge-side only (`live-look-bindings.ts`). The bridge
 * could resolve a name for a look; the RENDERER could not, so PVW's overlay was handed a
 * `(plateId) => name` callback with **no look dimension in it at all** — a per-look binding
 * was literally unrepresentable, and the preview named the template default while air
 * showed the bound source. `B-151` was the same shape one field over: PVW's overlay never
 * learned that looks exist, that time about RECTS.
 *
 * BL fixed the first one by moving the resolver rather than patching the call site, and
 * `lookPlateRects` carries the reason in its own doc: _"PVW could not have called a private
 * method on a process it does not run in — which is precisely how it came to have its own
 * idea of the layout."_ **This is that fix, applied to the second field.** One function, two
 * processes, no second spelling — the bridge delegates to these rather than keeping a copy.
 *
 * ── THE FOUR LEVELS, PLUS THE FREEZE ────────────────────────────────────────
 *
 *   1. the installation's **CATALOG** — resolved by the caller, which owns the id→name join
 *   2. the template's **ASSIGNMENT** — ⚠ or, for a row that has taken, the snapshot that
 *      take FROZE ({@link assignmentInForce})
 *   3. the row's **PER-LOOK composition**
 *   4. the row's **PER-PLATE emergency patch** (`R-048`), outermost, in force in EVERY look
 */

/**
 * Levels 3 and 4, flattened for ONE look — the row's per-look composition with its
 * per-plate emergency patch on top.
 *
 * ⚠ **The emergency wins, in every look, and that is deliberate.** `R-048` exists because
 * an INPUT IS DEAD, and a dead input is dead in every look; if a per-look binding outranked
 * it, switching look would bring the dead feed straight back and the operator would have to
 * re-patch, live, once per look, having already been told the substitution was applied.
 *
 * 🔴 **THIS IS THE ONE PLACE THAT ORDER IS DECIDED.** It was briefly two expressions that
 * happened to agree — the duplicate session BM's own review caught (§3b.1) — and the pair
 * survived review precisely BECAUSE they agreed. Do not add a third.
 */
export function effectiveOverridesForLook(
  lookId: string | undefined,
  bindings: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined,
  overrides: Readonly<Record<string, string>> | undefined,
): Record<string, string> | undefined {
  const perLook = lookId === undefined ? undefined : bindings?.[lookId];
  if (perLook === undefined) return overrides === undefined ? undefined : { ...overrides };
  return { ...perLook, ...(overrides ?? {}) };
}

/**
 * 🔴 **LEVEL 2 IN FORCE FOR ONE ROW: the snapshot its take FROZE, or the template's live
 * assignment when it has not taken.**
 *
 * Session BP made a row on air resolve its template assignment from what it captured at
 * TAKE, so an edit made during a show cannot change a picture that is already up. A surface
 * that resolved the LIVE assignment while air resolved the FROZEN one would be a second
 * answer to the same question — which is the class this feature keeps producing — so the
 * choice is made HERE and every caller inherits it.
 *
 * ⚠ **`undefined` means NOT FROZEN; an EMPTY record is a real freeze to nothing.** The test
 * is presence, never emptiness. And the frozen map is the row's COMPLETE level-2 answer: a
 * plate absent from it is unassigned for this run and does NOT fall through to the store.
 *
 * ⚠ A REHEARSING row is off air by `R-022`'s interlock, so nothing is frozen for it and this
 * returns the live assignment. The rule is written to stay true if that ever changes rather
 * than to be correct by accident today.
 */
export function assignmentInForce(
  templateId: string,
  assignments: SourceAssignments,
  frozenAssignment: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  if (frozenAssignment !== undefined) return { ...frozenAssignment };
  const map: Record<string, string> = {};
  for (const a of assignments.assignments) {
    if (a.templateId === templateId) map[a.plateId] = a.sourceId;
  }
  return map;
}

/** What {@link resolvePlateSourcesForLook} needs to answer for one row, in one look. */
export interface PlateSourceResolution {
  readonly templateId: string;
  /** The plates to answer for — normally the look's members, in declaration order. */
  readonly plateIds: readonly string[];
  /** The installation's level 2 store. */
  readonly assignments: SourceAssignments;
  /** Session BP — the row's frozen level 2, when it has taken. Absent ⇒ not frozen. */
  readonly frozenAssignment?: Readonly<Record<string, string>> | undefined;
  /** The look being resolved; `undefined` for a carrier that authors none. */
  readonly lookId: string | undefined;
  /** Level 3 — `lookId → plateId → catalog id`. */
  readonly lookBindings?: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined;
  /** Level 4 — `plateId → catalog id`, `R-048`'s emergency patch. */
  readonly overrides?: Readonly<Record<string, string>> | undefined;
}

/**
 * 🔴 **THE ANSWER A TAKE OF THIS ROW, IN THIS LOOK, WOULD PUT ON AIR — as
 * `plateId → catalog id`, or `null` where nothing resolves.**
 *
 * That sentence is the whole contract, and it settles every case without a table of
 * exceptions: the preview names what air would show, because both ask this.
 *
 * ⚠ It answers in CATALOG IDS, not names. The id→name join belongs to the caller, because
 * only a surface knows whether a missing catalog entry should read as "unassigned" (a
 * preview) or refuse a take (the bridge).
 */
export function resolvePlateSourcesForLook(
  input: PlateSourceResolution,
): Map<string, string | null> {
  const levelTwo = assignmentInForce(input.templateId, input.assignments, input.frozenAssignment);
  const effective = effectiveOverridesForLook(input.lookId, input.lookBindings, input.overrides);
  return new Map(
    input.plateIds.map((plateId) => [plateId, effective?.[plateId] ?? levelTwo[plateId] ?? null]),
  );
}
