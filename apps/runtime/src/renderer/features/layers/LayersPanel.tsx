import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { StackItemState } from '@cg/shared-schema';
import { CircleArrowOutDownRight, PanelRight, RotateCcw, Trash2, XSquare } from 'lucide-react';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Panel } from '../../ui/Panel.js';
import { Tabs, type TabSpec } from '../../ui/Tabs.js';
import type { ShellLayout } from '../../hooks/useShellLayout.js';
import { useElementWidth } from '../../hooks/useElementWidth.js';
import { useConfirm } from '../../ui/useDialog.js';
import { useLink } from '../../hooks/useLink.js';
import { useStack } from '../../hooks/useStack.js';
import { useFixedBank, useFixedSlots } from '../../hooks/useFixedLayers.js';
import { usePlayoutLayers } from '../../hooks/usePlayoutLayers.js';
import { useTemplateIndex } from '../../hooks/useTemplateIndex.js';
import { bankPosition, isLayerVisible, isRehearsing } from '@cg/shared-ipc';
import { useRehearse } from '../../hooks/useRehearse.js';
import { isOnAir } from '../stack/onAir.js';
import { draftsVersion, isItemDirty, subscribeDrafts } from '../inspector/draftStore.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { LayerRow } from './LayerRow.js';
import { LayerTableHeader } from './LayerTableHeader.js';
import { resolveDensity } from './layerTable.js';
import { PlayoutPanel } from './PlayoutPanel.js';
import { hasPlayoutOccupant } from './playoutOccupancy.js';
import { FixedBankConfigModal } from '../fixedLayers/FixedBankConfigModal.js';

interface Props {
  onSelectionChange: (itemId: string | null) => void;
  selectedId: string | null;
  onUpdate: (itemId: string) => Promise<{ accepted: boolean; errorCode?: string | undefined }>;
  /** R-028 part B — the operator's workspace geometry (see `useShellLayout`). */
  layout: ShellLayout;
  /** Narrow screens only: is the Inspector overlay showing? */
  inspectorOpen: boolean;
  onToggleInspector: () => void;
}

const styles = {
  /**
   * The channel's scroll area. The STICKY column header lives INSIDE it (below
   * both tab strips), so it is the rows that scroll under the header rather than
   * the header scrolling away with them.
   */
  list: { overflowY: 'auto' as const, minHeight: 0, flex: 1 },
  empty: {
    padding: '1rem',
    fontSize: '0.85rem',
    color: colors.textMuted,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
    alignItems: 'flex-start',
    lineHeight: 1.5,
  },
} as const;

/**
 * R-028 (4.1) — THE operator surface: ONE list of declared layer rows, plus a
 * separate tab for the playout system's own layers.
 *
 * This replaces THREE panels — the Library, the Stack and the Fixed Layers
 * bank. That is the point of the change, not a side effect:
 *
 *   - there is no separate library panel, because a template is not a thing you
 *     park somewhere; Load on a row imports and loads in ONE action;
 *   - there is no stack, because nothing is ever appended to a list below. Every
 *     item lives on a declared row and nowhere else;
 *   - "Fixed" is gone from the name, because with one list the word distinguishes
 *     nothing. The section is just LAYERS.
 *
 * Rows are ordered DESCENDING by layer so the list mirrors on-air z-order — the
 * top row is the top graphic.
 */
