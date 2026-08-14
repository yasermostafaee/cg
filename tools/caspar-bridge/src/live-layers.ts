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
}

/**
 * itemId → the Live Source layers that item owns.
 *
 * Keyed by itemId, like `#slots`, so teardown of a stack item finds its live
 * layers by the same handle every other verb uses — and so the R-009 sweep can
 * fold every coordinate in here into its `owned` set in one pass.
 */
export type LiveLayerLedger = Map<string, LiveLayerRecord[]>;
