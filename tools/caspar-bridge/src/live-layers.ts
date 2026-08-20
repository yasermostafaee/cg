import { z } from 'zod';
import type { LiveLayerState } from '@cg/shared-ipc';
import type { CommandSlot } from './command-builder.js';

/**
 * D-137 / C-015 phase 2.5 — the LIVE LAYER LEDGER's types. **Defined, not yet
 * wired**: phase 5 adds the field to `CasparRuntime` and the three ownership
 * doors that read it. Landing the shape first keeps phase 2 free of any change
 * to what the bridge does on air.
 *
 * ── WHY A SECOND LEDGER AND NOT A WIDER `#slots` ────────────────────────────
 *
 * `#slots` is `Map<itemId, CommandSlot>` — ONE coordinate per stack item, which
 * answers "where does this item's TEMPLATE live". Nine read sites depend on that
 * question, and an item owning N layers is unrepresentable in it. Widening its
 * value type would touch every one of those sites for a reason none of them
 * share, so the Live Source ledger sits BESIDE it (`design.md` §4).
 *
 * ── WHY THIS IS NOT `reservedLayers` ────────────────────────────────────────
 *
 * `reservedLayers` is a fence AWAY from a foreign owner — the layer numbers the
 * company's PLAYOUT SYSTEM owns (`packages/shared-ipc/src/channels/fixedLayers.ts`).
 * A Live Source layer is the exact inverse: a layer the BRIDGE owns. Putting one
 * in `reservedLayers` makes it unplaceable (`allocate()` skips reserved layers),
 * unreservable (`reserve()` refuses them) and unclearable (`clearLayer` refuses
 * them as `reserved`) through every existing door. That trap is why phase 2.6
 * corrects the comments that invited it.
 */

