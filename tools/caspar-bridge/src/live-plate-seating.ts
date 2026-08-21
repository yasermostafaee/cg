import type { LiveSourceLayerRange } from '@cg/shared-ipc';

/**
 * C-015 phase 6 (task 6.0) — **WHICH LAYERS a template's plates go on.**
 *
 * The pure half of the assembly: given the declared band and a predicate saying
 * which layers are free, hand back one layer per plate — or `null` when the band
 * cannot hold them all. Everything that needs runtime state (what is free, what
 * the item already owns) is resolved by the CALLER and passed in, so the choice
 * itself is a total function with a test that needs no bridge.
 *
 * ── WHY NOT `LayerManager.allocate()` ───────────────────────────────────────
 *
 * Because a Live Source layer is not a template layer, and R-028's §6 sweep says
 * so in the other direction: `allocate()` answers "where does this TEMPLATE TYPE
 * go", from a policy keyed by template type, and its bookkeeping is the
 * allocation table the operator's rows live in. A Live Source layer's ownership
 * record is the LEDGER (`#liveLayers`, design.md §4) — that is the whole reason
 * the ledger exists — and putting these coordinates through the LayerManager
 * would give one layer two owners that can disagree.
 */

/** No band is declared, so there is nowhere to put a producer (design.md §4). */
export const LIVE_PLATE_NO_RANGE = 'live-source-no-layer-range';
/** A band is declared, and it cannot hold this template's plates. */
export const LIVE_PLATE_NO_LAYER = 'live-source-no-layer';

/**
 * 🔴 **THE ONE SENTENCE FOR AN EXHAUSTED BAND, spoken at BOTH doors (§2.7).**
 *
 * Under session BM's model the demand is the number of DISTINCT INPUTS bound across the
 * item's looks, and the operator raises it by PRESETTING — so the band can now be exhausted
 * by an assignment, not only by a take. That door refuses in CG Control, where the operator
 * is watching and nothing is on air; the take's door refuses as it always did.
 *
 * Both call this, because two doors describing one limit in two ways is how an operator
 * comes to believe they are two different limits. `where` is the only thing that differs:
 * what the operator was DOING when they met it.
 */
export function liveBandExhaustedMessage(input: {
  readonly needed: number;
  readonly range: LiveSourceLayerRange;
  readonly channel: number;
  /** What ran into the limit. Absent ⇒ the take. */
  readonly where?: 'assignment' | undefined;
}): string {
  const band = `${String(input.range.start)}-${String(input.range.end)}`;
  const room = `The Live Source layer band ${band} on channel ${String(input.channel)} has no room for ${String(input.needed)} live input(s)`;
  const remedy =
    `Clear a graphic that is holding live layers, or widen the band in CG Control's ` +
    `source settings.`;
  if (input.where === 'assignment') {
    return (
      `${room}. Every look's inputs are seated together so a switch is a cut, so choosing ` +
      `an input no other look uses needs a layer of its own — and there is none free. ` +
      `${remedy}`
    );
  }
  return `${room}. ${remedy}`;
}

export interface LiveLayerAllocationInput {
  /** The declared band, INCLUSIVE on both ends. */
  readonly range: LiveSourceLayerRange;
  /**
   * One entry per SEAT this plan will place, in the caller's order. A number is the layer
   * that seat is ALREADY on; `undefined` asks for a fresh one.
   *
   * 🔴 **Honouring it is not an optimisation.** A re-take that moved a seat to a
   * different layer would leave the old layer's producer running with nobody's
   * name on it — a guest's picture on air that no teardown will ever reach,
   * because the ledger (which teardown walks) now names the NEW layer.
   *
   * ⚠ **"PER SEAT" REPLACES "one entry per plate, in declaration order" (session BM), and
   * the old phrase had already drifted before it moved.** Even under the plate-keyed model
   * the caller passed one entry per plate it was actually FITTING — the active look's
   * on-frame members, a subset of the declarations — so "per plate, in declaration order"
   * described neither the length nor, once looks existed, the key. Under (B′) the identity
   * is the resolved INPUT: a seat, not a hole. What did not change is the sentence above it,
   * which is the reason the parameter exists at all.
   */
  readonly preferred: readonly (number | undefined)[];
  /**
   * Is this layer free for us to place a producer on RIGHT NOW? The caller
   * answers from `#declaredLayerClass` and the bound template slots — never
   * re-derived here, or "what is a free layer" would have two spellings.
   */
  readonly isAvailable: (layer: number) => boolean;
}

/**
 * One layer per plate, in the same order, or `null` when the band cannot hold
 * them.
 *
 * ALL-OR-NOTHING, like the assignment resolution one step above it: a template
 * with three guest boxes and room for two is a designed layout with a hole in it,
 * which is the silent-empty-hole outcome reached by a different road.
 *
 * Fresh layers are taken LOWEST FIRST. Deterministic on purpose — a test that
 * asserts a wire trace has to be able to name the layer, and an operator reading
 * two boxes on 10 and 11 can see the pattern.
 */
export function allocateLiveLayers(input: LiveLayerAllocationInput): number[] | null {
  const claimed = new Set<number>();
  const chosen: (number | undefined)[] = input.preferred.map((layer) => {
    // `undefined` is "no preference"; layer 0 is a real layer, so the test is
    // `!== undefined` and never truthiness (zero is falsy — three times now).
    if (layer === undefined) return undefined;
    if (layer < input.range.start || layer > input.range.end) return undefined;
    if (claimed.has(layer) || !input.isAvailable(layer)) return undefined;
    claimed.add(layer);
    return layer;
  });

  for (let i = 0; i < chosen.length; i += 1) {
    if (chosen[i] !== undefined) continue;
    let found: number | undefined;
    for (let layer = input.range.start; layer <= input.range.end; layer += 1) {
      if (claimed.has(layer) || !input.isAvailable(layer)) continue;
      found = layer;
      break;
    }
    if (found === undefined) return null;
    claimed.add(found);
    chosen[i] = found;
  }
  return chosen as number[];
}
