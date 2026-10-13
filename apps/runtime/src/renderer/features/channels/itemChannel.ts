/** A row as the channel readers see it: its id and, when the bridge wrote one, its slot. */
type ChannelledItem = {
  readonly itemId: string;
  readonly slot?: { readonly channel: number } | undefined;
} | null;

/** The bank rows as the channel readers see them: where each is, and what it is bound to. */
type BankRowSlots = readonly {
  readonly channel: number;
  readonly binding: { readonly itemId: string } | null;
}[];

/**
 * 🔴 `CHANNEL-TEMPLATES-01` — **THE CHANNEL A ROW IS ON, when that can be said**: the item's playout
 * `slot` when it carries one, else the bank row it is bound to (the offline mock binds a row without
 * writing `slot`). `undefined` for a row on no channel — which is how a template reader knows to
 * take the station-wide reading rather than guess one channel's.
 *
 * The one rule {@link itemChannelOf} is built on, so the two cannot disagree about a row.
 */
export function boundChannelOf(item: ChannelledItem, slots: BankRowSlots): number | undefined {
  if (item === null) return undefined;
  return item.slot?.channel ?? slots.find((s) => s.binding?.itemId === item.itemId)?.channel;
}

/**
 * 🔴 `CHANNEL-SOURCES-01` decision 2 — **WHICH CHANNEL A ROW IS ON**, for a surface that reads that
 * channel's own Source defaults: {@link boundChannelOf} (the item's `slot`, else the bank row it is
 * bound to — the Inspector's heading reads the two the same way), else the channel the console is
 * showing.
 *
 * A plain function over what the caller already holds, never a hook: the Inspector and the Layers
 * table have the slots and the selected channel in hand, and a leaf that subscribed again would be
 * a second reader of the same fact (`B-156`).
 */
export function itemChannelOf(item: ChannelledItem, slots: BankRowSlots, selected: number): number {
  return boundChannelOf(item, slots) ?? selected;
}
