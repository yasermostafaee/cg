import { z } from 'zod';
import {
  LIVE_SOURCE_FORMATS,
  checkSourceCatalog,
  type LiveSourceFormat,
  type LiveSourceLayerRange,
  type SourceCatalog,
  type SourceDefinition,
  type SourceProducer,
} from './channels/sources.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` — **THE PLAYOUT DEFINES THE SOURCES.** Contract v1.2 gives CG Control the
 * Playout's input list (D10, `GET /api/cg/inputs`) and its media library (D11, `GET /api/cg/media`);
 * v1.3 adds the holder channel's `route` shape. The contract is `docs/integration/playout/`, and where
 * their answer differs from our request their answer wins (`PLAYOUT-CG-RESPONSE-INPUTS-MEDIA-v1.md`).
 *
 * This module is the ONE place the shapes are read and the ONE builder that turns what was read into
 * the catalogue every plate resolves against. The bridge, the fake Playout and the offline mock all
 * import it, so they cannot come to read one answer two ways.
 */

// ── Credentials ─────────────────────────────────────────────────────────────

/**
 * 🔴 `PLAYOUT-SOURCES-01` §1.E — a stream URL can carry `user:pass@` (their answer §1.2, and every CG
 * role can read D10), so every line this product WRITES that can hold one goes through here:
 * `scheme://anything@` becomes `scheme://***@`. The userinfo runs to the LAST `@` before the path, so
 * a password with an `@` in it is redacted whole. Idempotent.
 */
export function redactUrlCredentials(text: string): string {
  return text.replace(/([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\s/"'<>]*@/g, '$1***@');
}

// ── The route gate ──────────────────────────────────────────────────────────

/** The reason every `route` input carries while the gate holds (the prompt's words). */
export const ROUTE_NOT_SUPPORTED_YET = 'Not supported yet.';

/**
 * 🔴 **THE ONE ROUTE GATE.** Contract v1.3 brings every exclusive input as a `route` to the Playout's
 * holder channel, and seating one safely needs rules 2, 4 and 5 (audio before `PLAY`, `LOADBG`
 * timing, the epoch) — `ROUTE-PLATES-01`'s work. Until that lands, a `route` input is listed and can
 * never be bound or seated: this answers the reason it is held back, and `ROUTE-PLATES-01` removes the
 * gate HERE, in one place, by answering `null`.
 */
export function routeInputGate(): string | null {
  return ROUTE_NOT_SUPPORTED_YET;
}

// ── D10: the inputs ─────────────────────────────────────────────────────────

/** A Playout id: stable forever, `[A-Za-z0-9_-]`, 1–48 characters (both D10 and D11). */
export const PlayoutIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,48}$/);

/** A v1.3 `compatibleChannels` member: a channel of a core this input may be routed onto. */
export const PlayoutCompatibleChannelSchema = z.object({
  casparHost: z.string().min(1),
  casparChannel: z.number().int().positive(),
});
export type PlayoutCompatibleChannel = z.infer<typeof PlayoutCompatibleChannelSchema>;

/** The producer shapes D10 may carry (v1.2's four, plus v1.3's `videoMode` on a route). */
const PlayoutProducerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('decklink'), device: z.number().int().positive() }),
  z.object({
    kind: z.literal('route'),
    channel: z.number().int().positive(),
    layer: z.number().int().nonnegative().optional(),
    videoMode: z.string().nullable().optional().catch(undefined),
  }),
  z.object({ kind: z.literal('ndi'), source: z.string().min(1) }),
  z.object({ kind: z.literal('stream'), url: z.string().min(1) }),
]);

/**
 * ONE D10 input, as kept. LENIENT: a field the list can do without is dropped rather than voiding the
 * input, and `producer` is kept as sent — the builder decides what it can be (an input whose producer
 * this product cannot express is left out, like one without an id).
 */
export const PlayoutInputSchema = z.object({
  id: PlayoutIdSchema,
  name: z.string().trim().min(1),
  casparHost: z.string().min(1).optional().catch(undefined),
  producer: z.unknown(),
  format: z.string().min(1).optional().catch(undefined),
  aspect: z.number().positive().optional().catch(undefined),
  available: z.boolean().optional().catch(undefined),
  reason: z.string().trim().min(1).optional().catch(undefined),
  compatibleChannels: z.array(PlayoutCompatibleChannelSchema).optional().catch(undefined),
});
export type PlayoutInput = z.infer<typeof PlayoutInputSchema>;

/** v1.3's `epoch`: changes with every core start. Kept, not acted on here (`ROUTE-PLATES-01`). */
export const PlayoutEpochSchema = z.union([z.number(), z.string().min(1)]);
export type PlayoutEpoch = z.infer<typeof PlayoutEpochSchema>;

