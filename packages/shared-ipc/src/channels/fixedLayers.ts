import { z } from 'zod';
import { FieldValuesSchema, IdSchema } from '@cg/shared-schema';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * R-021 — the fixed operator layer bank: the BANK shape (stage 1), the
 * wire contract (stage 2a: config read/update + per-slot state publish) and
 * the exact-slot LOAD (stage 3). Layer VERB channels arrive with stage 4.
 *
 * The bank declares a contiguous run of operator-designated layers on one
 * channel (default TEN at 70–79), each optionally aliased for display.
 * Numeric bounds that depend on OTHER config live in the VALIDATOR
 * (`tools/caspar-bridge/src/fixed-layers-store.ts`) — deliberately not here —
 * so refusals can name the ceiling and both offending ranges (design.md (a)/(e):
 * conflicts resolve loudly at config time). The schema carries only the
 * shape-local constraints.
 */
/**
 * THE built-in default bank — what a machine with NO persisted fixed-layers
 * file comes up with. Owner decision, 2026-07-30: channel 1, the full 70–99
 * ceiling, the top five rows ticked.
 *
 * WHY THESE ARE CONSTANTS AND NOT LITERALS. They are read from three places —
 * the schema's `.default()`s (what a PARTIAL file leaves unsaid),
 * {@link defaultFixedLayerBank} (what NO file means), and the bridge's boot
 * resolver — and two different answers to "the default bank" is precisely the
 * drift that put a four-layer bank on one machine and a thirty-layer bank on
 * another. One definition, three readers.
 */
export const DEFAULT_FIXED_BANK_CHANNEL = 1;
/** First layer of the default bank. */
export const DEFAULT_FIXED_BANK_START = 70;
/** Rows in the default bank — the full 70–99 ceiling. */
export const DEFAULT_FIXED_BANK_COUNT = 30;
/**
 * How many of the default bank's rows are TICKED (displayed), counting down
 * from its highest layer: 99, 98, 97, 96, 95. The other twenty-five are
 * declared — and therefore fenced from automatic allocation — but hidden, so
 * the operator can reveal one without a bridge restart (the ceiling is fixed
 * at install; the ticks are live).
 */
export const DEFAULT_FIXED_BANK_VISIBLE_ROWS = 5;

/**
 * 🔴 **`single-clock-look-switch` — THE SECOND DECLARED BANK, and it is LOW.**
 *
 * A template that declares live plates is a graphics **BED**: it draws the programme's
 * background and its plates are composited ON TOP of it, so its page must sit BELOW every
 * live-source layer. A template that declares none is FURNITURE — a logo, a super, a ticker
 * — and belongs above them, where the operator bank already is.
 *
 * ── WHY THIS IS A SUB-BANK AND NOT A SECOND `FixedLayerBank` ────────────────
 *
 * Because the identity `R-021` / `R-028` are built on must not split. Every consumer of a
 * fixed slot — `LayerManager.isFixed` / `bindFixed`, `#slots`, occupancy, quarantine,
 * `clearLayer`, the per-slot publish — keys on the `(channel, layer)` COORDINATE and asks
 * nothing about which bank it came from. Declaring the low rows inside the same bank object
 * means {@link fixedBankSlots} hands the LayerManager one union and every one of those
 * consumers keeps working untouched. A parallel bank object would have been a second place
 * a layer coordinate lives, which is the drift `design.md` §1 rejects in exactly these words.
 *
 * ── WHY 1–9 ─────────────────────────────────────────────────────────────────
 *
 * They are free (`DEFAULT_LAYER_POLICY` spans 10–69, this bank is 70–99, the playout
 * reservation is 60–69, the suggested Live Source band starts at 10) and they are BELOW every
 * band a station can declare, since `LiveSourceLayerRangeSchema` is validated disjoint from
 * both. **Layer 0 is excluded** — it is a legal layer number and reads as "unset" in too many
 * places to spend the ambiguity on one extra slot.
 */
export const MAX_LOW_FIXED_LAYER = 9;
/** First layer of the default bed bank. */
export const DEFAULT_LOW_BANK_START = 1;
/** Rows in the default bed bank — the whole free band. */
export const DEFAULT_LOW_BANK_COUNT = 9;
/**
 * How many bed rows are TICKED by default, counting down from the highest.
 *
 * TWO, not nine and not one. `B-195` found exactly ONE of the client's twelve packages
 * carries plates, so nine visible bed rows would be eight rows of noise; one would leave the
 * operator no way to stage the next programme's bed while the current one is on air without
 * first editing config. The other seven stay DECLARED — and therefore fenced — but hidden,
 * exactly the pattern the operator bank already uses for its twenty-five.
 */
