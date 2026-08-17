import { useState, type ReactNode } from 'react';
import { Tabs, type TabSpec } from '../../ui/Tabs.js';
import { useFixedBank } from '../../hooks/useFixedLayers.js';

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
 * ONE CHANNEL FOR NOW. The bank declares exactly one, and no channel discovery is
 * invented here. The strip still renders for it: it says which channel the operator
 * is looking at, and it means adding a second is a longer array rather than a new
 * layout.
 */
export function ChannelScope({ children }: { children: ReactNode }): JSX.Element {
  const bank = useFixedBank();
  // The bank is the only channel authority the SPA has. Before its snapshot
  // arrives — and when no bank is declared at all — the surface still belongs to
  // SOME channel, and channel 1 is the documented default (`FixedLayerBankSchema`).
  const channel = bank?.channel ?? 1;
  const [activeChannel, setActiveChannel] = useState<string>(String(channel));

  const tabs: TabSpec[] = [{ id: String(channel), label: `CHANNEL ${String(channel)}` }];

  return (
    <Tabs
      tabs={tabs}
      // Follow the bank if it names a different channel than the one selected —
      // with one channel this cannot diverge, but reading through keeps the strip
      // honest rather than stranded on a stale id.
      activeId={tabs.some((t) => t.id === activeChannel) ? activeChannel : String(channel)}
      onSelect={setActiveChannel}
      ariaLabel="Channels"
      idPrefix="channel"
      level="outer"
    >
      {children}
    </Tabs>
  );
}