/**
 * Read a D10 body. `null` = not a D10 answer at all (a failed read). Otherwise every input that has an
 * id and a name is kept, in the Playout's order; `epoch` is optional (v1.2, and `2.9.0` with the holder
 * off, carry none).
 */
export function parsePlayoutInputs(
  body: unknown,
): { readonly inputs: PlayoutInput[]; readonly epoch?: PlayoutEpoch } | null {
  const top = z
    .object({ inputs: z.array(z.unknown()), epoch: PlayoutEpochSchema.optional().catch(undefined) })
    .safeParse(body);
  if (!top.success) return null;
  const inputs: PlayoutInput[] = [];
  for (const raw of top.data.inputs) {
    const parsed = PlayoutInputSchema.safeParse(raw);
    if (parsed.success) inputs.push(parsed.data);
  }
  return top.data.epoch === undefined ? { inputs } : { inputs, epoch: top.data.epoch };
}

// ── D11: the media ──────────────────────────────────────────────────────────

/** ONE D11 item as received. `clip` is an ABSOLUTE path with `/` (their answer §2.1). */
export const PlayoutMediaItemSchema = z.object({
  id: PlayoutIdSchema,
  name: z.string().trim().min(1),
  clip: z.string().min(1),
  type: z.string().min(1),
  durationMs: z.number().nonnegative().optional().catch(undefined),
  width: z.number().int().positive().optional().catch(undefined),
  height: z.number().int().positive().optional().catch(undefined),
  folder: z.string().optional().catch(undefined),
  updatedAt: z.string().optional().catch(undefined),
});
export type PlayoutMediaItem = z.infer<typeof PlayoutMediaItemSchema>;

/** The types a plate may show. `audio` is never offered (their answer §2.2: no stills today). */
export const PLATE_MEDIA_TYPES = ['video', 'still'] as const;

/**
 * Read a D11 page. `null` = not a D11 answer. Items without an id, name or clip are dropped, and so is
 * any item whose type is not a plate's — audio is never offered even if the Playout sends one.
 */
export function parsePlayoutMediaPage(body: unknown): {
  readonly items: PlayoutMediaItem[];
  readonly total: number;
  readonly nextCursor: string | null;
} | null {
  const top = z
    .object({
      items: z.array(z.unknown()),
      total: z.number().int().nonnegative().optional().catch(undefined),
      nextCursor: z.string().min(1).nullable().optional().catch(null),
    })
    .safeParse(body);
  if (!top.success) return null;
  const items: PlayoutMediaItem[] = [];
  for (const raw of top.data.items) {
    const parsed = PlayoutMediaItemSchema.safeParse(raw);
    if (!parsed.success) continue;
    if (!(PLATE_MEDIA_TYPES as readonly string[]).includes(parsed.data.type)) continue;
    items.push(parsed.data);
  }
  return {
    items,
    total: top.data.total ?? items.length,
    nextCursor: top.data.nextCursor ?? null,
  };
}

// ── What the bridge keeps ───────────────────────────────────────────────────

/**
 * 🔴 **THE LAST GOOD INPUT LIST, as persisted** (`bridge-playout-inputs.json`). `inputs` is the latest
 * successful read, in the Playout's order; `departed` holds every input an earlier good read listed
 * and a later one did not — kept, never deleted by a read, and shown `unavailable` so a binding to it
 * keeps its name. An input that comes back moves back to `inputs`.
 */
export const PlayoutInputsStateSchema = z.object({
  /** ISO time of the last SUCCESSFUL read (a `304` counts). Absent = never read. */
  readAt: z.string().optional(),
  epoch: PlayoutEpochSchema.optional(),
  inputs: z.array(PlayoutInputSchema),
  departed: z.array(PlayoutInputSchema),
});
export type PlayoutInputsState = z.infer<typeof PlayoutInputsStateSchema>;

export const EMPTY_PLAYOUT_INPUTS: PlayoutInputsState = { inputs: [], departed: [] };

/**
 * Fold a SUCCESSFUL read into what is kept: the new list in force, every input that left it moved to
 * `departed`, every one that came back taken out of it. Pure.
 */
export function foldPlayoutInputsRead(
  held: PlayoutInputsState,
  read: { readonly inputs: readonly PlayoutInput[]; readonly epoch?: PlayoutEpoch },
  readAt: string,
): PlayoutInputsState {
  const now = new Set(read.inputs.map((i) => i.id));
  const departed = new Map(held.departed.map((i) => [i.id, i] as const));
  for (const before of held.inputs) if (!now.has(before.id)) departed.set(before.id, before);
  for (const id of now) departed.delete(id);
  return {
    readAt,
    ...(read.epoch !== undefined ? { epoch: read.epoch } : {}),
    inputs: [...read.inputs],
    departed: [...departed.values()],
  };
}