export const DEFAULT_LOW_BANK_VISIBLE_ROWS = 2;

/**
 * 🔴 `B-202` — THE DEFAULT BED TICKS, COMPUTED IN ONE PLACE.
 *
 * There are TWO ways a bank reaches a reader with no bed half of its own: the schema's
 * `.default()` (a persisted file written before `low` existed) and {@link
 * defaultFixedLayerBank} (no file at all). Both call this, so they cannot give different
 * answers — which they did, for exactly as long as the schema default restated the shape
 * `{ start, count }` and left `visibility` out. `isLayerVisible` reads an absent tick as
 * VISIBLE, so an upgraded station got **nine** visible bed rows where a fresh one got two:
 * the "eight rows of noise" {@link DEFAULT_LOW_BANK_VISIBLE_ROWS} exists to prevent,
 * delivered to precisely the installs that had been running longest.
 *
 * ⚠ A FRESH RECORD every call, for the reason {@link defaultFixedLayerBank} gives about
 * itself: a shared literal handed to two readers is one mutation away from disagreeing.
 */
export function defaultLowBankVisibility(): Record<string, boolean> {
  const end = DEFAULT_LOW_BANK_START + DEFAULT_LOW_BANK_COUNT - 1;
  const ticks: Record<string, boolean> = {};
  for (let layer = DEFAULT_LOW_BANK_START; layer <= end; layer++) {
    ticks[String(layer)] = layer > end - DEFAULT_LOW_BANK_VISIBLE_ROWS;
  }
  return ticks;
}

/**
 * The LOW (bed) half of the bank. It carries no `channel` of its own: a bed and the plates
 * composited over it are on ONE channel by construction, so a second channel field would be
 * a value that can only ever be wrong.
 */
export const LowFixedLayerBankSchema = z.object({
  /** First bed layer. Immutable mid-session, like the operator bank's `start`. */
  start: z.number().int().positive().max(MAX_LOW_FIXED_LAYER).default(DEFAULT_LOW_BANK_START),
  /** Bed rows. Fixed at install, like the operator bank's `count`. */
  count: z.number().int().min(1).max(MAX_LOW_FIXED_LAYER).default(DEFAULT_LOW_BANK_COUNT),
  /** Optional display aliases, keyed by layer number (as a numeric string). */
  aliases: z.record(z.string().regex(/^\d+$/), z.string().min(1)).optional(),
  /** Per-layer visibility ticks. Absent means VISIBLE, as in the operator bank. */
  visibility: z.record(z.string().regex(/^\d+$/), z.boolean()).optional(),
});
export type LowFixedLayerBank = z.infer<typeof LowFixedLayerBankSchema>;

export const FixedLayerBankSchema = z.object({
  /** CasparCG channel the bank lives on (one channel per bank, v1). */
  channel: z.number().int().positive(),
  /** First layer of the bank. Immutable mid-session (validator-enforced). */
  start: z.number().int().positive().default(DEFAULT_FIXED_BANK_START),
  /**
   * R-028 — the FIXED CEILING of candidate layers. Immutable mid-session
   * (validator-enforced: `resize-refused`); changing it means editing the
   * persisted install config and restarting the bridge. The 89 layer ceiling
   * is validator-enforced. Replaces R-021's mutable, grow-at-end `count`.
   */
  count: z.number().int().min(1).max(30).default(DEFAULT_FIXED_BANK_COUNT),
  /** Optional display aliases, keyed by layer number (as a numeric string). */
  aliases: z.record(z.string().regex(/^\d+$/), z.string().min(1)).optional(),
  /**
   * R-028 — per-layer visibility ticks, keyed by layer number (as a numeric
   * string). An ABSENT key means VISIBLE (the default). Visibility controls
   * ONLY whether the row is DISPLAYED: every candidate layer stays fenced
   * from automatic allocation regardless of its tick (fencing derives from
   * `start`/`count`, never from this record), and unticking an occupied — or
   * unknown-occupancy — layer is refused by the validator (fail closed).
   */
  visibility: z.record(z.string().regex(/^\d+$/), z.boolean()).optional(),
  /**
   * `single-clock-look-switch` — the BED rows (see {@link LowFixedLayerBankSchema}).
   *
   * DEFAULTED, never optional. A station that has never heard of beds still gets 1–9 fenced,
   * which costs nothing (they were outside every allocation range already) and means no
   * reader anywhere has to branch on "is a bed bank declared?". A persisted file written
   * before this field existed parses into the default, so the upgrade needs no migration.
   *
   * ⚠ **`visibility` IS PART OF THAT DEFAULT AND MUST STAY PART OF IT (`B-202`).** This is
   * the path an UPGRADED station takes — every `bridge-fixed-layers.json` written before
   * `a7976e14` lacks `low` — so a default that omits the ticks is not "unspecified", it is
   * nine visible bed rows on the installs that have been running longest. A THUNK, so each
   * parse gets its own record rather than a shared one every caller could mutate.
   */
  low: LowFixedLayerBankSchema.default(() => ({
    start: DEFAULT_LOW_BANK_START,
    count: DEFAULT_LOW_BANK_COUNT,
    visibility: defaultLowBankVisibility(),
  })),
});
export type FixedLayerBank = z.infer<typeof FixedLayerBankSchema>;

