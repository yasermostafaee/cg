import { z } from 'zod';
import { LiveSourceIdSchema } from '@cg/shared-schema';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * D-137 / C-015 — the INSTALLATION's mapping from a symbolic Live Source id to a
 * concrete producer, and the layer band those producers are placed on.
 *
 * ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
 *
 * A template declares `guest-1`. Nothing in the scene says what `guest-1` IS,
 * and that is deliberate: how a source arrives is a fact about a PLANT, not
 * about a design (`live-source-multibox` design.md §3 / §12.1 — the Designer
 * never names a device). This is where an operator finally says it, and until
 * they do, NOTHING reaches air.
 *
 * ── 🔴 ABSENT MEANS NO MAPPINGS, AND THERE IS NO BUILT-IN DEFAULT ───────────
 *
 * Both this and `reserved-layers` say "absent = nothing", and the SAFETY
 * DIRECTION IS OPPOSITE — worth stating because it will be mis-copied:
 *
 * - reserved layers, "absent = nothing reserved", is FAIL-OPEN and chosen
 *   anyway, because guessing a reservation is worse;
 * - source mappings, "absent = no mappings", is FAIL-CLOSED. Nothing resolves
 *   and nothing reaches air.
 *
 * A default fixed-layer BANK is safe because it is a guess about OUR OWN layer
 * numbering. A default INPUT mapping is a guess about hardware nobody in this
 * project can see, and a wrong guess puts the wrong camera behind a guest's
 * frame. C-015's acceptance already prescribes the empty case: an unmapped id
 * refuses the take with a distinct errorCode, never a silent hole on air. The
 * absent file is simply the case where EVERY id is unmapped.
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
 * the hardware, not a statement about the picture — and it is why the mapping
 * keeps an explicit `aspect` fallback at all.
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
 * The aspect THIS MAPPING states: derived from the format, falling back to the
 * explicit `aspect` where the format determines none.
 *
 * The order is the decision, not a convenience: a hand-entered aspect is a
 * number that can be wrong on air while looking entirely reasonable, so it is
 * only ever consulted where the format has nothing to say.
 */
export function mappingAspect(mapping: SourceMapping): number | null {
  const fromFormat = mapping.format === undefined ? null : aspectForFormat(mapping.format);
  return fromFormat ?? mapping.aspect ?? null;
}

/**
 * The concrete producer an id resolves to — a DISCRIMINATED UNION on `kind`,
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

/** ONE symbolic id, and what this installation resolves it to. */
export const SourceMappingSchema = z.object({
  /**
   * The symbolic id a scene declares, e.g. `guest-1`.
   *
   * THE SCENE'S OWN VOCABULARY (`LiveSourceIdSchema`), not a free string: an id
   * that cannot be declared can never be matched, so a mapping naming
   * `DECKLINK DEVICE 3` would be an entry that silently resolves nothing. The
   * concrete device belongs in `producer` and nowhere else.
   */
  id: LiveSourceIdSchema,
  /** What the operator sees, e.g. `Studio camera 2`. Absent ⇒ the id is shown. */
  label: z.string().optional(),
  /**
   * The signal format. THE FIT INPUT (design.md §3a): the crop-to-fill aspect
   * derives from this, so an operator states a format rather than a number.
   */
  format: LiveSourceFormatSchema.optional(),
  /**
   * The explicit aspect, used ONLY where the format determines none. Read it
   * through {@link mappingAspect}, never directly — the order between the two
   * is the decision.
   */
  aspect: z.number().positive().optional(),
  producer: SourceProducerSchema,
});
export type SourceMapping = z.infer<typeof SourceMappingSchema>;

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
 * The whole installation mapping, replaced at once.
 *
 * Whole-value set, not add/remove verbs, for the `delimiters.set` reason: two
 * browsers editing concurrently would interleave deltas into an order neither
 * operator chose, and the list is small and edited rarely.
 */
export const SourceMappingsSchema = z.object({
  mappings: z.array(SourceMappingSchema),
  /** Absent ⇒ no band is declared, and phase 5 has nowhere to place a producer. */
  layerRange: LiveSourceLayerRangeSchema.optional(),
});
export type SourceMappings = z.infer<typeof SourceMappingsSchema>;

/** The empty mapping — what an ABSENT file means, and what a fresh station has. */
export const EMPTY_SOURCE_MAPPINGS: SourceMappings = { mappings: [] };

/**
 * The validator's refusal codes, as ONE shared const so the wire contract and
 * `source-mapping-store.ts`'s error type cannot drift — the
 * `FIXED_LAYERS_SET_CONFIG_REASONS` pattern, and the same reason: a store and a
 * channel that spell a refusal separately eventually spell it differently.
 *
 * - `duplicate-id` — two entries claim one symbolic id, so which producer a
 *   template got would depend on array order.
 * - `overlaps-fixed-bank` / `overlaps-reserved` — the Live Source band must be
 *   disjoint from the operator's candidate bank AND from the playout system's
 *   reserved layers. Checked at LOAD and at every CHANGE; the message names
 *   BOTH ranges so the operator can see which side to move.
 */
export const SOURCES_SET_CONFIG_REASONS = [
  'duplicate-id',
  'overlaps-fixed-bank',
  'overlaps-reserved',
] as const;
export type SourcesSetConfigReason = (typeof SOURCES_SET_CONFIG_REASONS)[number];

/** Read the mapping in force. Empty `mappings` = nothing resolves (see the header). */
export const SourcesConfigChannel = defineChannel('sources.config', z.void(), SourceMappingsSchema);

/**
 * Replace the mapping in force: validate → apply → persist → publish.
 *
 * The BRIDGE is authoritative for the refusal and supplies the wording, so a
 * second browser, a stale client or a hand-written call cannot create a state
 * the UI is careful to prevent.
 */
export const SourcesSetConfigChannel = defineChannel(
  'sources.set-config',
  SourceMappingsSchema,
  z.object({
    ok: z.boolean(),
    reason: z.enum(SOURCES_SET_CONFIG_REASONS).optional(),
    message: z.string().optional(),
  }),
);

/** Pushed with the FULL mapping whenever it changes, so every browser converges. */
export const SourcesConfigChangedChannel = definePublishChannel(
  'sources.config-changed',
  SourceMappingsSchema,
);