/**
 * 🔴 **A MEDIA ITEM THIS STATION HAS BOUND**, as persisted (`bridge-bound-media.json`). Nothing else
 * from the library is stored. `unavailable` is set when a successful `ids=` read left it out ("not
 * playable now" — their answer §2.1), and cleared when one lists it again.
 */
export const BoundMediaItemSchema = z.object({
  id: PlayoutIdSchema,
  name: z.string().min(1),
  clip: z.string().min(1),
  type: z.string().min(1),
  durationMs: z.number().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  folder: z.string().optional(),
  lastBoundAt: z.string(),
  unavailable: z.literal(true).optional(),
});
export type BoundMediaItem = z.infer<typeof BoundMediaItemSchema>;

export const BoundMediaStateSchema = z.object({ items: z.array(BoundMediaItemSchema) });
export type BoundMediaState = z.infer<typeof BoundMediaStateSchema>;

/** A read media item as the bound set keeps it. */
export function toBoundMedia(item: PlayoutMediaItem, lastBoundAt: string): BoundMediaItem {
  return {
    id: item.id,
    name: item.name,
    clip: item.clip,
    type: item.type,
    ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}),
    ...(item.width !== undefined ? { width: item.width } : {}),
    ...(item.height !== undefined ? { height: item.height } : {}),
    ...(item.folder !== undefined ? { folder: item.folder } : {}),
    lastBoundAt,
  };
}

// ── Catalogue ids ───────────────────────────────────────────────────────────

/** The catalogue id of a D10 input — `in-<id>`. Never shown to anyone. */
export const inputSourceId = (playoutId: string): string => `in-${playoutId}`;
/** The catalogue id of a D11 item — `md-<id>`. Never shown to anyone. */
export const mediaSourceId = (playoutId: string): string => `md-${playoutId}`;

/** The Playout id behind a catalogue id, when it is a media one. */
export function playoutMediaIdOf(sourceId: string): string | null {
  return sourceId.startsWith('md-') && sourceId.length > 3 ? sourceId.slice(3) : null;
}

// ── The builder ─────────────────────────────────────────────────────────────

/** The operator's sentences for why an entry cannot be used (shown in a `title`). */
export const INPUT_GONE_REASON = "Not in the Playout's input list.";
export const MEDIA_GONE_REASON = 'Not available in the Playout right now.';
export const ROUTE_NO_LAYER_REASON = 'The Playout gave this input no layer.';
export const OTHER_SERVER_REASON = "Not played on this station's server.";
export const DUPLICATE_NAME_REASON = 'Another input has the same name.';
/** The Playout marked it unavailable (v1.3 health) and gave no reason of its own. */
export const SIGNAL_UNAVAILABLE_REASON = 'The Playout reports it unavailable.';

export interface PlayoutCatalogInput {
  readonly inputs: PlayoutInputsState;
  readonly media: readonly BoundMediaItem[];
  readonly layerRange?: LiveSourceLayerRange | undefined;
  /**
   * D4's host rule for an input's own `casparHost` (after the loopback rewrite): is it a server this
   * station drives? Absent `casparHost` is always ours (one core per install — their answer S1).
   */
  readonly hostIsOurs: (casparHost: string) => boolean;
  /**
   * D4's join for v1.3's `compatibleChannels`: the station channel a `(casparHost, casparChannel)` pair
   * names, or `null` when it names none of ours. The SAME rule D4's rows join by.
   */
  readonly channelFor: (casparHost: string, casparChannel: number) => number | null;
}

/** A D10 format read case-insensitively; `undefined` for one this product does not know. */
function formatOf(format: string | undefined): LiveSourceFormat | undefined {
  if (format === undefined) return undefined;
  const key = format.trim().toLowerCase();
  return LIVE_SOURCE_FORMATS.find((f) => f.toLowerCase() === key);
}

/** The case- and space-insensitive name key — the catalogue validator's own. */
const nameKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** What this product can send for a D10 producer, or `null` when it can express none of it. */
function producerOf(raw: unknown): SourceProducer | null {
  const parsed = PlayoutProducerSchema.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  switch (p.kind) {
    case 'decklink':
      return { kind: 'decklink', device: p.device };
    case 'route':
      return {
        kind: 'route',
        channel: p.channel,
        ...(p.layer !== undefined ? { layer: p.layer } : {}),
        ...(p.videoMode !== undefined ? { videoMode: p.videoMode } : {}),
      };
    case 'ndi':
      return { kind: 'ndi', source: p.source };
    case 'stream':
      return { kind: 'stream', url: p.url };
  }
}