/** The inclusive last layer of the OPERATOR half. */
export function fixedBankEnd(bank: Pick<FixedLayerBank, 'start' | 'count'>): number {
  return bank.start + bank.count - 1;
}

/** The inclusive last BED layer. */
export function lowBankEnd(bank: Pick<FixedLayerBank, 'low'>): number {
  return bank.low.start + bank.low.count - 1;
}

/**
 * 🔴 **THE canonical predicate: is this layer a BED row?**
 *
 * Every site that has to tell the two groups apart — the load refusal, the restore
 * migration, the alias, the visibility tick, the panel's grouping — calls THIS. A second
 * local `layer <= 9` is exactly how a name comes to lie about what it tests (golden rule 6),
 * and it would lie the first time a station declared its beds at 2–5.
 */
export function isLowBankLayer(bank: FixedLayerBank, layer: number): boolean {
  return layer >= bank.low.start && layer <= lowBankEnd(bank);
}

/**
 * 🔴 `B-201` — IS THIS COORDINATE A ROW OF THE BANK? Both halves, one answer.
 *
 * The bridge never needed this: its `LayerManager` is fenced with {@link fixedBankSlots} at
 * boot and answers membership from that set, so it learned about the beds for free. Anything
 * that does NOT hold a fenced set — the offline `MockRuntime` is the one that matters —
 * was left rebuilding the range by hand as `layer >= start && layer < start + count`, which
 * is the OPERATOR half and silently nothing else.
 *
 * That is what this exists to stop, and the cost of not having it is measured: three such
 * copies in `MockRuntime` (the exact-slot load, the bank-scoped clear, the owned-layer
 * clear) all kept refusing bed rows as `not-fixed` for a full change cycle after the beds
 * shipped — each one a predicate whose NAME said "is it in the bank" while its body asked a
 * narrower question (golden rule 6).
 *
 * Channel is PART of the question, not a caller's job: a bank is one channel by
 * construction, and a membership test that ignored it would call `2-70` a bank row.
 */
export function isFixedBankLayer(bank: FixedLayerBank, channel: number, layer: number): boolean {
  if (channel !== bank.channel) return false;
  return (layer >= bank.start && layer <= fixedBankEnd(bank)) || isLowBankLayer(bank, layer);
}

/**
 * Every slot the bank declares, BOTH halves, in one list — what the boot validator returns
 * and what the LayerManager is fenced with. The union is the whole reason the two-bank shape
 * costs the runtime nothing: `isFixed` keys on the coordinate and never asks which half.
 */
export function fixedBankSlots(bank: FixedLayerBank): { channel: number; layer: number }[] {
  const out: { channel: number; layer: number }[] = [];
  // Operator rows FIRST, beds after — the order the panel shows them in, and the order
  // that keeps a positional read of this list meaning what it meant before the beds
  // existed. Nothing downstream depends on it (the per-slot publish sorts), so it is
  // chosen for the reader.
  for (let layer = bank.start; layer <= fixedBankEnd(bank); layer++) {
    out.push({ channel: bank.channel, layer });
  }
  for (let layer = bank.low.start; layer <= lowBankEnd(bank); layer++) {
    out.push({ channel: bank.channel, layer });
  }
  return out;
}

