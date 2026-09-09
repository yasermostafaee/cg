import { TabStrip, type TabSpec } from '../../ui/Tabs.js';
import { selectChannel } from './channelStore.js';
import { useSelectedChannel } from './useSelectedChannel.js';

/**
 * THE CHANNEL AXIS'S TABLIST — the half of `ChannelScope` that the app header carries.
 *
 * `AUDIT-CLOSE-01` B1 split the two: the strip is rendered in `AppHeader`, where the reference
 * draws its channel chooser, and `ChannelScope` keeps the tabpanel that wraps the workspace.
 * They address each other by `idPrefix="channel"` and read the same module store, so they
 * cannot disagree about the selection however far apart they sit.
 *
 * ⚠ It is its OWN component rather than markup inside `AppHeader` for a reason worth stating:
 * the strip's list-shape is a `RUNTIME-REDESIGN-01` Phase 7 property with its own red-first
 * proof (`channelScope.dom.test.ts`), and that proof should not have to mount a header full of
 * bridge-reading controls it has no opinion about. One component, one subject.
 *
 * The scope argument itself is unchanged and lives on `ChannelScope`: the channel owns the
 * layer list, PROGRAM, PREVIEW and the Inspector, which is why the PANEL wraps all four.
 */
export function ChannelStrip(): JSX.Element {
  const { channels, selected } = useSelectedChannel();

  const tabs: TabSpec[] = channels.map((channel) => ({
    id: String(channel),
    label: `CHANNEL ${String(channel)}`,
  }));

  return (
    <TabStrip
      tabs={tabs}
      activeId={String(selected)}
      onSelect={(id) => selectChannel(Number(id))}
      ariaLabel="Channels"
      idPrefix="channel"
      level="outer"
      inPanelBar
    />
  );
}
