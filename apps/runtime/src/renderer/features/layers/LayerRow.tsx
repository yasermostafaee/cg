import { useRef, useState } from 'react';
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
import { casparRefusalReason } from '../../ui/reachWording.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { displayLabel } from '../library/templateName.js';
import { isOnAir } from '../stack/onAir.js';
import {
  importAndLoadOntoFixedSlot,
  loadTemplateOntoFixedSlot,
} from '../fixedLayers/fixedSlotLoad.js';
import { useTemplatePicker } from '../fixedLayers/useTemplatePicker.js';
import { layerRowActions, MISSING_TEMPLATE_REASON } from './layerRowActions.js';
import { LiveSourceSwapDialog } from './LiveSourceSwapDialog.js';
import { LookPicker, lookOptionsOf } from './LookPicker.js';
import { lookSwitchRefusal } from './lookSwitch.js';
import { LivePlateAudioDialog } from './LivePlateAudioDialog.js';
import { audioSummary, type RowPlateAudio } from './plateAudio.js';
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
   * The row's default NAME when it has no configured alias — `Layer 3`, `Bed 1`.
   *
   * 🔴 `B-201` — THE WHOLE STRING, resolved by the PANEL through the canonical
   * `defaultLayerAlias`, not a bare position this row formats itself.
   *
   * It used to be `bankPosition: number` and this file built `Layer ${bankPosition}` from
   * it. That is right for exactly one half of the bank. `defaultLayerAlias` picks the WORD
   * from `isLowBankLayer` — beds are `Bed N`, and each half counts down from its OWN top —
   * so the restated version called bed row 9 `Layer 1`, which is ALSO what it calls operator
   * row 89: two rows, the same name, on the surface an operator drives air from. The config
   * modal and the rehearsal overlay both called `defaultLayerAlias` all along, so the same
   * row answered to two different names depending on which panel was asking.
   *
   * Like `acceptsBank` below, the row is handed the ANSWER rather than a bank to derive it
   * from: one derivation, in the panel, for every row.
   */
  defaultAlias: string;
  /**
   * `single-clock-look-switch` — which half of the bank this row belongs to, resolved by
   * the PANEL through the canonical `isLowBankLayer` (the row is handed no bank of its own,
   * exactly like `defaultAlias`). The template picker refuses the other half's packages with
   * a reason, so the operator meets `wrong-bank` on the surface rather than at the bridge.
   */
  acceptsBank: 'low' | 'high';
  selected: boolean;
  dirty: boolean;
  /**
   * R-022 — is this row in REHEARSE? Resolved by the PANEL from the bridge's
   * pushed set (via the canonical `isRehearsing`), not by a per-row subscription:
   * one snapshot for the whole table keeps thirty rows agreeing by construction.
   */
  rehearsing: boolean;
  /**
   * `add-multibox-audio` — the LIVE PLATES this row's item actually owns, resolved by the
   * PANEL from the bridge's ledger for `rehearsing`'s reason: one snapshot for the whole
   * table, and the SAME array the LIVE SOURCES tab renders.
   *
   * ⚠ SEATED, not DECLARED. A declared plate with no producer cannot be audible, so a
   * summary counting declarations would name a denominator the audio strips do not have.
   * `B-164` did NOT change this — the wrong axis was seated vs SHOWN, not seated vs
   * declared, and the fraction is narrowed inside `audioSummary` rather than here.
   *
   * 🔴 It carries each plate's `volume` and `held` rather than just its id (`B-164`). The
   * bare id list could only support an INTENT count over a SEATED denominator, which is the
   * pair of wrong numbers this prop's consumer used to print. `held` is §12.4's disposition
   * and is what separates the plates the active look SHOWS from the ones it hides.
   *
   * Defaults to empty — a row rendered on its own (a test, a story) shows no summary, which
   * is the correct reading for a row that owns no live layers.
   */
  seatedPlates?: readonly RowPlateAudio[];
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
    // The gap between the main line and the LOOK line. Inert until Stage E: every
    // row before it was a single grid row, so this adds nothing to any other row.
    rowGap: '0.4rem',
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
 *   - the default ALIAS comes from `defaultLayerAlias` — `Layer N` for an operator row,
 *     `Bed N` for a bed row — the layer's FIXED place in ITS HALF of the bank
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
  defaultAlias,
  acceptsBank,
  selected,
  dirty,
  rehearsing,
  seatedPlates = [],
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
  const rowName = slot.alias ?? defaultAlias;

  /*
    §14.5 / `tasks.md` 7.1 — THE LOOK PICKER’S THREE FACTS.

    `looks` is `null` for BOTH “no look group” and “a group authoring zero looks” —
    `lookOptionsOf` collapses them once so no call site has to remember which emptiness
    is which. The zero-look case is a broken template and is refused at the TAKE door
    (`looks-none-authored`); it is not this control’s job to explain it.
  */
  const looks = lookOptionsOf(template?.liveSources);
  // The SAME helper every other AMCP-emitting verb on this row uses. Not a look-specific
  // rule: with either hop down the switch cannot leave the browser, so an enabled picker
  // would be the appearance of a capability rather than one (see `lookSwitch.ts`).
  const lookRefusal = casparRefusalReason(linkDown, casparReach);
  /**
   * Send the switch, and report a refusal where the operator is looking.
   *
   * 🔴 ONE SEAM. This is `stack.set-active-look` and nothing else: the bridge records the
   * look, `reconcileLivePlates` moves the FILLS, and the page is told on the `CG UPDATE`
   * payload so it moves the HOLES. There is deliberately no second path here — no local
   * optimistic state, no direct plate call — because the picker reads `item.activeLookId`
   * straight back off the published stack, so what it shows is what the bridge did.
   */
  const switchLook = async (itemId: string, lookId: string): Promise<void> => {
    /*
      🔴 THE REJECTION IS CAUGHT, not only the `ok: false`.

      A refused-by-the-bridge switch answers `{ ok: false }`; a switch that cannot BE MADE
      throws. `#invoke` rejects on a disconnected socket (R-006 refuses every request by
      design) and on a bridge whose build disagrees about this channel’s shape. Awaiting it
      without a catch meant an unhandled rejection and — worse — an operator who pressed a
      look, saw the segment move, and was told nothing at all.
    */
    try {
      const res = await window.cg.stack.setActiveLook({ itemId, lookId });
      if (!res.ok) reportCommandError(lookSwitchRefusal(res.reason, res.message));
    } catch (err) {
      reportCommandError(
        lookSwitchRefusal(undefined, err instanceof Error ? err.message : undefined),
      );
    }
  };

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

  /**
   * R-021 stage 4 — the bridge PARKED this row's restore: a producer that is not
   * ours holds its layer, so the item is on the row but not on the layer.
   *
   * Read ONCE here and handed to both consumers — the state cell's word and the
   * verbs' gate — so the row cannot come to say BLOCKED while offering PLAY. The
   * bridge decided it (`binding.restoreBlocked`); nothing here re-derives it from
   * `observed`, which cannot tell a decided block from a blind tap's ignorance.
   */
  const restoreBlocked = slot.binding?.restoreBlocked === true;

  // R-048 (6.9e) — the per-plate source picker for THIS row. Local state, because
  // it is one row opening its own dialog and nothing outside the row needs to know.
  const [swapOpen, setSwapOpen] = useState(false);
  // C-015 (6.5f) — and this row's per-plate audio panel, beside it.
  const [audioOpen, setAudioOpen] = useState(false);

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
    restoreBlocked,
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
      const chosen = await pickTemplate(`Load onto ${rowName}`, acceptsBank);
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
    // R-048 (6.9 / 6.9e) — the per-plate source swap, offered only where the bound
    // template actually declares plates. The verb OPENS the picker; the swap itself
    // is committed from inside it, which is what keeps the whole act to two actions.
    hasLivePlates: (template?.liveSources?.sources.length ?? 0) > 0,
    swapSource: () => {
      setSwapOpen(true);
      return Promise.resolve({ accepted: true });
    },
    plateAudio: () => {
      setAudioOpen(true);
      return Promise.resolve({ accepted: true });
    },
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
      /**
       * R-021 task 4.3 (owner decision b1) — WHAT THE DIALOG SAYS ABOUT OCCUPANCY.
       *
       * The hard Clear is PERMITTED on a declared row under OSC silence — that is
       * the whole of b1, and it is why `clearBankLayer` is gated by STRUCTURE (in
       * the bank, not reserved) rather than by observation. The price of allowing
       * it blind is that the dialog must not imply we can see: an operator who
       * believes the console checked will press through a confirmation they would
       * otherwise have read.
       *
       * So the sentence is chosen by what the WIRE actually says about the layer,
       * and every branch names the layer NUMBER — under silence that number is the
       * only thing the operator can carry to a rack.
       *
       *   unknown  → say so outright, and say what will happen anyway.
       *   producer → name the KIND. "There is an ffmpeg on 1-72" is the fact that
       *              stops a wrong click, and it is exactly the state a
       *              `restore-blocked` row is in.
       *   empty    → say that too. A confirmation that warns about destroying a
       *              graphic when the layer is observably free trains the operator
       *              to click through the ones that matter.
       */
      const occupancySentence =
        slot.observed.kind === 'unknown'
          ? `CasparCG is not reporting layer ${layerName} right now, so the console CANNOT tell you what is on it — this clears it anyway, whatever it is.`
          : slot.observed.kind === 'producer'
            ? `CasparCG reports a ${slot.observed.producer} producer on layer ${layerName}; it leaves air immediately, with no outro.`
            : `CasparCG reports layer ${layerName} as empty, so this should have nothing to destroy.`;
      return withConfirm(action, () =>
        confirm(
          item !== null
            ? {
                title: `Clear ${rowName}?`,
                body: `Layer ${layerName} is cleared immediately — the graphic leaves air with no outro. The template stays on the row and can be played again. ${occupancySentence}`,
                confirmLabel: 'Clear layer',
                tone: 'clear',
              }
            : {
                title: `Clear layer ${layerName}?`,
                body:
                  `This row holds no template, so this clears the LAYER itself: ` +
                  `whatever is on ${layerName} leaves air immediately, with no outro. ` +
                  `${occupancySentence}`,
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
    restoreBlocked,
    // R-058 Part A — the bridge's reason for an `error`, which was published on the item all
    // along and read by nothing. See the title note in `rowState`.
    ...(item?.errorCode !== undefined ? { errorCode: item.errorCode } : {}),
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
        {/*
          🔴 `add-multibox-audio` — THE ROW'S AUDIO SUMMARY, READ-ONLY, AND **OUTSIDE THE VERB
          BLOCK**.

          ── WHY IT IS HERE AND NOT A SEVENTH BUTTON ────────────────────────────────────

          `layerTable.ts` fixes `VERB_COUNT` at SIX, and the sticky header prints the word each
          glyph stands for directly ABOVE it. A seventh control — or a conditional one, which
          is what a plate-bearing row would need — moves every header word from that column
          rightward onto the WRONG glyph. That file names it as the dangerous failure for a
          specific reason: this product's STOP (graceful) and CLEAR (hard kill) are the inverse
          of the reference product's, and the header word is precisely the channel that retires
          the misread.

          So this rides the ALIAS cell beside the draft chip. It adds no column, `VERB_COUNT`
          stays 6, `gridTemplateColumns(density)` is untouched and `minWidthFor` still sums the
          same columns — the same "no new column" discipline the look picker's second line
          keeps, reached a different way.

          ── AND IT IS READ-ONLY, WHICH IS THE OTHER HALF ───────────────────────────────

          A row carries a VARIABLE number of plates; a control here would have to be one
          control for several values. The number is the whole job: an operator scanning thirty
          rows learns which ones have sound at all, and the strip in LIVE SOURCES — or this
          row's own audio dialog — is where a value is changed.
        */}
        {item !== null &&
          (() => {
            const summary = audioSummary(seatedPlates);
            return summary === null ? null : (
              <span
                /*
                  §3 — IT NOW CARRIES THE STATE COLOUR THE PILLS ALREADY USE, and the earlier
                  argument for muted-only is retired rather than overridden by taste: it said a
                  second coloured mark would compete with the row's STATE cell. SKY is not a
                  state hue on this surface — that is the same reason `plateAudio.ts` chose it
                  for AUDIBLE over green, which is the sacred ON AIR mark — so it competes with
                  nothing and the vocabulary matches LIVE SOURCES word for word.

                  🔴 STILL A PILL. Colour is the only thing that changed: no track, no fill, no
                  bar, no ramp. There is no per-input level to draw, and a shape that implied
                  one would be this product claiming a measurement it cannot take.
                */
                className={
                  summary.audible > 0 ? 'cg-chip-audio cg-chip-audio--audible' : 'cg-chip-audio'
                }
                data-audio-summary={summary.label}
                title={summary.detail}
                aria-label={summary.detail}
              >
                {summary.label}
              </span>
            );
          })()}
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
      {/*
        `data-verb-block` — a stable hook for the ONE invariant this block has: it contains
        exactly `VERB_COUNT` buttons, so every sticky header word sits above its own glyph.
        Asserted rather than trusted because the failure is silent and dangerous: this
        product's STOP (graceful) and CLEAR (hard kill) are the inverse of the reference
        product's, and the header word is what retires that misread.
      */}
      <span style={VERBS_GRID} data-verb-block="">
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
      {/*
        🔴 §14.5 / `tasks.md` 7.2 — THE LOOK PICKER, ON A SECOND LINE OUTSIDE THE VERB BLOCK.

        ── WHY HERE, AND WHY THE SHAPE RULE DOES NOT GOVERN IT ────────────────────────

        The SHAPE RULE is a rule about the VERB BLOCK — *“every row declares the SAME verbs
        in the SAME order, always”* — and it exists because a verb that appears and vanishes
        moves its neighbours under a hand already reaching for one. This control is not a
        verb and is not in that block, so the rule does not reach it; it is stated rather
        than implied because the picker IS conditional (only look-bearing rows have one) and
        a reader who assumed the rule applied would call that a violation.

        What it must not disturb is the COLUMN model, and it does not: `gridColumn: 1 / -1`
        adds no column, so `VERB_COUNT` stays 6, `gridTemplateColumns(density)` is untouched,
        `minWidthFor` still sums the same columns, and the header's words stay above their
        own glyphs — the invariant with a recorded on-air failure behind it (`VERB_COUNT`).

        DENSITY: the line spans whatever columns exist, so it is correct at all three; and
        it can never widen the row, because the strip scrolls inside itself instead.
      */}
      {looks !== null && item !== null && (
        <LookPicker
          looks={looks}
          activeId={item.activeLookId}
          /*
            🔴 `B-151` — DISABLED ONLY WHEN THE TARGET IS AIR.

            `casparRefusalReason` exists because an ON-AIR switch cannot leave the browser
            with the link down, so an enabled control would be the appearance of a
            capability. A REHEARSING row is off air: the bridge records the look and sends
            nothing, so the server's reachability has no bearing on whether the press can be
            done. Disabling it there would refuse a rehearsal for a reason that belongs to
            air — and rehearsing with the plant unreachable is precisely when a preview is
            most useful.
          */
          refusal={rehearsing ? undefined : lookRefusal}
          rowName={rowName}
          // The row's own state decides what the press changes, and says so on the control.
          target={rehearsing ? 'preview' : 'air'}
          onPick={(lookId) => {
            void switchLook(item.itemId, lookId);
          }}
        />
      )}
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
      {audioOpen && item !== null && template !== null && (
        <LivePlateAudioDialog
          item={item}
          template={template}
          /*
            `add-multibox-audio` — the MAP door, not the single-plate one. SOLO is a
            cross-plate statement and the bridge holds the row's live-seat lock for the whole
            map, so a look switch cannot land in the middle of one. `refused` carries the
            per-plate verdicts through unchanged: which guest did not move is the one thing an
            operator needs from a partial failure.
          */
          onApplyVolumes={async (volumes) => {
            const res = await window.cg.stack.setPlateVolumes({ itemId: item.itemId, volumes });
            return { ok: res.ok, refused: res.results.filter((r) => !r.ok).map((r) => r.plateId) };
          }}
          onClose={() => {
            setAudioOpen(false);
          }}
        />
      )}
      {swapOpen && item !== null && template !== null && (
        <LiveSourceSwapDialog
          item={item}
          template={template}
          onSwap={(plateId, sourceId) =>
            window.cg.stack.swapLiveSource({ itemId: item.itemId, plateId, sourceId })
          }
          onClose={() => {
            setSwapOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Load an already-imported template onto this row (the picker path), for reuse by tests. */
export { loadTemplateOntoFixedSlot };