/**
 * THE bank a station gets when it has declared none — channel 1, layers 70–99,
 * the top five ticked and the remaining twenty-five declared-but-hidden.
 *
 * THE POINT OF IT. A persisted fixed-layers file now records a DEVIATION from
 * this bank; it does not supply the bank. That is what makes a new machine
 * cheap to stand up: nothing to copy across, nothing to hand-edit, nothing to
 * remember. Before this, a machine with no file came up with NO candidate
 * layers at all and a machine with an old file came up with whatever that file
 * last said — the two failure modes that made "which bank am I on?" a question
 * anyone had to ask.
 *
 * IT RETURNS A FRESH OBJECT every call, deliberately. A shared module-level
 * literal would be one mutation away from a default that differs between two
 * readers in the same process, which is the exact class of bug the constants
 * above exist to close.
 *
 * VISIBILITY IS WRITTEN OUT IN FULL — all thirty keys, `true` for the top five
 * and `false` for the rest — rather than relying on `isLayerVisible`'s
 * absent-means-visible rule for the ticked ones. The bank is persisted verbatim
 * the first time the operator changes anything, and a file that states every
 * tick explicitly says what it means to the next person who opens it.
 */
export function defaultFixedLayerBank(): FixedLayerBank {
  const start = DEFAULT_FIXED_BANK_START;
  const end = start + DEFAULT_FIXED_BANK_COUNT - 1;
  const visibility: Record<string, boolean> = {};
  for (let layer = start; layer <= end; layer++) {
    visibility[String(layer)] = layer > end - DEFAULT_FIXED_BANK_VISIBLE_ROWS;
  }
  return {
    channel: DEFAULT_FIXED_BANK_CHANNEL,
    start,
    count: DEFAULT_FIXED_BANK_COUNT,
    visibility,
    low: {
      start: DEFAULT_LOW_BANK_START,
      count: DEFAULT_LOW_BANK_COUNT,
      // `B-202` — the SAME function the schema's own `.default()` calls, so "no file at all"
      // and "a file written before beds existed" cannot answer this differently.
      visibility: defaultLowBankVisibility(),
    },
  };
}

/**
 * R-028 — THE canonical visibility predicate: is this candidate layer's row
 * displayed? An absent `visibility` entry means VISIBLE. Bridge validator and
 * renderer both read THIS function — a second local copy of the default is how
 * "absent means visible" would drift.
 */
export function isLayerVisible(bank: FixedLayerBank, layer: number): boolean {
  // Each half carries its OWN ticks, and the dispatch is `isLowBankLayer` rather than a
  // merged record: two halves writing into one `visibility` map would make layer 3's tick
  // meaningful to a bank whose operator rows start at 70, which is a key that means two
  // different things depending on who reads it.
  const ticks = isLowBankLayer(bank, layer) ? bank.low.visibility : bank.visibility;
  return ticks?.[String(layer)] !== false;
}

/**
 * THE canonical position of a candidate layer within its bank: 1-based, counting
 * DOWN from the bank's HIGHEST layer. For a 70–73 bank, layer 73 is 1 and layer 70
 * is 4.
 *
 * WHY FROM THE TOP. The higher CasparCG layer draws OVER the ones beneath it, so it
 * is the higher-priority graphic — and the operator's "Layer 1" should mean the most
 * prominent one, not the bottom-most. The list is displayed descending by layer for
 * the same reason (it mirrors on-air z-order), so position 1 is also the top row on
 * screen: the `#` column reads 1, 2, 3, 4 downwards, which is what anyone expects a
 * row number to do.
 *
 * THIS IS THE ALIAS'S NUMBER, NOT THE `#` COLUMN'S. The two are different questions
 * and the owner settled them separately:
 *
 *   - the default alias (`Layer 1`, `Layer 2`, …) uses THIS — the layer's fixed place
 *     in the bank;
 *   - the `#` column is plain DISPLAY ORDER, 1 at the top of the rendered list.
 *
 * With the shipped bank (70–99 declared, the top five ticked) they read identically,
 * because the shown rows are the top five in order: `#1` is layer 99, which is
 * `Layer 1`. They can diverge only if a NON-CONTIGUOUS set is ticked — untick 97 and
 * the third visible row is `#3` but still `Layer 4`. That is the accepted trade, and
 * it falls out of the constraint below.
 *
 * IT IS BOUND TO THE BANK, NOT TO WHAT IS DISPLAYED, and that is the property that
 * makes the alias safe to say out loud. Ticking and unticking change what is shown;
 * neither may renumber anything. `Layer 1` is always the bank's highest layer whether
 * or not it is currently ticked. If unticking a row renumbered the ones past it,
 * "Layer 2" would mean different rows on different days — a positional handle that
 * silently renumbers is worse than none at all. This matters more with thirty declared
 * and five shown than it did with four of four.
 */