export function LayersPanel({
  onSelectionChange,
  selectedId,
  onUpdate,
  layout,
  inspectorOpen,
  onToggleInspector,
}: Props): JSX.Element {
  const bank = useFixedBank();
  const slots = useFixedSlots();
  // R-022 — ONE rehearse snapshot for the whole table, from the bridge.
  const rehearsals = useRehearse();
  const playout = usePlayoutLayers();
  const items = useStack();
  const linkDown = useLink() === 'disconnected';
  const [activeTab, setActiveTab] = useState('layers');
  const [configOpen, setConfigOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  /**
   * The table degrades on the width of the LIST, not the viewport: the operator
   * drags the Inspector divider and the viewport never moves. Until the first
   * measurement lands we assume the widest density — the alternative flashes a
   * cramped table on every mount.
   */
  const { ref: listRef, width: listWidth } = useElementWidth<HTMLDivElement>();
  const density = listWidth === null ? 'full' : resolveDensity(listWidth);

  // Template identity for every bound row, joined once for the whole list.
  const templates = useTemplateIndex(items.map((i) => i.templateId));

  // Live draft chips (staged-but-unapplied edits). Subscribe only — this panel
  // RENDERS drafts, it no longer prunes them.
  //
  // The prune moved to `useStackHousekeeping`, called from `App`. It was stack
  // housekeeping living in a component `App` unmounts on either fullscreen path,
  // and on remount it ran against the bootstrap snapshot and deleted every staged
  // edit the operator had typed. Do not bring it back here: the bug is not the
  // prune's logic, it is a destructive pass keyed to a view's mount lifetime.
  useSyncExternalStore(subscribeDrafts, draftsVersion);

  const itemById = useMemo(() => {
    const map = new Map<string, StackItemState>();
    for (const item of items) map.set(item.itemId, item);
    return map;
  }, [items]);

  // R-028 (4.1) — DESCENDING layer order: the list mirrors on-air z-order.
  // Hidden rows are filtered here and NOWHERE else; part A's honesty override
  // keeps a bound or observably-occupied row visible even when unticked, so a
  // live graphic can never lose its only surface.
  const rows = useMemo(() => {
    if (bank === null) return [];
    return [...slots]
      .filter(
        (slot) =>
          isLayerVisible(bank, slot.layer) ||
          slot.binding !== null ||
          slot.observed.kind === 'producer',
      )
      .sort((a, b) => b.layer - a.layer);
  }, [bank, slots]);

  const onAirCount = items.filter(isOnAir).length;

  // "Get it off the screen" is not "throw it away". This clears air and KEEPS
  // the rows, so recovering is a re-take — not a re-import and re-typing every
  // field, which is what Remove-All costs. Confirm-gated all the same: it is
  // still an on-air action. (Wording carried over verbatim from the stack
  // header it replaces — the distinction it draws is the point.)
  const clearAll = useCallback(async (): Promise<void> => {
    /*
      THE WORDING HAS TO MATCH WHAT THE BRIDGE ACTUALLY DOES, and that is narrower
      than this button's availability suggests.

      The button is always enabled (owner decision — Clear is the escape hatch). But
      the bridge's `stack.clearAll` clears only items whose status is NOT `idle` or
      `loaded`, which are exactly the statuses that might be WRONG in the situation
      the escape hatch exists for. So when nothing currently reads as on air, this
      bulk action would report success having sent nothing.

      Rather than promise "everything comes off", the dialog says what will happen and
      — when the count is zero — names the per-row CLEAR, which really is not
      status-gated (`out()` needs only a bound slot). Recorded in DEBT.md: making the
      bulk verb a true escape hatch is a BRIDGE change on an on-air path, not a
      wording fix, and it is not this session's to make silently.
    */
    const body =
      onAirCount > 0
        ? `All ${String(onAirCount)} on-air item(s) come off air. They stay on the stack, idle, and can be taken again.`
        : 'Nothing currently reads as on air, so this may send no commands at all. ' +
          'If you believe a graphic is stuck on air, use CLEAR on its own row — that one ' +
          'is not gated on the status.';
    const ok = await confirm({
      title: onAirCount > 0 ? 'Clear all on-air items?' : 'Clear all — nothing reads as on air',
      body,
      confirmLabel: 'Clear all',
      tone: 'clear',
      variant: 'caution-strong',
    });
    if (!ok) return;
    try {
      await window.cg.stack.clearAll();
    } catch (err) {
      reportCommandError(err instanceof Error ? err.message : 'Clear all failed.');
    }
  }, [confirm, onAirCount]);

  /**
   * C-012 — STOP All: every on-air graphic runs its OWN outro and stays
   * resident, so a later take resumes it.
   *
   * The graceful sibling of Clear-All, and it sits beside it deliberately: the
   * two are the only bulk ways off air and offering one without the other
   * would read as a missing option. The wording spells the difference out,
   * because this project's STOP and CLEAR are the opposite of the reference
   * product's and confusing them on thirty rows at once is expensive.
   */
  const stopAll = useCallback(async (): Promise<void> => {
    const ok = await confirm({
      title: 'Stop all on-air items?',
      body: `All ${String(onAirCount)} on-air item(s) run their own outro and come off air gracefully. They stay loaded and can be taken again.`,
      confirmLabel: 'Stop all',
      tone: 'stop',
      variant: 'caution',
    });
    if (!ok) return;
    try {
      await window.cg.stack.stopAll();
    } catch (err) {
      reportCommandError(err instanceof Error ? err.message : 'Stop all failed.');
    }
  }, [confirm, onAirCount]);

  /**
   * R-010 — Remove All empties every row. It is not merely a convenience: it is
   * the documented unblock path for a server reconfiguration (`connections.
   * set-config` refuses while anything is on air or unsettled, and names this as
   * the way out), so it must survive the panel merge.
   */
  const removeAll = useCallback(async (): Promise<void> => {
    const ok = await confirm({
      title: 'Remove all items?',
      body: `This clears anything on air and empties the stack — all ${String(items.length)} item(s).`,
      confirmLabel: 'Remove all',
      tone: 'remove',
    });
    if (!ok) return;
    try {
      await window.cg.stack.removeAll();
    } catch (err) {
      reportCommandError(err instanceof Error ? err.message : 'Remove all failed.');
    }
  }, [confirm, items.length]);

  const playoutOccupied = hasPlayoutOccupant(playout);
  const tabs: TabSpec[] = [
    { id: 'layers', label: 'LAYERS' },
    {
      id: 'playout',
      label: 'PLAYOUT',
      // The dot means "something IS on a playout layer" — never raised for an
      // unknown, which is the absence of a claim rather than a claim. It is
      // scoped to the channel whose tab is open, which is why the channel axis
      // has to be the outer one: with two channels a dot on a shared strip could
      // not say whose reservation it was about.
      ...(playoutOccupied && !linkDown
        ? { badge: { tone: 'warn' as const, label: 'Something is on a playout layer' } }
        : {}),
    },
  ];

  return (
    <Panel
      id="layers"
      title="LAYERS"
      ariaLabel="Layers"
      style={{ flex: 1 }}
      actions={
        <>
          {/*
            The bulk verbs, in C-012 order: graceful first, hard second — so the
            softer option is the one nearest to hand.

            NEUTRAL, like the row verbs. Item 10's rule applies to the header too:
            colour belongs to STATE, not to affordances. Three coloured buttons
            sitting permanently above the list were competing with the one row
            actually wearing the air colour, which is the whole thing a control
            room needs to find first.

            `neutral`, NOT `verb`. The first attempt reused the row verb's class to get
            the neutral palette and inherited its GEOMETRY with it — `padding: 0` and
            `width: 100%`, sized for a lone glyph inside a declared column — so these
            text labels came out jammed against their borders. The LOOK is shared
            between the two; the SHAPE is not (see `controls.css`).

            ALWAYS RENDERED, present-but-disabled when they cannot act, rather than
            appearing and disappearing with `onAirCount`. Same rule the row verbs
            follow and for the same reason: controls that come and go move the
            target under the operator's hand mid-reach. Their weight comes from
            their confirm gates, not from being hidden.
          */}
          <Button
            variant="neutral"
            disabled={linkDown || onAirCount === 0}
            aria-label="Stop all on-air items"
            data-verb-tone="stop"
            title="Every on-air graphic runs its own outro and stays loaded"
            onClick={() => void stopAll()}
          >
            <Icon icon={CircleArrowOutDownRight} />
            STOP ALL
          </Button>
          {/*
            CLEAR ALL is ALWAYS ENABLED — the bulk twin of the row's CLEAR escape
            hatch, and the same reasoning applies: refusing the remedy when the
            state model is confused strands graphics on air. Not even `linkDown`
            disables it, because a wrong `linkDown` is exactly the bug it exists
            for. It keeps its confirm gate — always AVAILABLE is not always
            IMMEDIATE — and `stack.clearAll` only ever addresses this station's own
            items, so it cannot reach the reserved playout range.
          */}
          <Button
            variant="neutral"
            aria-label="Clear all on-air items"
            data-verb-tone="clear"
            title="Every on-air graphic is cut immediately, with no outro"
            onClick={() => void clearAll()}
          >
            <Icon icon={XSquare} />
            CLEAR ALL
          </Button>
          <Button
            variant="neutral"
            disabled={linkDown || items.length === 0}
            aria-label="Remove all items"
            data-verb-tone="remove"
            title="Clears anything on air and empties every row"
            onClick={() => void removeAll()}
          >
            <Icon icon={Trash2} />
            REMOVE ALL
          </Button>
          {/*
            CONFIGURE — offered whether or not a bank exists.

            It used to be gated on `bank !== null`, which meant the ONE screen
            that tells the operator to go and configure something was the one
            screen with no way to do it. The modal is still honest about which
            parts it cannot change (channel, start and count are fixed at
            install), and says so in words rather than pointing at a control that
            is not there.
          */}
          {/* `neutral`, not `ghost`: a ghost has an icon button's tight padding, so
              beside the bulk verbs it read as a label rather than a control. Neutral is
              not invisible — a control still needs a boundary, a hover and a focus
              ring, whatever colour it has been denied. */}
          <Button
            variant="neutral"
            title={
              bank === null
                ? 'No candidate layers are declared yet — see what the bridge needs'
                : 'Show or hide rows, and name them'
            }
            onClick={() => setConfigOpen(true)}
          >
            Configure
          </Button>
          {/* NARROW — the hamburger that brings the Inspector up as an overlay.
              Only on small screens: with two columns the Inspector is already
              there and a toggle would be a control that does nothing visible. */}
          {layout.narrow && (
            <Button
              variant="ghost"
              aria-label={inspectorOpen ? 'Hide the Inspector' : 'Show the Inspector'}
              aria-expanded={inspectorOpen}
              title={inspectorOpen ? 'Hide the Inspector' : 'Show the Inspector'}
              onClick={onToggleInspector}
            >
              <Icon icon={PanelRight} />
            </Button>
          )}
          {/* THE WAY BACK. Always reachable once anything is customised, so an
              operator who drags a panel somewhere useless at 2 a.m. is never
              stuck with it. */}
          {layout.customized && (
            <Button
              variant="ghost"
              aria-label="Reset the panel layout"
              title="Put every panel back to its default size"
              onClick={layout.reset}
            >
              <Icon icon={RotateCcw} />
            </Button>
          )}
          {/* FULLSCREEN is NOT here any more — `Panel` renders it for every
              panel, which is how the Inspector finally got one too. */}
        </>
      }
    >
      {/*
        LAYERS / PLAYOUT — the surfaces INSIDE the selected channel.

        The CHANNEL strip is no longer here. It wraps the whole workspace now
        (`ChannelScope` in `App`), because the channel owns PGM and PVW as well as
        this list: a strip scoped to the layer panel would have left the monitors
        showing channel 1 while the tab said channel 2. The two axes still never
        share a strip — a single "Channel 1 | Channel 2 | Playout" row could not
        say whose playout it meant — they are simply nested at the right levels.
      */}
      <Tabs tabs={tabs} activeId={activeTab} onSelect={setActiveTab} ariaLabel="Layer surfaces">
        {activeTab === 'layers' ? (
          bank === null ? (
            <div style={styles.empty}>
              <strong style={{ color: colors.text }}>No candidate layers are declared.</strong>
              <span>
                This station has no rows to load onto yet. The channel and the range of candidate
                layers are fixed at install: set them in the bridge&rsquo;s fixed-layers config file
                and restart it.
              </span>
              <span>
                Once a range exists, <strong>Configure</strong> is where you show or hide individual
                rows and give them names.
              </span>
              <Button variant="secondary" onClick={() => setConfigOpen(true)}>
                What the bridge needs
              </Button>
            </div>
          ) : (
            <div style={styles.list} ref={listRef}>
              {/* STICKY, and inside the scroll area — see `LayerTableHeader`. */}
              <LayerTableHeader density={density} onAirCount={onAirCount} />
              {rows.map((slot, index) => {
                const item =
                  slot.binding !== null ? (itemById.get(slot.binding.itemId) ?? null) : null;
                const template = item !== null ? (templates.get(item.templateId) ?? null) : null;
                return (
                  <LayerRow
                    key={slot.layer}
                    slot={slot}
                    item={item}
                    template={template}
                    // `#` — plain display order, 1 at the top of THIS list.
                    displayPosition={index + 1}
                    // The default alias's number — the layer's FIXED place in the
                    // bank, which ticking and unticking must never renumber. See
                    // `bankPosition` for why the two are deliberately separate.
                    bankPosition={bankPosition(bank, slot.layer)}
                    density={density}
                    selected={item !== null && item.itemId === selectedId}
                    dirty={item !== null && isItemDirty(item.itemId, item.fields)}
                    // R-022 — read through the canonical `isRehearsing`, never a
                    // local `.some()`: the bridge refuses PLAY on the same
                    // predicate, and if the two ever disagreed the UI would offer a
                    // take the bridge rejects — or worse, allow one it thought was
                    // interlocked off.
                    rehearsing={item !== null && isRehearsing(rehearsals, item.itemId)}
                    onSelect={onSelectionChange}
                    onUpdate={onUpdate}
                  />
                );
              })}
            </div>
          )
        ) : (
          <PlayoutPanel layers={playout} />
        )}
      </Tabs>
      {configOpen && (
        <FixedBankConfigModal bank={bank} slots={slots} onClose={() => setConfigOpen(false)} />
      )}
      {confirmDialog}
    </Panel>
  );
}
