import { useRef } from 'react';
import type { FixedSlotState, TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState, StackItemStatus } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Icon } from '../../ui/Icon.js';
import { ContextMenu } from '../../ui/ContextMenu.js';
import { useContextMenu } from '../../ui/useContextMenu.js';
import { buttonActions, toMenuItems, withConfirm } from '../../ui/rowAction.js';
import { useConfirm } from '../../ui/useDialog.js';
import { DraftChip } from '../../ui/DraftChip.js';
import { pickFile } from '../../ui/pickFile.js';
import { useLink } from '../../hooks/useLink.js';
import { useCasparReach } from '../../hooks/useCasparReachable.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { displayLabel } from '../library/templateName.js';
import { isOnAir } from '../stack/onAir.js';
import {
  importAndLoadOntoFixedSlot,
  loadTemplateOntoFixedSlot,
} from '../fixedLayers/fixedSlotLoad.js';
import { useTemplatePicker } from '../fixedLayers/useTemplatePicker.js';
import { layerRowActions, MISSING_TEMPLATE_REASON } from './layerRowActions.js';
import { rowState, type RowBinding } from './rowState.js';
import {
  ROW_GEOMETRY,
  VERBS_GRID,
  VERB_TARGET_PX,
  densitySpec,
  gridTemplateColumns,
  type Density,
} from './layerTable.js';

interface Props {
  slot: FixedSlotState;
  /**
   * WHAT THIS ROW CARRIES, as the three-way fact — see `RowBinding`. THE ROW'S ONE
   * SOURCE, and there is deliberately no `item` prop beside it any more.
   *
   * There was, and the note here used to argue that everything except the state
   * cell was RIGHT to treat "no template bound" and "the stack has not arrived"
   * alike, because there is nothing to act on either way. That is true of what the
   * row can DO and false of what it may OFFER: `LOAD` is a list action, so it
   * survived every gate and stayed enabled through the whole bootstrap window on
   * rows that were already bound. Offering it there invites the operator to rebind
   * a row over a binding the panel has not yet been told about.
   *
   * So `item` is now taken OUT of the union's `bound` arm rather than passed
   * alongside it. The row cannot compute a different answer from the panel's — that
   * was already true — and it can no longer ask the question that conflates the two
   * facts, because there is no nullable left to ask it of.
   */
  binding: RowBinding;
  /** The bound item's template, for the name and the `hasNext` bit. */
  template: TemplateInfo | null;
  /**
   * The row's position in the RENDERED list, 1 at the top — the `#` column.
   *
   * Plain display order, by owner decision. Deliberately NOT the layer's place in the
   * bank: that number belongs to the default ALIAS below.
   */
  displayPosition: number;
  /**
   * The layer's 1-based place within its BANK, counting DOWN from the highest layer —
   * what the default alias (`Layer 1`, `Layer 2`, …) is built from.
   *
   * Comes from the canonical `bankPosition`, so it is fixed to the layer and survives
   * ticking, unticking and filtering. See `bankPosition`'s own comment for why a
   * handle that renumbers is worse than none.
   */
  bankPosition: number;
  selected: boolean;
  dirty: boolean;
  /**
   * R-022 — is this row in REHEARSE? Resolved by the PANEL from the bridge's
   * pushed set (via the canonical `isRehearsing`), not by a per-row subscription:
   * one snapshot for the whole table keeps thirty rows agreeing by construction.
   */
  rehearsing: boolean;
  /**
   * How much text this width can carry (see `layerTable.ts`). Defaults to the
   * widest — a row rendered on its own shows everything it has.
   */
  density?: Density;
  onSelect: (itemId: string | null) => void;
  /** The Inspector's Apply, so the row's UPDATE runs the identical path. */
  onUpdate: (itemId: string) => Promise<{ accepted: boolean; errorCode?: string | undefined }>;
}

