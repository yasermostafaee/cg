/**
 * 🔴 `CHANNEL-SOURCES-01` decision 2 — **WHICH CHANNEL A ROW IS ON**, for a surface that reads that
 * channel's own Source defaults: the item's playout `slot` when it carries one, else the bank row
 * it is bound to (the offline mock binds a row without writing `slot` — the Inspector's heading
 * reads the two the same way), else the channel the console is showing.
 *
 * A plain function over what the caller already holds, never a hook: the Inspector and the Layers
 * table have the slots and the selected channel in hand, and a leaf that subscribed again would be
 * a second reader of the same fact (`B-156`).
 */
export function itemChannelOf(
  item: {
    readonly itemId: string;
    readonly slot?: { readonly channel: number } | undefined;
  } | null,
  slots: readonly {
    readonly channel: number;
    readonly binding: { readonly itemId: string } | null;
  }[],
  selected: number,
): number {
  if (item === null) return selected;
  return (
    item.slot?.channel ?? slots.find((s) => s.binding?.itemId === item.itemId)?.channel ?? selected
  );
}