/** The reason an input cannot be bound at all, or `null` when it can. */
function unusableReason(
  input: PlayoutInput,
  producer: SourceProducer,
  hostIsOurs: (casparHost: string) => boolean,
): string | null {
  if (input.casparHost !== undefined && !hostIsOurs(input.casparHost)) return OTHER_SERVER_REASON;
  if (producer.kind === 'route') {
    // v1.3 rule 3 — a route with no layer stacks every held input.
    if (producer.layer === undefined) return ROUTE_NO_LAYER_REASON;
    const gate = routeInputGate();
    if (gate !== null) return gate;
  }
  // The SAME rules a hand-made entry passed — asked of the one validator, never restated here.
  const check = checkSourceCatalog(
    { sources: [{ id: 'in-check', name: input.name, producer }] },
    { fixedBank: null, reservedLayers: [] },
  );
  return check.ok ? null : check.message;
}

/**
 * 🔴 **THE ONE RESOLUTION: what the Playout offers, and what this station has bound, as the catalogue
 * every plate resolves against.** Called by the bridge on every change to what it read, and by the
 * offline mock over its local lists — never a second copy.
 *
 * The inputs come first, in the Playout's order, then the ones that left the list (`unavailable`),
 * then the bound media. Nothing is ever dropped because it went away: a binding to it keeps its name
 * and reads `unavailable`, and the take refuses it before any AMCP.
 */
export function buildPlayoutSourceCatalog(input: PlayoutCatalogInput): SourceCatalog {
  const sources: SourceDefinition[] = [];
  const names = new Map<string, number>();
  for (const i of input.inputs.inputs)
    names.set(nameKey(i.name), (names.get(nameKey(i.name)) ?? 0) + 1);

  const entryFor = (i: PlayoutInput, departed: boolean): SourceDefinition | null => {
    const producer = producerOf(i.producer);
    if (producer === null) return null;
    const format = formatOf(i.format);
    const channels =
      i.compatibleChannels === undefined
        ? undefined
        : [
            ...new Set(
              i.compatibleChannels
                .map((c) => input.channelFor(c.casparHost, c.casparChannel))
                .filter((c): c is number => c !== null),
            ),
          ].sort((a, b) => a - b);
    const unusable = unusableReason(i, producer, input.hostIsOurs);
    const status: SourceDefinition['status'] = departed
      ? 'unavailable'
      : unusable !== null
        ? 'unusable'
        : i.available === false
          ? 'unavailable'
          : undefined;
    const reason = departed
      ? INPUT_GONE_REASON
      : (unusable ??
        (i.available === false ? (i.reason ?? SIGNAL_UNAVAILABLE_REASON) : undefined) ??
        ((names.get(nameKey(i.name)) ?? 0) > 1 ? DUPLICATE_NAME_REASON : undefined));
    return {
      id: inputSourceId(i.id),
      name: i.name,
      origin: 'input',
      // An unknown format reads as AUTO, and the Playout's `aspect` (always sent) decides.
      format: format ?? 'AUTO',
      ...(i.aspect !== undefined ? { aspect: i.aspect } : {}),
      producer,
      ...(status !== undefined ? { status } : {}),
      ...(departed ? { departed: true as const } : {}),
      ...(reason !== undefined ? { reason } : {}),
      ...(channels !== undefined ? { channels } : {}),
    };
  };

  for (const i of input.inputs.inputs) {
    const entry = entryFor(i, false);
    if (entry !== null) sources.push(entry);
  }
  for (const i of input.inputs.departed) {
    const entry = entryFor(i, true);
    if (entry !== null) sources.push(entry);
  }
  for (const m of input.media) {
    sources.push({
      id: mediaSourceId(m.id),
      name: m.name,
      origin: 'media',
      ...(m.width !== undefined && m.height !== undefined ? { aspect: m.width / m.height } : {}),
      producer: { kind: 'media', file: m.clip },
      ...(m.unavailable === true
        ? { status: 'unavailable' as const, departed: true as const, reason: MEDIA_GONE_REASON }
        : {}),
      media: {
        ...(m.durationMs !== undefined ? { durationMs: m.durationMs } : {}),
        ...(m.width !== undefined ? { width: m.width } : {}),
        ...(m.height !== undefined ? { height: m.height } : {}),
        ...(m.folder !== undefined ? { folder: m.folder } : {}),
        lastBoundAt: m.lastBoundAt,
      },
    });
  }
  return {
    sources,
    ...(input.layerRange !== undefined ? { layerRange: input.layerRange } : {}),
    ...(input.inputs.readAt !== undefined ? { inputsReadAt: input.inputs.readAt } : {}),
  };
}