export function bankPosition(bank: FixedLayerBank, layer: number): number {
  // ONE rule, applied to whichever half the layer belongs to — counting down from THAT
  // half's highest layer. The alternative (numbering the beds on from the operator rows)
  // would make a bed's number move whenever the operator bank's count changed, which is
  // precisely the renumbering this function's contract forbids.
  if (isLowBankLayer(bank, layer)) return lowBankEnd(bank) - layer + 1;
  return fixedBankEnd(bank) - layer + 1;
}

/**
 * The default display name for an unaliased candidate layer — `Layer 1`, `Layer 2`, … for an
 * operator row, and `Bed 1`, `Bed 2`, … for a bed row.
 *
 * THE WORD IS PART OF THE REFUSAL. `wrong-bank`'s message tells the operator to use a bed
 * row; if the rows were all called `Layer N` there would be nothing on screen for that
 * sentence to point at, and two rows in different halves would share a name.
 */
export function defaultLayerAlias(bank: FixedLayerBank, layer: number): string {
  const word = isLowBankLayer(bank, layer) ? 'Bed' : 'Layer';
  return `${word} ${String(bankPosition(bank, layer))}`;
}

/**
 * THE configured alias for a candidate layer, from whichever half owns it — or `undefined`
 * when the operator has named none. The per-slot publish reads THIS rather than
 * `bank.aliases` directly, so a bed row's alias is not silently dropped.
 */
export function layerAlias(bank: FixedLayerBank, layer: number): string | undefined {
  const aliases = isLowBankLayer(bank, layer) ? bank.low.aliases : bank.aliases;
  return aliases?.[String(layer)];
}

/**
 * R-028 / C-015 — the RESERVED playout layers: the layer numbers the
 * company's playout system owns (it binds templates to playlist videos and
 * drives them over AMCP directly). Declared as inclusive ranges in install
 * config; NEVER inferred from the wire (OSC reports producer kind, not
 * identity, so a playout graphic and one of ours are indistinguishable
 * there). The candidate ceiling must never intersect these layers —
 * validator-enforced at load and at every change (`overlaps-reserved`) — and
 * automatic allocation is fenced off them entirely.
 */
/**
 * Upper bound for a declared reserved layer. CasparCG layers in practice sit
 * well under 1000; the cap exists so a typo'd range (`{ from: 0, to: 2e9 }`)
 * is a LEGIBLE schema refusal at boot, never an out-of-memory expansion.
 */
export const MAX_RESERVED_LAYER = 9999;

export const ReservedLayersSchema = z.object({
  /** Inclusive reserved ranges, e.g. `[{ "from": 60, "to": 69 }]`. */
  ranges: z.array(
    z
      .object({
        from: z.number().int().nonnegative().max(MAX_RESERVED_LAYER),
        to: z.number().int().nonnegative().max(MAX_RESERVED_LAYER),
      })
      .refine((r) => r.to >= r.from, { message: '`to` must be >= `from`' }),
  ),
});
export type ReservedLayers = z.infer<typeof ReservedLayersSchema>;

