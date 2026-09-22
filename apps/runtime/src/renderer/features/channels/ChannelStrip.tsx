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
  const { channels, selected, operable } = useSelectedChannel();

  /*
    🔴 `C-038` / `R-066` bullet 3 — **A CHANNEL THIS PRINCIPAL MAY NOT OPERATE IS SHOWN
    READ-ONLY, NOT HIDDEN — and it is still SELECTABLE.**

    Two decisions, and the second is the one that makes the first worth anything:

      · **shown**, because a channel missing from the strip cannot be told apart from a
        station that does not have it, and an operator who has lost access would look for
        the fault in the wrong place entirely;
      · **selectable**, because `read` is a real permission — a viewer, and an operator on
        somebody else's channel, may WATCH it. A tab that refused to open would be a
        disabled control standing in for a fact (golden rule 13), and it would hide the one
        thing they are entitled to see.

    ⭐ The fact rides the LABEL rather than a badge. `TabSpec.badge` has two tones and both
    mean something else — `warn` is "something in here was refused", `edited` is "unapplied
    changes" — and a read-only channel is neither. Borrowing one would make the rail say the
    wrong thing in a vocabulary the dialog already uses.
  */
  const tabs: TabSpec[] = channels.map((channel) => ({
    id: String(channel),
    label: operable.includes(channel)
      ? `CHANNEL ${String(channel)}`
      : `CHANNEL ${String(channel)} · READ ONLY`,
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