/**
 * A rect in CHANNEL-NORMALIZED space — each component a fraction of the channel
 * raster on its OWN axis (`x`/`width` against width, `y`/`height` against
 * height), which is how `MIXER FILL` normalizes (measured on hardware,
 * `design.md` §0b fact 1). This is NOT scene pixels and NOT a uniform fraction.
 */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * ONE layer the bridge created to composite a live source behind a template's
 * hole.
 *
 * `fill` and `clip` are recorded TOGETHER because they are not independent.
 * `MIXER CLIP` masks in the same channel-normalized space as `FILL` and does not
 * travel with it (measured on 2.5.0 and re-confirmed on the plant's 2.3.2), so a
 * fill box that moves out from under its clip window renders NOTHING AT ALL —
 * a black hole where a guest should be. They are two outputs of one computation
 * (`design.md` §3), and a ledger that remembered only half would let a later
 * re-emission put them apart.
 */
export interface LiveLayerRecord {
  /** The `(channel, layer)` this producer occupies. Inside the declared Live Source range. */
  readonly slot: CommandSlot;
  /** The SYMBOLIC id from the scene's declaration, e.g. `guest-1`. Never a device. */
  readonly sourceId: string;
  /**
   * Which half of a fill+key pair this layer carries. `'fill'` is every
   * `route://` and media case; `'key'` exists only for a fill+key input pair,
   * whose compositing is C-021's (hardware-blocked), not this change's.
   */
  readonly role: 'fill' | 'key';
  /**
   * The concrete producer argument actually sent — what the installation's
   * mapping resolved `sourceId` to (`route://1-1`, a `DECKLINK DEVICE …` form,
   * an NDI name). Recorded as SENT rather than as configured, so the ledger says
   * what is on the layer and not what a since-edited mapping now says.
   */
  readonly producer: string;
  /** The `MIXER … FILL` rect last emitted for this layer. */
  readonly fill: NormalizedRect;
  /** The `MIXER … CLIP` mask emitted in the SAME batch as {@link fill}. */
  readonly clip: NormalizedRect;
  /**
   * C-015 phase 6 (6.5 / 6.9c) — **the volume this PLATE is intended to have.**
   *
   * `0` for every plate the bridge seats today: every producer it creates is
   * created muted, and audio is raised only by an explicit recorded intent naming
   * the layer (design.md §7).
   *
   * 🔴 **PER RECORD, AND NOT `INTENDED_VOLUME`.** The global constant answers "what
   * volume does an OPERATOR ROW have", and a Live Source layer is not an operator
   * row — `#reassertDeclaredVolumes` blankets the declared bank with `VOLUME 1` and
   * consults nothing about what is on those layers, which is the second reason the
   * band was carved OUTSIDE that bank (§7 consequence 3). Its own comment calls it
   * _"the seam a future per-layer volume feature would replace"_; this is that
   * feature, scoped to Live Sources.
   *
   * 🔴 **IT BELONGS TO THE PLATE, NOT TO THE PRODUCER INSTANCE (6.9c).** That is
   * what makes an on-air swap safe: the new producer is born muted like every
   * other, so a deliberately-raised plate would go silent at the exact moment the
   * operator was fixing it unless the swap re-asserts this value. A swap that
   * silently mutes a guest is its own on-air fault.
   */
  readonly intendedVolume: number;
  /**
   * `multibox-layout-switch` `tasks.md` 6.5 / §12.4 — **this producer is seated but the
   * active LOOK does not show it**: muted, idle, and with no hole punched for it.
   *
   * 🔴 **SEAT AND PUNCH ARE SEPARATE MUTATIONS, ON SEPARATE MACHINES, AND THIS FIELD IS
   * WHERE THAT SEPARATION BECOMES REPRESENTABLE.** Every other field here describes the
   * layer — where its producer is and what geometry it was given. This one describes
   * whether the PAGE is currently punching a hole in front of it. Collapsing the two
   * (dropping the record when a look hides the plate, say) is what would force a look
   * switch to re-`PLAY` on the way back — a fresh producer, a visible re-acquire, and the
   * cut §12.4 chose B to avoid.
   *
   * OPTIONAL, and absent means NOT held: it is additive to the persisted form (B-145), so
   * a ledger written before looks existed parses unchanged and reads as "on screen", which
   * is what it was.
   */
  readonly held?: boolean | undefined;
}

/**
 * itemId → the Live Source layers that item owns.
 *
 * Keyed by itemId, like `#slots`, so teardown of a stack item finds its live
 * layers by the same handle every other verb uses — and so the R-009 sweep can
 * fold every coordinate in here into its `owned` set in one pass.
 */
export type LiveLayerLedger = Map<string, LiveLayerRecord[]>;

// ─────────────────────────── B-145 — SURVIVING A RESTART ───────────────────────────

/**
 * B-145 — the persisted form of {@link LiveLayerLedger}.
 *
 * A `Map` is not JSON, so the wire form is an array of `[itemId, records]` pairs. It is
 * validated on the way IN because a hand-edited or half-written file must not become the
 * bridge's belief about what is on air.
 */
const NormalizedRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const LiveLayerRecordSchema = z.object({
  slot: z.object({ channel: z.number().int().positive(), layer: z.number().int().nonnegative() }),
  sourceId: z.string().min(1),
  role: z.enum(['fill', 'key']),
  producer: z.string(),
  fill: NormalizedRectSchema,
  clip: NormalizedRectSchema,
  intendedVolume: z.number(),
  // Additive — see {@link LiveLayerRecord.held}. Absent parses as "not held", so a ledger
  // persisted before looks existed comes back describing exactly what it described then.
  held: z.boolean().optional(),
});

export const PersistedLiveLayersSchema = z.array(
  z.tuple([z.string().min(1), z.array(LiveLayerRecordSchema)]),
);
export type PersistedLiveLayers = z.infer<typeof PersistedLiveLayersSchema>;

/** The ledger as it persists. */
export function toPersistedLiveLayers(ledger: LiveLayerLedger): PersistedLiveLayers {
  return [...ledger].map(([itemId, records]) => [itemId, [...records]]);
}

/** The ledger as it comes back. */
export function fromPersistedLiveLayers(persisted: PersistedLiveLayers): LiveLayerLedger {
  return new Map(persisted.map(([itemId, records]) => [itemId, [...records]]));
}

/**
 * What the SERVER says about one layer, at adopt time.
 *
 * Deliberately the same three-valued shape as `fixed-layers-store.ts`'s `SlotOccupancy`,
 * and for the same reason: `unknown` is a THIRD answer, not a synonym for `empty`.
 */
export type LiveLayerOccupancy = 'occupied' | 'empty' | 'unknown';

/** One record the boot reconcile did not adopt, and why. */
export interface DroppedLiveLayer {
  readonly itemId: string;
  readonly record: LiveLayerRecord;
  readonly reason: 'server-says-empty';
}

export interface LiveLayerAdoption {
  /** 🔴 THE ONE AUTHORITY. Neither the file nor the server is consulted again after this. */
  readonly adopted: LiveLayerLedger;
  /** Records the server contradicted — dropped, and reported rather than silently lost. */
  readonly dropped: readonly DroppedLiveLayer[];
  /** Records adopted WITHOUT confirmation, because occupancy was not knowable. */
  readonly unverified: readonly LiveLayerRecord[];
}

/**
 * 🔴 **B-145 — rebuild the ledger from the persisted CLAIM, corrected by the server's
 * EVIDENCE.**
 *
 * ── WHY BOTH INPUTS, AND WHY THAT IS STILL *ONE* AUTHORITY ──────────────────
 *
 * `INFO <channel>` was measured on the plant (2.5.0 `69e8ad5`, 2026-08-18) to report every
 * occupied layer, its producer kind and that producer's own parameters — and to DROP a
 * layer from the reply as soon as it is cleared, which is the control that makes it usable
 * as evidence in both directions. What it cannot report is anything the server was never
 * told: **the `itemId`, the symbolic `sourceId` (`guest-1`), and the fill/key `role`.**
 * Those are this bridge's own naming, so no amount of server reading re-derives them.
 *
 * So neither input is sufficient alone — the file knows the NAMES, the server knows the
 * TRUTH — and the reconciliation of the two is what becomes the ledger. **That resolved
 * result is the single authority**; the file is an input to it, never a second answer
 * consulted later. A design that kept consulting both would be the two-spellings failure
 * this repo keeps paying for.
 *
 * ── THE THREE-VALUED RULE, AND WHY `unknown` ADOPTS ─────────────────────────
 *
 * - `occupied` → adopt. The claim is confirmed.
 * - `empty`    → **DROP**. The server is the authority on what is on it; a producer that
 *                went away while the bridge was down must not come back as a belief.
 * - `unknown`  → **adopt, and mark it unverified.** Absence of knowledge is not knowledge
 *                of absence (R-015, and the B-101 lesson about reading silence on one
 *                channel as death on another). Dropping an unverifiable record would
 *                strand exactly the producer this item exists to stop stranding — it is
 *                the failure mode, arrived at from the other side.
 */
export function reconcileLiveLayers(input: {
  readonly persisted: LiveLayerLedger;
  readonly observe: (slot: CommandSlot) => LiveLayerOccupancy;
}): LiveLayerAdoption {
  const adopted: LiveLayerLedger = new Map();
  const dropped: DroppedLiveLayer[] = [];
  const unverified: LiveLayerRecord[] = [];

  for (const [itemId, records] of input.persisted) {
    const keep: LiveLayerRecord[] = [];
    for (const record of records) {
      const seen = input.observe(record.slot);
      if (seen === 'empty') {
        dropped.push({ itemId, record, reason: 'server-says-empty' });
        continue;
      }
      if (seen === 'unknown') unverified.push(record);
      keep.push(record);
    }
    // An item whose every layer the server contradicted owns nothing — and an empty
    // entry is bookkeeping to drop, exactly as `registerLiveLayers` treats it.
    if (keep.length > 0) adopted.set(itemId, keep);
  }
  return { adopted, dropped, unverified };
}

// ───────────────── B-145 acceptance 1 (display half) — THE WIRE PROJECTION ─────────────────

/**
 * 🔴 **THE ONE PROJECTION of the ledger onto the wire** (`tasks.md` 2.8).
 *
 * Both directions the ledger reaches a browser go through this function — the PULL
 * (`CasparRuntime.liveLayersState()`, behind `liveLayers.state`) and the PUSH (the
 * `liveLayersChanged` subscription in `bridge.ts`). They are two callers of one
 * spelling rather than two flattenings, deliberately: a pull and a push that
 * disagreed about the shape of a record would make the list flicker between two
 * truths on every seat, and the operator would have no way to tell which one is on
 * air. Golden rule 6, applied to a projection rather than to a predicate.
 *
 * ── WHY FLAT, AND WHY SORTED HERE ───────────────────────────────────────────
 *
 * The ledger is keyed by `itemId` because every VERB that reaches a live layer is
 * item-scoped. The surface that reads it is a LAYER LIST, whose question is
 * ordered by coordinate. Flattening at the seam — rather than in the renderer —
 * keeps the ordering a property of the payload: two browsers, and the same browser
 * across a push and a pull, then show the same list in the same order. A renderer
 * that sorted for itself would be one more place for that order to drift.
 *
 * ⚠ **`isUnverified` is INJECTED rather than read here**, mirroring `reconcileLiveLayers`’s
 * own `observe`: the ledger module owns the SHAPE of a row, while which records are still
 * unconfirmed is runtime state belonging to `CasparRuntime`. Keeping it a parameter is
 * what lets the rule be unit-tested without a runtime, and stops this module growing a
 * second opinion about what "confirmed" means.
 *
 * ⚠ **`held` is RESOLVED here, not forwarded.** The record's field is optional
 * because it is additive to the persisted form (a ledger written before looks
 * existed parses unchanged and means "on screen"). That is a persistence concern,
 * and it is answered exactly once — here — so no consumer re-decides what an
 * absent flag meant.
 */
export function projectLiveLayers(
  ledger: ReadonlyMap<string, readonly LiveLayerRecord[]>,
  isUnverified: (itemId: string, record: LiveLayerRecord) => boolean,
): LiveLayerState[] {
  const rows: LiveLayerState[] = [];
  for (const [itemId, records] of ledger) {
    for (const record of records) {
      rows.push({
        channel: record.slot.channel,
        layer: record.slot.layer,
        itemId,
        sourceId: record.sourceId,
        role: record.role,
        producer: record.producer,
        held: record.held === true,
        unverified: isUnverified(itemId, record),
      });
    }
  }
  return rows.sort((a, b) => a.channel - b.channel || a.layer - b.layer);
}
