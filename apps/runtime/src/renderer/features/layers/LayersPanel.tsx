import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { StackItemState } from '@cg/shared-schema';
import {
  CircleArrowOutDownRight,
  LoaderCircle,
  PanelRight,
  RotateCcw,
  Trash2,
  TriangleAlert,
  X,
  XSquare,
} from 'lucide-react';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Panel } from '../../ui/Panel.js';
import { Tabs, type TabSpec } from '../../ui/Tabs.js';
import type { ShellLayout } from '../../hooks/useShellLayout.js';
import { useElementWidth } from '../../hooks/useElementWidth.js';
import { useConfirm } from '../../ui/useDialog.js';
import { useLink } from '../../hooks/useLink.js';
import { useCasparReach } from '../../hooks/useCasparReachable.js';
import { BRIDGE_DOWN_REASON, casparRefusalReason } from '../../ui/reachWording.js';
import { useStackSnapshot } from '../../hooks/useStack.js';
import { restoreSkipReason, useRestoreSkips } from '../../hooks/useRestoreSkips.js';
import { useFixedBankState, useFixedSlotsState } from '../../hooks/useFixedLayers.js';
import { useStationLayers } from '../../hooks/useStationLayers.js';
import { useLiveLayers } from '../../hooks/useLiveLayers.js';
import { useTemplateIndex } from '../../hooks/useTemplateIndex.js';
import { bankPosition, isLayerVisible, isRehearsing } from '@cg/shared-ipc';
import { useRehearse } from '../../hooks/useRehearse.js';
import { isOnAir } from '../stack/onAir.js';
import { draftsVersion, isItemDirty, subscribeDrafts } from '../inspector/draftStore.js';
import { appliedPlateSources } from '../inspector/livePlates.js';
import { reportCommandError, reportCommandSuccess } from '../status/commandFeedback.js';
import { LayerRow } from './LayerRow.js';
import { resolveRowBinding } from './rowState.js';
import { LayerTableHeader } from './LayerTableHeader.js';
import { resolveDensity } from './layerTable.js';
import { StationLayersPanel } from './StationLayersPanel.js';
import { LiveSourcesPanel } from './LiveSourcesPanel.js';
import {
  hasStrandedLiveLayer,
  liveLayerBlindness,
  liveLayerRows,
  ownerLabelFor,
} from './liveLayerRows.js';
import { hasStationLayerOccupant } from './stationLayerOccupancy.js';
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

/**
 * §0 — what the panel says while the row states are not in yet.
 *
 * ONE LINE, and it makes the claim at PANEL level that the rows make individually:
 * the states have not arrived. It names no fault and no machine — nothing has said
 * anything is wrong, and this is the ordinary first second of a page.
 *
 * It says "not arrived yet" rather than "loading", because the operator's question
 * is not what the console is busy with but whether he can trust what he is looking
 * at. Kept short enough to survive the strip's fixed height at a narrow width; the
 * element's `title` carries it in full if it ever ellipsises.
 */
const AWAITING_PANEL_NOTICE =
  'Layer states have not arrived yet — rows fill in as soon as the bridge answers.';

