import type { ReactNode } from 'react';
import { TabPanel } from '../../ui/Tabs.js';
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
/**
 * 🔴 `AUDIT-CLOSE-01` B1 — THE STRIP MOVED TO THE APP HEADER; THE SCOPE DID NOT.
 *
 * This component used to render both halves of the channel tab set: the tablist and the panel
 * it controls. The reference puts the channel chooser in its top bar, and the app had no top
 * bar to put it in — an absence §1.1 recorded and no phase ever decided (see `AppHeader`). Now
 * that the header exists, the tablist lives there and this keeps the PANEL.
 *
 * ⚠ Everything the header note above argues about SCOPE is unchanged and still the reason this
 * component exists: the channel owns the layer list, PROGRAM, PREVIEW and the Inspector, so the
 * tabpanel still wraps all four. What moved is which end of the room the tabs are on.
 *
 * The two halves are joined by `idPrefix="channel"` and by the SAME `useSelectedChannel()`
 * reading — a module store, not a prop — so they cannot disagree about which channel is
 * selected however far apart they are rendered.
 */
export function ChannelScope({ children }: { children: ReactNode }): JSX.Element {
  const { selected } = useSelectedChannel();

  return (
    <TabPanel activeId={String(selected)} idPrefix="channel">
      {children}
    </TabPanel>
  );
}
