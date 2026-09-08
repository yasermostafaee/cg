import type { ReactNode } from 'react';
import { Tabs, type TabSpec } from '../../ui/Tabs.js';
import { selectChannel } from './channelStore.js';
import { useSelectedChannel } from './useSelectedChannel.js';

/**
 * THE CHANNEL axis — the OUTER level of the operator surface.
 *
 * Everything a channel owns sits inside this: the layer list, PROGRAM, PREVIEW and
 * the Inspector. That scope is the entire point, and it is why the strip lives here
 * rather than inside the Layers panel where it started. A strip scoped to the layer
 * list would have been half right — the tab would exist, but selecting channel 2
 * would leave PGM and PVW still showing channel 1's output while the tab claimed
 * otherwise. Wrong the moment a second channel appears, and much cheaper to place
 * correctly now than to unpick later.
 *
 * CHANNEL and LAYERS-vs-PLAYOUT are two different axes and must never share one
 * strip: a single "Channel 1 | Channel 2 | STATION LAYERS" row cannot say WHOSE playout it
 * means. They are nested instead — channel outside, surfaces inside.
 *
 * ── `RUNTIME-REDESIGN-01` PHASE 7 — A LIST WHOSE LENGTH IS DATA ─────────────────────
 *
 * This used to read `bank?.channel ?? 1` into a ONE-element array and keep its selection in
 * component state: _"ONE CHANNEL FOR NOW. The bank declares exactly one, and no channel
 * discovery is invented here."_ The second sentence still holds — no discovery call exists
 * and none is invented (owner answer A3; the gap is `R-062`) — but the strip is now shaped
 * for one: its tabs are `channelIds(bank, settings)`, every channel the bridge already
 * publishes, and the selection is a channel ID in `channelStore`, readable by Station setup's
 * per-channel tab. With one declared channel it renders exactly what it did before.
 */
export function ChannelScope({ children }: { children: ReactNode }): JSX.Element {
  const { channels, selected } = useSelectedChannel();

  const tabs: TabSpec[] = channels.map((channel) => ({
    id: String(channel),
    label: `CHANNEL ${String(channel)}`,
  }));

  return (
    <Tabs
      tabs={tabs}
      activeId={String(selected)}
      onSelect={(id) => selectChannel(Number(id))}
      ariaLabel="Channels"
      idPrefix="channel"
      level="outer"
    >
      {children}
    </Tabs>
  );
}
