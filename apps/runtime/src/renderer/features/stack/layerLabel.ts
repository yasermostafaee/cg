import type { LayerSlot } from '@cg/shared-schema';

/**
 * What the operator reads for an item's CasparCG layer.
 *
 * "Slot" is our internal word for the (channel, layer) coordinate the LayerManager
 * allocates. The operator has no such concept: to them the LAYER is the thing — it is what
 * CasparCG's own tooling shows, and what they would clear by hand when something is stuck.
 * "no slot" named an abstraction they have never heard of; "no layer" says exactly what is
 * true, which is that this item holds no layer and therefore cannot be on air.
 *
 * Kept React-free so it is unit testable on its own.
 */

/** The row line: the layer number, or the plain fact that there is none. */
export function layerLabel(slot: LayerSlot | undefined): string {
  return slot === undefined ? 'no layer' : `layer ${String(slot.layer)}`;
}

/**
 * The Inspector line. Same wording, plus the rest of the coordinate — the channel and which
 * server holds it — because the Inspector is where an operator goes to reconcile what they
 * see against what CasparCG reports.
 */
export function layerDetail(slot: LayerSlot | undefined): string {
  return slot === undefined
    ? 'no layer'
    : `layer ${String(slot.layer)} · channel ${String(slot.channel)} · ${slot.server}`;
}