/** Expand the declared reserved ranges to a flat, de-duplicated layer list. */
export function reservedLayerNumbers(reserved: ReservedLayers): number[] {
  const out = new Set<number>();
  for (const { from, to } of reserved.ranges) {
    for (let layer = from; layer <= to; layer++) out.add(layer);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * R-021 stage 2a — the validator's refusal codes, as ONE shared const so the
 * wire contract and `fixed-layers-store.ts`'s `FixedLayersErrorCode` cannot
 * drift: the store DERIVES its type from this array (single source — the
 * repo's one-canonical-predicate rule applied to an error union).
 */
export const FIXED_LAYERS_SET_CONFIG_REASONS = [
  'exceeds-ceiling',
  'overlaps-policy',
  'overlaps-reserved',
  'alias-out-of-bank',
  'visibility-out-of-bank',
  'renumber-refused',
  'channel-change-refused',
  // R-028 — the ceiling is FIXED at install: grow and shrink are BOTH refused
  // mid-session (replaces R-021's grow-at-end allowance and its
  // `shrink-occupied` rule, which only a mutable count needed).
  'resize-refused',
  // R-028 — unticking a row is refused while its layer is OCCUPIED (a bound
  // item, retained intent, or an observed producer) …
  'untick-occupied',
  // … AND while its occupancy is UNKNOWN (no healthy primary / no fresh OSC).
  // Fail closed: unknown is never treated as empty — hiding a row that may be
  // on air would leave the operator no surface for a live graphic.
  'untick-unknown',
  // `single-clock-look-switch` — the two halves of the bank claim a layer in
  // common. Refused at config time with both ranges named, the `overlaps-*`
  // stance: one layer that is both a bed row and an operator row has no
  // answer to "does this composite above the plates or below them".
  'banks-overlap',
] as const;

/**
 * R-021 stage 2a — what the wire says about ONE fixed slot's occupancy. FACTS
 * ONLY, never a computed row state: verb derivation stays ONE function of
 * `(localItem, observation)` in the renderer (design (f)/(g)) — a
 * bridge-computed row state would be a second derivation that can drift.
 *
 * - `unknown` — the primary session is not healthy OR the occupancy tap has
 *   no fresh OSC. NEVER shown as empty (B-094 honesty: silence is not
 *   emptiness).
 * - `empty` — the tap is hearing and the layer is absent from occupancy
 *   (B-053: on a HEARING tap, silence for a layer IS empty).
 * - `producer` — the tap observed a foreground producer; `producer` is the
 *   kind verbatim (`"html"`, `"ffmpeg"`, …).
 */
export const FixedSlotObservationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unknown') }),
  z.object({ kind: z.literal('empty') }),
  z.object({ kind: z.literal('producer'), producer: z.string().min(1) }),
]);
export type FixedSlotObservation = z.infer<typeof FixedSlotObservationSchema>;

export const FixedSlotStateSchema = z.object({
  channel: z.number().int().positive(),
  layer: z.number().int().nonnegative(),
  /** The bank's display alias for this layer, when configured. */
  alias: z.string().min(1).optional(),
  observed: FixedSlotObservationSchema,
  /**
   * The item bound to this slot (stage 3 — `fixedLayers.load` is the only
   * thing that can produce a non-null value; `null` while the slot is
   * unbound). The field shipped in stage 2a so stage 2b's renderer never had
   * to amend the wire. Stage 4 extends it additively (`restore-blocked` rides
   * on the binding, never as a bridge-computed row state).
   */
  binding: z.union([
    z.null(),
    z.object({
      itemId: z.string().min(1),
      templateType: z.string().min(1),
      /**
       * R-028 (3.1) — WHICH template is on this row, resolved by the BRIDGE
       * (the item's `templateId` joined with its own registry), so every
       * browser gets the same answer — an item another browser loaded is not
       * foreign. Optional and additive: absent when the bridge cannot
       * establish identity (e.g. after ITS restart, until the item is
       * reloaded) — absence is the honest "unknown", never a guess.
       */
      templateId: z.string().min(1).optional(),
      /**
       * The registry's raw manifest/scene name for `templateId`, when it has
       * one. RAW facts, not a resolved label: the renderer resolves the
       * display label with its ONE canonical rule (`templateDisplayName` —
       * file name first, then this), never a second bridge-side copy.
       */
      templateName: z.string().min(1).optional(),
      /** The imported `.vcg` file name, verbatim (display resolution input). */
      sourceFileName: z.string().min(1).optional(),
      /**
       * R-021 stage 4 (task 3.1) — **RESTORE-BLOCKED**: this row's retained item
       * came back from a bridge restart, its declared layer is occupied by a
       * producer that is provably NOT ours, and the restore therefore PARKED
       * instead of acting. Absent (never `false`) on every other row.
       *
       * It rides the BINDING rather than an `observed` variant because it is a
       * fact about the ITEM's restore, not about the layer: the layer's own
       * account is already complete in `observed`
       * (`{ kind: 'producer', producer: 'decklink' }`), and the two together are
       * exactly what the row must show — "your clock is waiting; a decklink is on
       * layer 72". Publishing a computed `restore-blocked` ROW STATE instead
       * would be the second derivation this schema's header forbids: verb
       * derivation stays ONE function of `(localItem, observation)` in the
       * renderer.
       *
       * A DECIDED fact, never an inferred one. It is set only where the decision
       * is actually taken (`#decidePendingRestores`, against a HEARING tap), and
       * never re-derived from "a non-html producer sits under a binding" — a
       * BLIND tap yields `unverified`, not `blocked`, and collapsing the two
       * would let silence claim knowledge (B-093).
       */
      restoreBlocked: z.literal(true).optional(),
    }),
  ]),
});
export type FixedSlotState = z.infer<typeof FixedSlotStateSchema>;

/** Pull the configured bank; null when no bank is declared. */
export const FixedLayersConfigChannel = defineChannel(
  'fixedLayers.config',
  z.void(),
  z.union([FixedLayerBankSchema, z.null()]),
);

/**
 * R-021 stage 2a — apply a bank change to the RUNNING bridge. Validation is
 * `validateFixedBankChange` (the store's validators, never re-derived here):
 * grow-at-end and alias changes apply LIVE (design (e) — there is no on-air
 * block); renumber/channel-change and shrink-with-residents refuse with the
 * validator's own code in `reason`. Order on success: validate → apply →
 * persist (non-fatal) → publish. On refusal nothing is applied, persisted, or
 * published.
 */
export const FixedLayersSetConfigChannel = defineChannel(
  'fixedLayers.set-config',
  FixedLayerBankSchema,
  z.object({
    ok: z.boolean(),
    reason: z.enum(FIXED_LAYERS_SET_CONFIG_REASONS).optional(),
    message: z.string().optional(),
  }),
);

/** Pushed when a bank change is applied (null = no bank declared). */
export const FixedLayersConfigChangedChannel = definePublishChannel(
  'fixedLayers.config-changed',
  z.union([FixedLayerBankSchema, z.null()]),
);

/** Pull the current per-slot state ([] when no bank is declared). */
export const FixedLayersStateChannel = defineChannel(
  'fixedLayers.state',
  z.void(),
  z.array(FixedSlotStateSchema),
);

/** Pushed when the per-slot state CHANGES (never on idle sweeps; never with no bank). */
export const FixedLayersStateChangedChannel = definePublishChannel(
  'fixedLayers.state-changed',
  z.array(FixedSlotStateSchema),
);

/**
 * R-021 stage 3 — the refusal codes for an EXACT-SLOT load, as ONE shared
 * const (the `FIXED_LAYERS_SET_CONFIG_REASONS` pattern) so the wire contract,
 * the bridge and the renderer's wording map cannot drift.
 *
 * - `unknown-template` — the id is not in the bridge's registry (re-import).
 *   Shared spelling with `stack.load`, deliberately: it is the same fact.
 * - `not-fixed` — the coordinate is not a slot of the declared bank. The
 *   exact-slot path is for the OPERATOR BANK only; a dynamic layer is
 *   `stack.load`'s business and this channel must never become a second,
 *   unfenced door onto an arbitrary layer.
 * - `slot-bound` — the slot's layer already carries a producer, or the slot is
 *   bound to a DIFFERENT item. Rebinding is Remove-then-load, two explicit
 *   operator steps (the d1 rule: a compound verb must never hide a destructive
 *   step behind a constructive label). It refuses on OCCUPANCY rather than on the
 *   binding alone, so a row that has been CLEARed can take its own template back
 *   — the producer is gone even though the item is not.
 * - `rehearsing` — the row is on PVW. A load would put an UNMUTED producer under
 *   a row the UI says cannot reach air, so it is refused HERE and not only by a
 *   disabled button: a greyed control is a request, and a second browser with a
 *   stale snapshot reaches this method with that opinion nowhere in sight. Same
 *   spelling and same reasoning as `stack.take`'s interlock.
 */
export const FIXED_LAYERS_LOAD_REASONS = [
  'unknown-template',
  'not-fixed',
  'slot-bound',
  'rehearsing',
  /**
   * 🔴 `single-clock-look-switch` — **the package belongs to the OTHER half of the bank**,
   * and it is refused in BOTH directions because both mistakes are on-air faults:
   *
   *   - a plate-bearing package onto an OPERATOR row composites its own background OVER
   *     the plates it declares — every guest picture hidden behind the bed that was meant
   *     to sit under them;
   *   - a furniture package onto a BED row composites the logo/super/ticker UNDER any live
   *     picture, so it silently disappears the moment a plate covers it.
   *
   * The classification is derived, never chosen: see `requiredBankFor` in `templates.ts`.
   * A checkbox someone forgets to tick is this project's standing objection to guards that
   * fail quietly (`design.md` §9a-Z).
   */
  'wrong-bank',
] as const;

/**
 * R-021 stage 3 — create an item bound to an EXACT fixed slot and pre-roll it
 * (`CG ADD`, never `CG PLAY` — B-039: the operator's take puts it on air).
 *
 * It is a SEPARATE channel from `stack.load` because the two resolve a layer
 * by opposite rules and must not share one: `stack.load` ALLOCATES from the
 * dynamic policy ranges, while this one binds the exact coordinate the
 * operator's row names, through `LayerManager.bindFixed` — the fixed path.
 * `reserve()` refuses fixed slots by construction, so there is no way to reach
 * a fixed slot through the dynamic path, and no way to reach a dynamic layer
 * through this one (`not-fixed`).
 *
 * The created item is an ORDINARY stack item: it appears on the stack, carries
 * the same C-012 verbs there, and is removed the same way — the fixed row is
 * an additional, permanent surface onto it, not a parallel item kind.
 */
/**
 * The refusal codes for the BANK-SCOPED layer clear, as ONE shared const (the
 * `FIXED_LAYERS_SET_CONFIG_REASONS` pattern) so the wire contract, the bridge and the
 * renderer cannot drift.
 *
 * - `not-in-bank` — the coordinate is not a layer of the DECLARED bank (on the bank's
 *   channel). Also the answer when no bank is declared at all: with no bank, no layer
 *   is in it. This is the guard that keeps the channel from becoming a
 *   clear-anything door.
 * - `reserved` — the layer is inside the reserved playout range. ABSOLUTE, and checked
 *   FIRST so it wins even if a bank were ever to overlap the reservation.
 * - `amcp-error` — the guard passed and CasparCG refused or the send failed.
 */
export const FIXED_LAYERS_CLEAR_LAYER_REASONS = ['not-in-bank', 'reserved', 'amcp-error'] as const;

/**
 * Clear ONE layer of the declared bank, addressed by LAYER and permitted by
 * STRUCTURE — never by observation.
 *
 * WHY THIS EXISTS AS A THIRD DOOR. The owner's requirement is that a graphic can
 * always be taken off, including when something is wrong in a way nobody predicted.
 * Neither existing channel delivers that:
 *
 *   - `stack.out` is ITEM-scoped. With no bound item there is nothing to address, so
 *     enabling it on an empty row produces a no-op that REPORTS SUCCESS — the exact
 *     lie this capability exists to prevent.
 *   - `layers.clear` refuses a `foreign` layer without a fresh `html` observation,
 *     which is precisely the `unknown`-occupancy case being asked about. It declines
 *     exactly when it is needed.
 *
 * So this one consults NEITHER occupancy NOR item status — that indifference is the
 * whole point, because those are the things that may be wrong. Its permission comes
 * from two structural facts, both required, both derived from CONFIG so no UI state
 * can bypass them: the layer is in the declared bank, and it is not reserved.
 *
 * "DECLARED BANK" MEANS THE BANK AS CONFIGURED, NOT THE ROWS CURRENTLY SHOWN. A
 * ticked/unticked row is a display concern; membership is not. Computing membership
 * from visible rows would mean unticking a row silently removed it from the guard's
 * world — so the predicate is the LayerManager's config-derived `isFixed`, which
 * enumerates every declared layer regardless of its tick.
 *
 * THIS ADDS A CAPABILITY, IT DOES NOT WIDEN AN EXISTING ONE. `layers.clear` keeps
 * refusing foreign layers, the orphan sweep keeps skipping the reservation, and the
 * playout tab keeps its html-only rule. All three are untouched.
 */
export const FixedLayersClearLayerChannel = defineChannel(
  'fixedLayers.clear-layer',
  z.object({
    channel: z.number().int().positive(),
    layer: z.number().int().nonnegative(),
  }),
  z.object({
    ok: z.boolean(),
    reason: z.enum(FIXED_LAYERS_CLEAR_LAYER_REASONS).optional(),
    /** Human wording for the refusal, so the toast can name which guard fired. */
    message: z.string().optional(),
  }),
);

export const FixedLayersLoadChannel = defineChannel(
  'fixedLayers.load',
  z.object({
    channel: z.number().int().positive(),
    layer: z.number().int().nonnegative(),
    itemId: IdSchema,
    templateId: IdSchema,
    fields: FieldValuesSchema,
  }),
  z.object({
    accepted: z.boolean(),
    /** Free-form so an AMCP/`stack.load` code can pass through verbatim (B-070). */
    errorCode: z.string().optional(),
  }),
);