const styles = {
  row: {
    display: 'grid',
    alignItems: 'center',
    columnGap: ROW_GEOMETRY.columnGap,
    padding: ROW_GEOMETRY.padding,
    minHeight: `${String(VERB_TARGET_PX + 10)}px`,
    borderBottom: `1px solid ${colors.border}`,
  },
  /** The bank position — LEFT-aligned, not centred (see the header comment). */
  rowNumber: {
    fontSize: '0.85rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums' as const,
    color: colors.textMuted,
  },
  state: { display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 },
  stateLabel: {
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  /**
   * The ALIAS — the row's primary label, and deliberately the biggest text on it.
   * Sized up from the mock-up, where it clearly outranks the template name beside
   * it rather than merely being bold.
   */
  alias: {
    fontSize: '1.05rem',
    fontWeight: 600,
    color: colors.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    minWidth: 0,
  },
  /**
   * The alias on an EMPTY row, dimmed to the dedicated empty-row grey.
   *
   * From the mock-up, and it earns its place: a row with nothing on it should not
   * compete for attention with rows that do. The name is still there and still
   * readable — it is the row's identity — just not shouting.
   */
  aliasEmpty: { color: colors.emptyRow, fontWeight: 500 },
  /**
   * The TEMPLATE column — the widest text column, and CENTRED per the owner.
   *
   * Centring works here because the column is wide and holds one value per row of
   * comparable weight; it would be the wrong call for the alias, which is scanned
   * down the list as a list of names and needs a common left edge to do that.
   */
  secondary: {
    fontSize: '0.85rem',
    color: colors.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    textAlign: 'center' as const,
  },
  /** The description column reads quieter than the template name beside it. */
  description: {
    fontSize: '0.85rem',
    color: colors.textMuted,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  empty: {
    fontSize: '0.85rem',
    color: colors.emptyRow,
    fontStyle: 'italic' as const,
    // Same column as the template name, so it takes the same alignment.
    textAlign: 'center' as const,
  },
  /**
   * EVERY text cell on an empty row takes the empty-row grey — the whole row recedes
   * together, rather than one cell being dimmed while its neighbours stay bright.
   */
  onEmptyRow: { color: colors.emptyRow },
  /** The 'template is not here' marker, quieter than the name it qualifies. */
  missingTemplate: { color: colors.textMuted, fontStyle: 'italic' as const },
} as const;

/**
 * R-028 (4.1/4.2) — ONE layer row: the whole operator surface for one declared
 * layer, as a real table row under the list's sticky header.
 *
 * WHAT IDENTIFIES A ROW — two numbers that answer two different questions, settled
 * separately by the owner and normally reading the same.
 *
 *   - `#` is PLAIN DISPLAY ORDER: 1 at the top of the rendered list, counting down.
 *   - the default ALIAS is `Layer <bankPosition>`, the layer's FIXED place in the bank
 *     counting down from its highest layer — so `Layer 1` is the top layer, the one
 *     that draws over the others and therefore the one an operator means by it.
 *
 * With the shipped bank (70–99 declared, the top five ticked) these read identically:
 * `#1` is layer 99, which is `Layer 1`. They diverge only if a NON-CONTIGUOUS set is
 * ticked — untick 97 and the third visible row is `#3` while still being `Layer 4`.
 * That is the accepted cost of the constraint below, taken knowingly.
 *
 * THE ALIAS NUMBER IS BOUND TO THE BANK, not to what is displayed, and that is what
 * makes it safe to say out loud. Ticking and unticking change what is shown; neither
 * renumbers anything. `Layer 1` is always layer 99 whether or not it is ticked. If
 * unticking renumbered the rows past it, "Layer 2" would mean different rows on
 * different days — a positional handle that silently renumbers is worse than none.
 *
 * THE REAL CasparCG LAYER NUMBER IS NOT A COLUMN. The owner took it off the row —
 * it lives in the Inspector, and in this row's own tooltip and accessible name
 * (`rowTitle`), so it stays one hover or one focus away at every density without
 * spending a column. That mitigation is what made removing it safe: the layer
 * number is the vocabulary shared with the playout side (the reservation is 60–69,
 * not rows 1–4), and on a narrow screen the Inspector is an overlay behind a
 * hamburger — so it must not be reachable ONLY there.
 *
 * WHAT THE ROW SHOWS, in the column order the header declares:
 *
 *   - `#`, the display position;
 *   - the STATE, as icon + colour + word (`rowState`). This is where colour lives
 *     now that the verbs are neutral, and it is the one thing on the row allowed
 *     to shout;
 *   - the ALIAS, primary — the name the operator actually thinks in;
 *   - the template on the row, resolved through the canonical display rule;
 *   - the description: what the WIRE observes on this layer, verbatim;
 *   - the real layer number;
 *   - the verbs.
 *
 * The verbs come from `layerRowActions` as ONE list, rendered as icon-only
 * buttons AND as the right-click menu, so the two can never diverge in gate,
 * handler or wording. Buttons are present-but-disabled before a load (the owner's
 * point 8). They are ICON-ONLY, which is safe for exactly one reason: the sticky
 * column header carries the word each glyph stands for. Each button also keeps an
 * `aria-label` and a tooltip, so the label exists in three independent channels —
 * the header is complementary to those, never a substitute.
 *
 * D8 / B-087 — with the link down every row displays UNKNOWN regardless of the
 * frozen snapshot, and every verb is disabled: a frozen occupancy claim is one
 * the wire can no longer back.
 */
export function LayerRow({
  slot,
  binding,
  template,
  displayPosition,
  bankPosition,
  selected,
  dirty,
  rehearsing,
  density = 'full',
  onSelect,
  onUpdate,
}: Props): JSX.Element {
  const link = useLink();
  const linkDown = link === 'disconnected';
  // THE SECOND HOP — a live bridge says nothing about the playout machine.
  // Three-valued: `connecting` refuses like `unreachable` but is worded as the
  // wait it is, not as a fault nothing has reported (see `reachWording`).
  const casparReach = useCasparReach();
  const { confirm, confirmDialog } = useConfirm();
  const { pickTemplate, pickerDialog } = useTemplatePicker();
  const { menu, open, close } = useContextMenu<number>();
  // The row's own hidden `.vcg` input. `pickFile` turns it into a promise so the
  // whole import+load chain is ONE action's `run` — the button and its menu twin
  // then share it by construction, rather than the real work living in an
  // undeclared `onChange`.
  const fileRef = useRef<HTMLInputElement>(null);
  const spec = densitySpec(density);

  /**
   * The row's item, taken out of the union's ONE arm that has one.
   *
   * Everything below that reads `item` is asking about a row we KNOW is bound —
   * its name, its selection target, its data attributes, its confirm wording. What
   * must NOT be asked of it is whether a verb is offered: `null` here still covers
   * both `unbound` and `awaiting`, and those two offer opposite things. That
   * question is settled from `binding.kind` inside `layerRowActions`, which is why
   * the binding and not this value is what gets passed to it.
   */
  const item: StackItemState | null = binding.kind === 'bound' ? binding.item : null;

  const layerName = `${String(slot.channel)}-${String(slot.layer)}`;
  /**
   * The row's name. An operator-configured alias wins; otherwise the default is
   * `Layer <bank position>` — the SAME number the `#` column shows, so the two can
   * never disagree about which row this is.
   *
   * It used to default to the CasparCG layer number (`Layer 70`), which read as a
   * name while actually being wire vocabulary, and now contradicts the `#` column.
   */
  const rowName = slot.alias ?? `Layer ${String(bankPosition)}`;
  const templateLabel =
    template !== null
      ? (displayLabel(template) ?? template.templateId)
      : slot.binding !== null
        ? (displayLabel({
            name: slot.binding.templateName,
            sourceFileName: slot.binding.sourceFileName,
          }) ?? slot.binding.templateType)
        : null;

  /**
   * The row is bound, but this browser does not hold the template. It cannot be
   * put back on the layer, so the toggle offers the way OUT — and the row says
   * why, in the template cell as well as on the control.
   */
  const templateMissing = item !== null && template === null;

  const coord = { channel: slot.channel, layer: slot.layer };
  const actions = layerRowActions({
    // THE UNION, not `item`. See the `binding` prop's note: this is the whole of
    // the fix, and passing `item` here again is exactly how it would come undone.
    binding,
    observed: slot.observed,
    hasNext: template?.hasNext === true,
    linkDown,
    casparReach,
    dirty,
    rehearsing,
    // R-022 — one toggle, both directions. The bridge answers
    // `{ ok, reason?, message? }`; the row's verbs speak `AsyncResult`, so the
    // guard's `reason` rides through as `errorCode` for operator wording — the
    // `clearLayer` pattern below.
    toggleRehearse: async (itemId) => {
      const res = rehearsing
        ? await window.cg.rehearse.exit({ itemId })
        : await window.cg.rehearse.enter({ itemId });
      return { accepted: res.ok, ...(res.reason !== undefined ? { errorCode: res.reason } : {}) };
    },
    /**
     * §6 — LOAD OPENS THE PICKER, and importing is one option inside it.
     *
     * It used to go straight to the file chooser, with "use one I already have"
     * exiled to a context-menu entry called LOAD FROM LIBRARY — a control naming a
     * panel R-028 deleted. Deleting that entry alone would have deleted the picker
     * with it, and R-005's remove-a-template inside the picker, so the picker moved
     * here instead.
     *
     * BOTH OUTCOMES END IN THE SAME BINDING. `importAndLoadOntoFixedSlot` and
     * `loadTemplateOntoFixedSlot` were already the two halves of one flow (the
     * first calls the second once the bytes are registered), so this is one verb
     * with two sources for the template, not two loads sharing a button.
     */
    load: async () => {
      const chosen = await pickTemplate(`Load onto ${rowName}`);
      // The operator's own dismissal: not a success, not a refusal to report.
      if (chosen === null) return { accepted: false, cancelled: true };
      if (chosen !== 'import') return loadTemplateOntoFixedSlot(coord, chosen);
      const input = fileRef.current;
      if (input === null) return { accepted: false };
      return importAndLoadOntoFixedSlot(coord, () => pickFile(input));
    },
    /**
     * The post-CLEAR re-ADD: put the row's OWN bound template back, no picking.
     *
     * It goes through `loadTemplateOntoFixedSlot` — the SAME function the library
     * picker uses once a template is chosen — so the re-ADD cannot drift from the
     * ordinary load path. The only difference is where the template comes from:
     * the row already knows it, so the operator is not asked.
     *
     * `template === null` is refused rather than guessed at. The toggle does not
     * offer LOAD in that state (it shows REMOVE and says why), so this is the
     * belt to that braces — reachable only if the two ever disagreed.
     */
    reload: async () => {
      if (template === null) return { accepted: false, errorCode: 'unknown-template' };
      return loadTemplateOntoFixedSlot(coord, template);
    },
    // A bound row can only be re-loaded if this browser still holds its
    // template. `true` on an unbound row, where the question is meaningless.
    templateAvailable: item === null || template !== null,
    play: (itemId) => window.cg.stack.take({ itemId }),
    next: (itemId) => window.cg.stack.next({ itemId }),
    update: (itemId) => onUpdate(itemId),
    stop: (itemId) => window.cg.stack.stop({ itemId }),
    clear: (itemId) => window.cg.stack.out({ itemId }),
    // The unbound half of CLEAR: addressed to the LAYER, not to an item. The
    // channel answers `{ ok, reason?, message? }`; the row's verbs speak
    // `AsyncResult`, so the guard's `reason` rides through as `errorCode` and
    // `errorCodeMessage` gives it operator wording.
    clearLayer: async () => {
      const res = await window.cg.fixedLayers.clearLayer({
        channel: coord.channel,
        layer: coord.layer,
      });
      return { accepted: res.ok, ...(res.reason !== undefined ? { errorCode: res.reason } : {}) };
    },
    remove: (itemId) => window.cg.stack.remove({ itemId }),
    onError: reportCommandError,
  }).map((action) => {
    // Confirm gates attached at DECLARATION time, so button and menu share them.
    // CLEAR destroys a live producer; REMOVE additionally takes the item off the
    // row. Both name the row and say what reaches air.
    if (action.key === 'clear') {
      // Two different acts behind one verb, so two different gates. The BOUND case
      // knows what it is destroying and says so. The UNBOUND case must NOT pretend to:
      // it is the escape hatch for exactly the situation where the console's model is
      // wrong, so the wording promises only what is certain — the layer is cleared,
      // whatever happens to be on it — and never implies we know it is empty.
      return withConfirm(action, () =>
        confirm(
          item !== null
            ? {
                title: `Clear ${rowName}?`,
                body: `Layer ${layerName} is cleared immediately — the graphic leaves air with no outro. The template stays on the row and can be played again.`,
                confirmLabel: 'Clear layer',
                tone: 'clear',
              }
            : {
                title: `Clear layer ${layerName}?`,
                body:
                  `This row holds no template, so this clears the LAYER itself: ` +
                  `whatever is on ${layerName} leaves air immediately, with no outro. ` +
                  `Use it when a layer is stuck or the console cannot tell you what is ` +
                  `on it — it does not need to know in order to clear it.`,
                confirmLabel: 'Clear layer',
                tone: 'clear',
              },
        ),
      );
    }
    // The LOAD/REMOVE toggle: only the REMOVE half is gated. A toggle
    // affordance implies cheap and reversible, and this half is neither — it
    // takes the item off the row and CLEARS the layer, which for an on-air
    // graphic means it leaves the output. So the gate says that in words, and
    // says ON AIR plainly when the item is (part A's rule, kept).
    /*
      KEYED ON THE ACTION'S OWN `tone`, NOT ON A SECOND READ OF THE ROW.

      This said `action.key === 'load-remove' && item !== null` — the key is the
      same for both halves of the toggle, so `item !== null` was a SECOND,
      independent answer to "is this the REMOVE half?" sitting one layer away
      from the one that picks the label. When the two disagreed, the row read
      LOAD and opened the REMOVE modal.

      `tone` is set by the same branch that sets the label, so the dialog and the
      word now come from one resolution and cannot drift. This is also why the
      previous task's test did not catch it: it asserted the resolved verb out of
      `layerRowActions`, which was right — and the modal was never chosen there.
    */
    if (action.key === 'load-remove' && action.tone === 'remove' && item !== null) {
      const onAirNow = isOnAir(item);
      return withConfirm(action, () =>
        confirm({
          title: `Remove “${templateLabel ?? rowName}” from ${rowName}?`,
          body: onAirNow
            ? `This item is ON AIR. Removing it CLEARS layer ${layerName} — the graphic leaves the output immediately, with no outro.`
            : // §6 — "a pick from the library" named a panel that no longer exists.
              // LOAD opens the picker, which is where both paths now are.
              `The item leaves the row and layer ${layerName} is cleared. Loading again means pressing LOAD and choosing a template, or importing a new .vcg.`,
          confirmLabel: onAirNow ? 'Remove and clear (ON AIR)' : 'Remove',
          tone: 'remove',
        }),
      );
    }
    return action;
  });

  const buttons = buttonActions(actions);

  // R-006 — in TEST MODE an air claim is badged SIM, never the broadcast red:
  // the mock may simulate, but it may not claim air that does not exist.
  const simulated = link === 'offline-mock';
  const onAirClaim = item?.status === 'on-air' || item?.status === 'playing';
  // B-087 — with the SPA↔bridge link down, a frozen on-air claim is masked to
  // the muted `unverified` "WAS ON AIR". B-086's reconciler demotion cannot
  // reach us (a dead bridge publishes nothing) and `useBridgeSnapshot` freezes
  // the last snapshot, so without this the row would keep rendering the sacred
  // red the wire can no longer back. Display mask only — reconnect re-pulls the
  // authoritative status and it lifts on its own.
  //
  // §4 — AND THE SECOND HOP DOES THE SAME, for the same reason one hop along. An
  // air claim we cannot confirm is an air claim we may not wear, and with the
  // playout server unreachable the bridge's own reconciler demotion cannot reach
  // us either. `unreachable` ONLY, never `connecting`: greying and past-tensing a
  // live row for the first second of every reload would train the operator to
  // ignore the very signal this exists to give him.
  const casparUnreachable = casparReach === 'unreachable';
  const airUnbackable = linkDown || casparUnreachable;
  const badgeStatus: StackItemStatus | null =
    item === null ? null : airUnbackable && onAirClaim ? 'unverified' : item.status;
  // B-093 — WHY unverified? The bridge publishes the cause on the item itself,
  // so the row reads it directly rather than taking a second subscription.
  const oscBlind = badgeStatus === 'unverified' && item?.errorCode === 'osc-unverifiable';

  /**
   * The panel's three-way fact, with this row's own air-confidence override
   * folded into the BOUND case only.
   *
   * `badgeStatus` can rewrite a bound row's status to `unverified` when neither
   * hop can back an air claim; it has nothing to say about a row whose item has
   * not arrived, and nothing to say about an unbound one. Rebuilding the union
   * here rather than threading `badgeStatus` into it keeps that scoping explicit —
   * and `binding.kind` is still the panel's answer, never a second derivation.
   */
  const stateBinding: RowBinding =
    binding.kind === 'bound' && badgeStatus !== null
      ? { kind: 'bound', item: { ...binding.item, status: badgeStatus } }
      : binding;

  const state = rowState({
    binding: stateBinding,
    pending: item?.pending === true,
    observed: slot.observed,
    linkDown,
    casparUnreachable,
    simulated,
    oscBlind,
    rehearsing,
  });

  // The wire's occupancy report is no longer rendered as a column — `rowState` folds
  // it into the state cell's tooltip, reading the same canonical `occupancyLabel`.
  /**
   * TOGGLE select (owner request): clicking the selected row again DESELECTS it.
   *
   * This also settles a contradiction the row already carried — it renders
   * `aria-pressed={selected}`, which announces a toggle to assistive tech, while a
   * second click used to do nothing. The behaviour now matches what the row has been
   * claiming about itself.
   *
   * Deselecting is a real operator need, not just symmetry: with nothing selected the
   * Inspector returns to "Select a stack item", which is how you stop an accidental
   * edit from being staged against a live graphic you did not mean to touch. On a
   * narrow screen it is also how you dismiss the Inspector overlay from the row.
   *
   * An empty row still resolves to `null` — there is nothing to select, so a click is
   * a deselect either way.
   */
  const select = (): void => onSelect(item === null || selected ? null : item.itemId);

  /**
   * The row's own tooltip and accessible name, and the reason the LAYER column
   * could be removed.
   *
   * The owner took the real CasparCG layer number off the row — it lives in the
   * Inspector. On its own that would have made it unreachable exactly when it is
   * needed: on a narrow screen the Inspector is an overlay behind a hamburger, and
   * the layer number is what an operator and a playout engineer say to each other
   * at 2 a.m. ("clear one-seventy-one", not "clear row three"). Carrying it here
   * costs no column and keeps it one hover or one keyboard focus away at every
   * density — the same trade this surface already makes for the occupancy report
   * and, now, for the READY distinction.
   */
  const rowTitle = `Row ${String(displayPosition)} · ${rowName} · CasparCG layer ${layerName}`;

  return (
    <div
      // `has-template` lifts a row that holds something above the empty ones — a
      // semantic difference, not a striping pattern (see `controls.css`).
      className={`cg-row${item !== null ? ' has-template' : ''}${selected ? ' is-selected' : ''}`}
      style={{ ...styles.row, gridTemplateColumns: gridTemplateColumns(density) }}
      // The row's stable anchor is the LAYER NUMBER — the declared identity that
      // survives every load, unlike an itemId.
      data-layer={String(slot.layer)}
      data-row-number={String(displayPosition)}
      {...(item !== null ? { 'data-item-id': item.itemId } : {})}
      {...(template !== null ? { 'data-template-id': template.templateId } : {})}
      onContextMenu={(e) => open(e, slot.layer)}
      /*
        THE WHOLE ROW IS THE SELECTION TARGET, edge to edge.

        The handler used to sit on the label body alone, so clicking the row
        number, the state or the empty space to their left did nothing — the
        operator aimed at a row, hit it, and the Inspector did not change. Only
        the verb block is excluded, and it excludes itself by stopping
        propagation rather than by this handler knowing where the buttons are.
      */
      onClick={(e) => {
        // Anything the operator can PRESS handles its own click; the row must not
        // also select on it. Asking the event where it came from beats hanging a
        // `stopPropagation` on a wrapper: it covers the verb buttons, the
        // right-click menu's items and the hidden file input in one rule, and it
        // keeps the row's own handler the only click handler on the row.
        if ((e.target as Element).closest('button, [role="menuitem"], input') !== null) return;
        select();
      }}
      /*
        Keyboard parity. A row that is only reachable by pointer is not reachable
        in a gallery; `Enter`/`Space` select it exactly as a click does.
      */
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      // Both carry the real layer number now that its column is gone — the
      // tooltip for a pointer, the accessible name for a screen reader.
      title={rowTitle}
      aria-label={`${rowTitle} · ${state.label}`}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        // Never swallow a key aimed at a control inside the row.
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        select();
      }}
    >
      <span
        style={item === null ? { ...styles.rowNumber, ...styles.onEmptyRow } : styles.rowNumber}
      >
        {displayPosition}
      </span>
      {/*
        THE STATE — icon + colour + word, the row's one loud signal now that the
        verbs are neutral. The icon carries a `title` so the longer explanation
        (why `unknown`, why `ON AIR?`) reaches the operator through the shared
        tooltip; the word is always beside it except at the tightest density,
        where the `aria-label` and the tooltip still carry it.
      */}
      <span
        style={{ ...styles.state, color: state.color }}
        title={state.title ?? state.label}
        aria-label={`status ${state.label}`}
        /*
          The state's ROLE, as a stable hook.

          Tests assert on this rather than sniffing the rendered colour — R-006's
          "a simulation may never wear the broadcast red" and B-087's "a frozen
          air claim is demoted" are both claims about the ROLE, and a test that
          matched a hex value would fail the next time the palette was tuned
          while saying nothing about the property that matters.
        */
        data-row-state={state.tone}
        /*
          §4 — "this label is not currently backed by the wire", as a hook that is
          not a hex value.

          It sits BESIDE `data-row-state` rather than replacing a value in it,
          because the two say different things and the operator needs both: the
          ROLE is unchanged (a READY row is still ready, a bound row is still
          bound) and only the CONFIDENCE is withdrawn. Collapsing them into a
          single "unknown" role would be the rename the owner explicitly refused.
        */
        {...(state.unverifiable === true ? { 'data-unverifiable': '' } : {})}
      >
        <Icon
          icon={state.icon}
          // 25px, per the owner. This mark is the row's one loud signal now that the
          // verbs are neutral, and it has to be readable from across a gallery —
          // bigger than any glyph on the row, including the verb icons.
          size={25}
          {...(state.transient === true
            ? { style: { animation: 'cg-spin 1s linear infinite' } }
            : {})}
        />
        {spec.showStateLabel && <span style={styles.stateLabel}>{state.label}</span>}
      </span>
      {/* THE ALIAS — primary. Dimmed on a row with nothing on it, so occupied rows
          own the attention. */}
      <span
        style={item === null ? { ...styles.alias, ...styles.aliasEmpty } : styles.alias}
        data-row-body=""
        title={rowName}
      >
        {rowName}
        {dirty && <DraftChip label={`${rowName} has unapplied edits`} />}
      </span>
      {spec.showTemplate &&
        (templateLabel !== null ? (
          <span
            style={styles.secondary}
            /*
              A BOUND ROW WHOSE TEMPLATE IS NOT IN THIS BROWSER SAYS SO, visibly.
              It is not a label edge case: the row is pointing at something that
              is not here, which means it cannot be put back on the layer, and an
              operator scanning the table has no other way to learn that. The
              same string the LOAD/REMOVE toggle uses, so the cell and the
              control cannot describe the row differently.
            */
            title={
              templateMissing ? `${templateLabel} — ${MISSING_TEMPLATE_REASON}` : templateLabel
            }
            dir="auto"
          >
            {templateLabel}
            {templateMissing && <span style={styles.missingTemplate}> (not in this browser)</span>}
          </span>
        ) : (
          <span style={styles.empty}>Empty</span>
        ))}
      {/* No DESCRIPTION column — what the wire reports about this layer is carried by
          the STATE cell's tooltip above, which always ends with CasparCG's own words
          for it. That is what made removing the column safe: the occupancy report is
          the B-094 honesty class, so it had to move rather than go. */}
      {/* There is no LAYER column any more — the real CasparCG layer number moved
          to the Inspector, and to this row's own tooltip / accessible name so it
          stays reachable at every density (see `rowTitle`). */}
      {/*
        The verb block. It needs no click handler of its own: the row's handler
        ignores anything that came from a control (see `onClick` above).
      */}
      <span style={VERBS_GRID}>
        {buttons.map((action) => (
          <AsyncButton
            key={action.key}
            variant="verb"
            run={action.run}
            disabled={action.disabled}
            onError={action.onError}
            iconOnly
            // R-022 — a TOGGLE whose mode is engaged paints filled (REHEARSE while
            // rehearsing). Read from the action's own declaration so the button and
            // its right-click twin cannot disagree.
            active={action.active === true}
            // The per-verb HOVER fill (`--r-verb-*`). An attribute rather than a
            // class so the six colours live entirely in `controls.css` and the
            // renderer never names one.
            {...(action.tone !== undefined ? { 'data-verb-tone': action.tone } : {})}
            aria-label={action.label}
            // The tooltip. `title` is why-disabled when the action is refused,
            // and otherwise the verb itself — an icon-only control must say what
            // it is on hover and on keyboard focus.
            title={action.title ?? action.label}
            {...(action.icon !== undefined ? { icon: action.icon } : {})}
          >
            {action.label}
          </AsyncButton>
        ))}
      </span>
      <input
        ref={fileRef}
        type="file"
        accept=".vcg"
        style={{ display: 'none' }}
        aria-label={`Import .vcg for ${rowName}`}
      />
      {menu !== null && (
        <ContextMenu
          items={toMenuItems(actions)}
          x={menu.x}
          y={menu.y}
          ariaLabel={`${rowName} actions`}
          onClose={close}
        />
      )}
      {confirmDialog}
      {pickerDialog}
    </div>
  );
}

/** Load an already-imported template onto this row (the picker path), for reuse by tests. */
export { loadTemplateOntoFixedSlot };