/**
 * The catalogue as a CONSOLE may hold it: every stream URL with its credentials redacted. The console
 * never shows a URL at all; this makes sure it never even holds a password.
 */
export function redactCatalogForConsole(catalog: SourceCatalog): SourceCatalog {
  return {
    ...catalog,
    sources: catalog.sources.map((s) =>
      s.producer.kind === 'stream'
        ? { ...s, producer: { ...s.producer, url: redactUrlCredentials(s.producer.url) } }
        : s,
    ),
  };
}

/**
 * Whether a catalogue entry may be BOUND (a hand-crafted request included): a usable one, or one the
 * Playout still lists while marking it unavailable (v1.3: set up ahead of time) — never an unusable
 * one, and never one the Playout no longer offers.
 */
export function sourceBindable(entry: SourceDefinition): boolean {
  return entry.status !== 'unusable' && entry.departed !== true;
}

/** Whether a catalogue entry may be SEATED: only a usable one. */
export function sourceSeatable(entry: SourceDefinition): boolean {
  return entry.status === undefined;
}

/**
 * 🔴 §1.C — **WHY AN ENTRY A PLATE IS BOUND TO CANNOT GO ON AIR NOW, in the operator's words** —
 * the entry's NAME and the clause after it, apart, so a console can isolate the name (it is often
 * Persian) while the bridge writes the same words as one line. The two sentences for an entry the
 * Playout stopped offering are the prompt's own:
 *
 *   “Studio 5” is not in the Playout's input list.
 *   “تیتراژ خبر ۲۰” is not available in the Playout right now.
 *
 * ONE spelling, for the bridge's refusal message and the console's row line alike.
 */
export function unseatableWords(source: {
  readonly name: string;
  readonly origin?: 'input' | 'media' | undefined;
  readonly status?: SourceDefinition['status'];
  readonly departed?: true | undefined;
  readonly reason?: string | undefined;
}): { readonly name: string; readonly rest: string } {
  if (source.status === 'unavailable' && source.departed === true) {
    return {
      name: source.name,
      rest:
        source.origin === 'media'
          ? ' is not available in the Playout right now.'
          : " is not in the Playout's input list.",
    };
  }
  if (source.status === 'unavailable') {
    return {
      name: source.name,
      rest: ` is unavailable: ${source.reason ?? 'the Playout reports it so.'}`,
    };
  }
  return { name: source.name, rest: ` cannot be played: ${source.reason ?? 'it is not usable.'}` };
}

/** {@link unseatableWords} as one line: `“name” clause`. */
export function unseatableClause(source: Parameters<typeof unseatableWords>[0]): string {
  const words = unseatableWords(source);
  return `“${words.name}”${words.rest}`;
}

/**
 * 🔴 `PLAYOUT-SOURCES-01` — **A NEW BINDING MUST BE TO SOMETHING BINDABLE; AN EXISTING ONE IS NEVER
 * REFUSED FOR WHAT HAPPENED TO ITS ENTRY.** Every door that takes a whole set of bindings — the
 * template defaults, a row's look bindings — asks this about each binding that is new or changed
 * against the set in force. One that is unchanged passes whatever became of its entry, because only an
 * operator action removes a binding (ADR 0010 rule 14): an input the Playout dropped must not make
 * every OTHER edit impossible until someone unbinds it.
 *
 * Answers `null` when every changed binding is bindable, or the one sentence for the first that is not.
 */
export function unbindableChange(
  next: readonly { readonly key: string; readonly sourceId: string }[],
  current: readonly { readonly key: string; readonly sourceId: string }[],
  catalog: SourceCatalog,
): { readonly code: 'unknown-source' | 'source-unusable'; readonly message: string } | null {
  const held = new Map(current.map((b) => [b.key, b.sourceId] as const));
  const byId = new Map(catalog.sources.map((s) => [s.id, s] as const));
  for (const binding of next) {
    if (held.get(binding.key) === binding.sourceId) continue;
    const entry = byId.get(binding.sourceId);
    if (entry === undefined) {
      return {
        code: 'unknown-source',
        message: 'That source is not one the Playout offers. Choose another.',
      };
    }
    if (!sourceBindable(entry)) {
      return {
        code: 'source-unusable',
        message: `“${entry.name}” cannot be bound: ${entry.reason ?? 'it is not available.'}`,
      };
    }
  }
  return null;
}