const styles = {
  /**
   * The channel's scroll area. The STICKY column header lives INSIDE it (below
   * both tab strips), so it is the rows that scroll under the header rather than
   * the header scrolling away with them.
   */
  list: { overflowY: 'auto' as const, minHeight: 0, flex: 1 },
  /**
   * §0 — THE PANEL-LEVEL NOTICE, AND ITS PERMANENTLY RESERVED HEIGHT.
   *
   * The strip is ALWAYS rendered and always this tall, whether or not it has
   * anything to say. That is the whole reason it is a fixed `height` and not a
   * `minHeight`, and it is not a styling preference: the notice appears at mount
   * and goes when the data lands, which is precisely the second the operator is
   * reaching for a row. A strip that took its height from its content would move
   * every row up under his cursor at that exact moment.
   *
   * The cost is a reserved band above the table when there is nothing to say. It
   * was taken deliberately over the alternative — overlaying the notice on the
   * sticky column header — which shifts nothing but hides the words each verb glyph
   * stands for, and those are the row's only labels (the buttons are icon-only).
   *
   * `nowrap` + ellipsis for the same reason: a message that wrapped to two lines at
   * a narrow width would defeat the fixed height. The full sentence stays reachable
   * through the element's own `title`.
   */
  restoreSkipStrip: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.35rem 0.6rem',
    fontSize: '0.78rem',
    // The CAUTION role, not the danger red: nothing is on air wrongly and nothing is
    // broken — the operator's LIST is short, and they have to know before they reach
    // for a row that is not there.
    color: colors.pending,
    background: colors.panelMuted,
    borderBottom: `1px solid ${colors.border}`,
    overflow: 'hidden',
  },
  awaitingStrip: {
    height: '1.65rem',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0 0.6rem',
    fontSize: '0.78rem',
    color: colors.textMuted,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
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
  /**
   * §3 — THE LIST AND WHETHER IT HAS ARRIVED, never the list alone.
   *
   * Both snapshots are read in their `{ value, ready }` form so an UNREADY list
   * cannot render as an EMPTY one. Before this, a Runtime opened before the bridge
   * was up showed the operator "No candidate layers are declared" — a paragraph
   * telling him his station has no rows — and then quietly filled in seconds
   * later. He had no way to know it was about to.
   *
   * They are two independent snapshots and BOTH must have landed: a ready bank
   * over unready slots renders the declared range as a list with nothing on it,
   * which is the same lie one snapshot along.
   */
  const { bank, ready: bankReady } = useFixedBankState();
  const { slots, ready: slotsReady } = useFixedSlotsState();
  const listReady = bankReady && slotsReady;
  // R-022 — ONE rehearse snapshot for the whole table, from the bridge.
  const rehearsals = useRehearse();
  const playout = useStationLayers();
  // B-145 (2.8) — the layers the BRIDGE seated for Live Source plates, WITH their
  // readiness: the zero-row case has no row to carry a blindness state, so the panel
  // needs the ledger's own arrival flag to avoid asserting that nothing is on air.
  const { value: live, ready: ledgerReady } = useLiveLayers();
  /**
   * THE STACK, WITH ITS READINESS — and this is the THIRD snapshot, which is the
   * bug the `listReady` guard above did not reach.
   *
   * That guard protects the SET OF ROWS: an unready bank or slots can no longer
   * render as a station with no rows. It says nothing about what each row CARRIES,
   * and the stack is a separate snapshot that lands separately. `useStack()` hands
   * back `[]` until its first answer — right for rendering a list, and wrong here,
   * because a bound row then finds no item and was reported as EMPTY.
   *
   * So the operator saw every row present and every row empty, then the occupied
   * ones appearing at once, on every startup and every reconnect. Three snapshots,
   * two of them guarded.
   */
  const { items, ready: stackReady } = useStackSnapshot();
  /*
   * B-108 — the rows the last restore could NOT bring back.
   *
   * DELIBERATELY MINIMAL, and the reason is scheduling rather than taste: Live Source
   * phase 6.9e reshapes these same rows, so this adds the LEAST that is honest and
   * leaves the better surface to the change that is about to rebuild it. When 6.9e
   * lands it can move this per-row and delete the strip; nothing else depends on it.
   *
   * A PANEL notice and not a row one, because these rows DO NOT EXIST any more —
   * that is precisely what is wrong. There is nothing to hang a per-row mark on.
   * (The rows a restore deliberately declines to re-seat — cleared and errored — are
   * honest ON the row already, through the state the row renders. Those two surfaces
   * are complementary and neither duplicates the other.)
   */
  const restoreSkips = useRestoreSkips();
  const [dismissedSkips, setDismissedSkips] = useState('');
  // Keyed by CONTENT, not a boolean: dismissing this report must not also dismiss the
  // NEXT one. A boolean flag would silence every future reconnect after the operator
  // acknowledged one — a surface that can be permanently turned off by a single click
  // is a surface that eventually lies.
  const skipsKey = restoreSkips.map((s) => `${s.itemId}:${s.reason}`).join('|');
  const showSkips = skipsKey.length > 0 && skipsKey !== dismissedSkips;
  const linkDown = useLink() === 'disconnected';
  // THE SECOND HOP — a live bridge says nothing about the playout machine.
  const casparReach = useCasparReach();
  /** Every AMCP-emitting bulk verb needs BOTH hops. Unknown fails closed. */
  const needsCaspar = linkDown || casparReach !== 'reachable';
  // …and says which hop, and whether we KNOW it is down or have merely not heard
  // yet. One shared resolution, so the header cannot word a refusal differently
  // from the row verbs refusing for the identical reason.
  const needsCasparReason = casparRefusalReason(linkDown, casparReach) ?? BRIDGE_DOWN_REASON;
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

  /**
   * EVERY ROW'S BINDING, RESOLVED ONCE — the panel notice and the rows read THIS.
   *
   * §0 asks for a panel-level notice "driven by the same `awaiting` condition" as
   * the rows, and this is what makes that literally true rather than merely
   * intended: there is ONE array, the notice counts entries in it and each row is
   * handed its own entry. A second `some(...)` scan over the slots would be a
   * second derivation of the same fact — the exact shape that let the state cell
   * and the verbs disagree in the first place — and it could drift the moment
   * either side grew a condition.
   *
   * That is also what the notice's test asserts: not that a notice exists, but that
   * it is present exactly when a row is waiting and absent exactly when none is.
   */
  const rowBindings = useMemo(
    () =>
      rows.map((slot) => ({
        slot,
        binding: resolveRowBinding(
          slot.binding,
          slot.binding === null ? undefined : itemById.get(slot.binding.itemId),
          stackReady,
        ),
      })),
    [rows, itemById, stackReady],
  );
  /** How many rows do not yet know what they carry. Zero hides the notice. */
  const awaitingRows = rowBindings.filter((r) => r.binding.kind === 'awaiting').length;

  // STOP ALL's count: the status IS the right question there — a row that never
  // played has no authored outro to run. See `isOnAir`.
  const onAirCount = items.filter(isOnAir).length;
  // B-122 — CLEAR ALL's count, and deliberately a different one. It counts rows
  // that HOLD A LAYER, an ownership fact, because the believed status is exactly
  // what may be wrong when the operator reaches for this button.
  const boundCount = items.filter((i) => i.slot !== undefined).length;

  // "Get it off the screen" is not "throw it away". This clears air and KEEPS
  // the rows, so recovering is a re-take — not a re-import and re-typing every
  // field, which is what Remove-All costs. Confirm-gated all the same: it is
  // still an on-air action. (Wording carried over verbatim from the stack
  // header it replaces — the distinction it draws is the point.)
  const clearAll = useCallback(async (): Promise<void> => {
    /*
      ⭐ B-122 — THE WORDING NOW MATCHES A BULK VERB THAT REALLY IS AN ESCAPE HATCH.

      It used to have to apologise for one. The bridge's `stack.clearAll` cleared only
      items whose status was NOT `idle` or `loaded` — exactly the statuses that may be
      WRONG in the situation the hatch exists for — so this dialog had to warn that
      pressing it "may send no commands at all" and point the operator at the per-row
      CLEAR instead. A bulk emergency control whose own dialog tells you to use a
      different control is a defect wearing a caption.

      The predicate is gone (owner decision, 2026-08-12): a clear goes to EVERY row
      holding a layer, whatever the console believes about it, INCLUDING rows that read
      merely `loaded`. So the dialog now promises exactly that, and says the cost out
      loud — a cued row loses its pre-rolled producer and will re-ADD on the next take.

      `boundCount`, not `onAirCount`, is what this dialog counts: the believed status is
      the thing that may be wrong, so it must not be what the operator is asked to
      confirm against. `onAirCount` survives for STOP ALL, where the status IS the right
      question (a row that never played has no outro to run).
    */
    const ok = await confirm({
      title: `Clear all ${String(boundCount)} row(s) holding a layer?`,
      body:
        `Every row that holds a layer is cleared immediately, with no outro — whatever this ` +
        `console currently believes is on it. That deliberately includes rows that read as ` +
        `merely loaded: a cued row loses its pre-rolled graphic and will re-load on its next ` +
        `play. The rows all stay on the stack and can be taken again.`,
      confirmLabel: 'Clear all',
      tone: 'clear',
    });
    if (!ok) return;
    try {
      /*
        REPORT WHAT ACTUALLY WENT — the other half of B-122, and the half the operator
        sees. The old code discarded the result entirely, which is how a bulk verb that
        sent nothing could still look like it had worked.

        The three outcomes are genuinely different operator situations and must never
        share a message: nothing was owed; everything owed landed; or some of it did not
        and those graphics are STILL ON AIR. `refused` is its own sentence because a
        refusal is not a failure — a Live Source layer is not the operator's to clear,
        and saying "failed" about it would send them looking for a fault.
      */
      const res = await window.cg.stack.clearAll();
      const stuck = res.attempted - res.cleared;
      const refusedNote =
        res.refused.length > 0
          ? ` ${String(res.refused.length)} live source layer(s) are not this console's to clear and were left alone.`
          : '';
      if (stuck > 0) {
        reportCommandError(
          `Cleared ${String(res.cleared)} of ${String(res.attempted)} — ${String(stuck)} did not go ` +
            `and may still be on air. Try CLEAR on those rows.${refusedNote}`,
        );
      } else if (res.cleared > 0) {
        reportCommandSuccess(`Cleared ${String(res.cleared)} row(s).${refusedNote}`);
      } else {
        // Never a green "done": nothing was sent, and saying so is the whole point.
        reportCommandError(`No row holds a layer to clear — nothing was sent.${refusedNote}`);
      }
    } catch (err) {
      reportCommandError(err instanceof Error ? err.message : 'Clear all failed.');
    }
  }, [confirm, boundCount]);

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

  const playoutOccupied = hasStationLayerOccupant(playout);
  /*
    B-145 (2.8) — the live rows, resolved ONCE here and handed to the tab.

    The tab dot and the list must never be able to disagree about whether anything is
    stranded, so they are not two passes over the payload: this array IS both. The
    owner label is the TEMPLATE name the operator already reads in the row’s own
    template column, joined through the index this panel has anyway.
  */
  const liveBlind = liveLayerBlindness(linkDown, stackReady, items.length > 0);
  const liveRows = liveLayerRows(
    live,
    ownerLabelFor(items, (id) => templates.get(id)?.name),
    /*
      🔴 BOTH facts, through the ONE precedence helper. `stackReady` is not optional
      here and not belt-and-braces: STRANDED is decided by an item being ABSENT from
      the stack, and the stack is a separate snapshot that can land AFTER the ledger.
      Read without it, every seated layer would read stranded at mount and on every
      reconnect — and offer to cut a guest who is perfectly well owned.
    */
    liveBlind,
  );
  const liveStranded = hasStrandedLiveLayer(liveRows);
  const tabs: TabSpec[] = [
    { id: 'layers', label: 'LAYERS' },
    {
      id: 'live-sources',
      label: 'LIVE SOURCES',
      /*
        The dot means a live producer is lit with NO ROW THAT CAN REACH IT — the
        emergency this whole item exists for. It is deliberately NOT raised for an
        ordinary seated layer: those are normal, they belong to a row, and a dot that
        lit whenever a guest was on air would be noise the operator learns to ignore
        before the one day it means something.

        Not masked on `linkDown` the way the station dot is, because it does not need
        to be: with the link down every row resolves to `Unknown` and none is stranded,
        so the dot is already dark by the rows’ own reckoning rather than by a second
        rule.
      */
      ...(liveStranded
        ? { badge: { tone: 'warn' as const, label: 'A live layer has no row that can reach it' } }
        : {}),
    },
    {
      id: 'station-layers',
      label: 'STATION LAYERS',
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
            disabled={needsCaspar || onAirCount === 0}
            aria-label="Stop all on-air items"
            data-verb-tone="stop"
            title={
              needsCaspar
                ? needsCasparReason
                : 'Every on-air graphic runs its own outro and stays loaded'
            }
            onClick={() => void stopAll()}
          >
            <Icon icon={CircleArrowOutDownRight} />
            STOP ALL
          </Button>
          {/*
            CLEAR ALL is ALWAYS ENABLED — the bulk twin of the row's CLEAR escape
            hatch, and that half is unchanged: refusing the remedy because the
            STATE MODEL is confused strands graphics on air, so it is never gated
            on status. It keeps its confirm gate — always AVAILABLE is not always
            IMMEDIATE — and `stack.clearAll` only ever addresses this station's own
            items, so it cannot reach the reserved playout range.

            IT IS NOW GATED ON REACHABILITY, on BOTH hops — a deliberate reversal
            of "not even linkDown disables it". Never gating on layer state
            stands; reachability is a different question. With either hop down the
            command does not leave, so the button was not a remedy, only the
            appearance of one. It returns the instant both hops do.

            ⭐ B-122 — AND THE VERB BEHIND IT IS NOW AS BROAD AS THE BUTTON LOOKS.
            Always-enabled was only ever half the promise: the bridge still filtered
            its candidates on status, so an always-available button could still send
            nothing and report success. It now clears every row holding a layer,
            which is why the label and title no longer say "on-air" — they used to
            describe a narrower act than the one the operator was about to commit.
          */}
          <Button
            variant="neutral"
            disabled={needsCaspar}
            aria-label="Clear all rows holding a layer"
            data-verb-tone="clear"
            title={
              needsCaspar
                ? needsCasparReason
                : 'Every row holding a layer is cut immediately, with no outro — whatever its status reads'
            }
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
        share a strip — a single "Channel 1 | Channel 2 | STATION LAYERS" row could not
        say whose playout it meant — they are simply nested at the right levels.
      */}
      <Tabs tabs={tabs} activeId={activeTab} onSelect={setActiveTab} ariaLabel="Layer surfaces">
        {activeTab === 'layers' ? (
          !listReady ? (
            /*
              §3 — WAITING, said in a way that cannot be read as EMPTY.

              It ends when the DATA arrives — `ready` latches on the first snapshot,
              a push or a resolved pull — never on a timer and never on a guess. A
              timer would either uncover an empty list too early or hold a real one
              back, and both are worse than the wait itself.

              `role="status"` and not `alert`: nothing is wrong. This is the
              ordinary first second of a page, and the operator is being told what
              the console is doing rather than warned about it.

              NO CONFLICT WITH THE UNBOUND-ROW RULE. "This row has no template
              bound" is a fact about our list and reads EMPTY on the row. "We have
              not received the list yet" is not a fact about any row, so it is not
              said on one.
            */
            <div style={styles.empty} role="status" data-layers-loading="">
              <strong style={{ color: colors.text }}>Loading the layer list…</strong>
              <span>
                Waiting for the bridge to send the declared rows. This is not an empty list — the
                rows appear as soon as it answers.
              </span>
            </div>
          ) : bank === null ? (
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
            <>
              {/*
                §0 — ONE PANEL-LEVEL NOTICE, because thirty subtle signals are worse
                than one clear one.

                The rows each say LOADING and each hold their verbs, honestly and
                individually. This is the signal the operator's EYE catches: one
                line, at the top, saying plainly that the layer states are not in
                yet — rather than thirty rows he has to read one at a time.

                IT COMPLEMENTS THE ROWS AND REPLACES NOTHING. A notice saying "not
                known" over thirty rows each claiming EMPTY would be two sources
                disagreeing, which is the shape this panel keeps paying for. The
                rows stopped lying first; this is what gets NOTICED.

                `role="status"` sits on the ALWAYS-PRESENT wrapper, not on the
                message: a live region has to exist in the DOM before its content
                changes or the change is never announced. `status` and not `alert` —
                nothing is wrong, this is the ordinary first second of a page.
              */}
              {showSkips && (
                /*
                  `role="alert"`, not `status`: rows the operator was looking at are
                  GONE. That is not the ordinary first second of a page, which is what
                  the strip below reports — it is a change to their list that nothing
                  else announces, and it must interrupt.
                */
                <div style={styles.restoreSkipStrip} role="alert" data-restore-skips="">
                  <Icon icon={TriangleAlert} size={13} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <strong>
                      {restoreSkips.length} {restoreSkips.length === 1 ? 'row' : 'rows'} did not
                      come back
                    </strong>{' '}
                    after the bridge restarted:{' '}
                    {restoreSkips.map((s) => `${s.itemId} — ${restoreSkipReason(s)}`).join('; ')}.
                  </span>
                  <Button
                    variant="ghost"
                    aria-label="Dismiss the restore notice"
                    onClick={() => setDismissedSkips(skipsKey)}
                  >
                    <Icon icon={X} size={13} />
                  </Button>
                </div>
              )}
              <div style={styles.awaitingStrip} role="status">
                {awaitingRows > 0 && (
                  <>
                    {/* The same mark the waiting ROWS wear, and it MOVES — the one
                        thing at rest on this table never does. Shape before colour,
                        as everywhere else on this surface. */}
                    <Icon
                      icon={LoaderCircle}
                      size={13}
                      style={{ animation: 'cg-spin 1s linear infinite' }}
                    />
                    <span
                      data-layers-awaiting=""
                      title={AWAITING_PANEL_NOTICE}
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {AWAITING_PANEL_NOTICE}
                    </span>
                  </>
                )}
              </div>
              <div style={styles.list} ref={listRef}>
                {/* STICKY, and inside the scroll area — see `LayerTableHeader`. */}
                <LayerTableHeader
                  density={density}
                  onAirCount={onAirCount}
                  // §4 — `unreachable` only, never the boot window: a count that
                  // greyed itself for the first second of every reload would teach
                  // the operator to stop reading the grey.
                  unverifiable={linkDown || casparReach === 'unreachable'}
                />
                {rowBindings.map(({ slot, binding }, index) => {
                  /*
                    THE `?? null` THAT USED TO BE HERE IS THE BUG, and it is worth
                    naming because it reads as harmless: a bound slot whose item had
                    not arrived became `null`, which is the SAME value an unbound
                    slot produces — so the row could not tell "nothing is on this
                    layer" from "we have not been told yet", and reported the first.

                    `resolveRowBinding` is now the one place that decision is made,
                    and it takes `stackReady` as a required argument so it cannot be
                    made without considering it. It is resolved ONCE for the whole
                    table, in `rowBindings`, so the panel notice above and these rows
                    are reading the same array rather than agreeing by coincidence.

                    The row is no longer handed an `item` beside its binding: it takes
                    one out of the `bound` arm. A nullable next to the union is what
                    let the VERBS go on conflating "unbound" with "not yet known"
                    after the state cell had stopped.
                  */
                  const item = binding.kind === 'bound' ? binding.item : null;
                  const template = item !== null ? (templates.get(item.templateId) ?? null) : null;
                  return (
                    <LayerRow
                      key={slot.layer}
                      slot={slot}
                      binding={binding}
                      template={template}
                      // `#` — plain display order, 1 at the top of THIS list.
                      displayPosition={index + 1}
                      // The default alias's number — the layer's FIXED place in the
                      // bank, which ticking and unticking must never renumber. See
                      // `bankPosition` for why the two are deliberately separate.
                      bankPosition={bankPosition(bank, slot.layer)}
                      density={density}
                      selected={item !== null && item.itemId === selectedId}
                      /*
                        B-139 — the applied-plate baseline is SUPPLIED, through the
                        canonical `appliedPlateSources` the Inspector already uses.
                        Omitting it used to collapse every plate's baseline to `''`,
                        so this chip disagreed with the Inspector's in both
                        directions — and the UPDATE verb, which reads this same
                        boolean, refused an un-assignment the operator had staged.
                        The chip and the verb answer ONE question and take ONE value.
                      */
                      dirty={
                        item !== null &&
                        isItemDirty(
                          item.itemId,
                          item.fields,
                          appliedPlateSources(
                            item.templateId,
                            template?.liveSources?.sources ?? [],
                          ),
                        )
                      }
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
            </>
          )
        ) : activeTab === 'live-sources' ? (
          <LiveSourcesPanel
            rows={liveRows}
            ledgerReady={ledgerReady}
            blind={liveBlind}
            /*
              OPEN ROW means OPEN THE ROW, so it selects the item AND returns to the
              list the row lives on. Selecting alone would leave the operator looking
              at the same live-layer list wondering whether the click did anything —
              and the point of the control is to hand them the verbs, which are over
              there.
            */
            onSelectOwner={(itemId) => {
              onSelectionChange(itemId);
              setActiveTab('layers');
            }}
          />
        ) : (
          <StationLayersPanel layers={playout} />
        )}
      </Tabs>
      {configOpen && (
        <FixedBankConfigModal bank={bank} slots={slots} onClose={() => setConfigOpen(false)} />
      )}
      {confirmDialog}
    </Panel>
  );
}
