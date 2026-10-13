/**
 * `B-212` — "take me to that row".
 *
 * A refusal that names a row is only half a remedy if the operator then has to find it
 * in a thirty-row list; the other half is the surface scrolling there and selecting it.
 * The request travels through this tiny module-level channel because the two ends are
 * far apart in the tree: the request comes from the template picker (opened from a
 * ROW's `LOAD`, rendered inside that row) and the rows live in `LayersPanel`, which
 * owns the list, the scroll box and the selection. A prop chain through the row would
 * couple the picker to the panel for one gesture; a global would be one more thing
 * that can be left stale. A subscribe/emit pair is the `commandFeedback` precedent.
 *
 * It carries the LAYER NUMBER — the row's stable identity (`data-layer`), which outlives
 * every item loaded onto it — never an item id or a DOM node.
 */

type Handler = (layer: number) => void;

const handlers = new Set<Handler>();

/** Ask the Layers table to scroll to `layer` and select what is on it. */
export function requestRowFocus(layer: number): void {
  for (const handler of [...handlers]) handler(layer);
}

/** The Layers table's end. Returns the unsubscribe. */
export function onRowFocus(handler: Handler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}
