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
import { reportCommandError } from '../status/commandFeedback.js';
import { displayLabel } from '../library/templateName.js';
import { isOnAir } from '../stack/onAir.js';
import {
  importAndLoadOntoFixedSlot,
  loadTemplateOntoFixedSlot,
} from '../fixedLayers/fixedSlotLoad.js';
import { useTemplatePicker } from '../fixedLayers/useTemplatePicker.js';
import { occupancyLabel } from '../fixedLayers/occupancyLabel.js';
import { layerRowActions } from './layerRowActions.js';
import { rowState } from './rowState.js';
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
  /** The stack item bound to this row, or null when the row is empty. */
  item: StackItemState | null;
  /** The bound item's template, for the name and the `hasNext` bit. */
  template: TemplateInfo | null;
  /**
   * The layer's 1-based position within its BANK, counting DOWN from the highest
   * layer — the operator's stable handle on the row, and the number its default
   * alias uses.
   *
   * Comes from the canonical `bankPosition` and is deliberately NOT the row's index
   * in the rendered list: the list can be filtered, and a handle that renumbers when
   * a row is hidden is worse than no handle. See the header comment, and
   * `bankPosition`'s own, for why.
   */
  bankPosition: number;
  selected: boolean;
  dirty: boolean;
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
  /** Secondary text columns — template name, description. */
  secondary: {
    fontSize: '0.85rem',
    color: colors.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  /** The description column reads quieter than the template name beside it. */
  description: {
    fontSize: '0.85rem',
    color: colors.textMuted,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  empty: { fontSize: '0.85rem', color: colors.emptyRow, fontStyle: 'italic' as const },
  /**
   * EVERY text cell on an empty row takes the empty-row grey — the whole row recedes
   * together, rather than one cell being dimmed while its neighbours stay bright.
   */
  onEmptyRow: { color: colors.emptyRow },
} as const;

/**
 * R-028 (4.1/4.2) — ONE layer row: the whole operator surface for one declared
 * layer, as a real table row under the list's sticky header.
 *
 * WHAT IDENTIFIES A ROW — ONE number, shown twice, never two numbers.
 *
 * The handle is the layer's position in its BANK (`bankPosition`): 1-based,
 * counting UP from the bank's first layer. It appears in the `#` column AND as the
 * default alias (`Layer 1`, `Layer 2`, …), and both read the same canonical
 * function so they cannot drift. That matters more than it sounds: two small
 * integers on one row disagreeing about which row it is turns "fire layer 2" into a
 * coin flip at 2 a.m.
 *
 * It counts DOWN FROM THE HIGHEST layer, so position 1 is the bank's top layer — the
 * one that draws over the others, and therefore the one an operator means by
 * "Layer 1". Because the list is displayed descending by layer (mirroring on-air
 * z-order), position 1 is also the top ROW, and the `#` column reads 1, 2, 3, 4
 * downwards.
 *
 * It is bound to the BANK, not to the rendered list. The list can be filtered, so an
 * index-based number would renumber the moment a row was hidden — and a positional
 * handle that silently renumbers is worse than none, because the person saying
 * "layer 3" and the person reading the screen would mean different rows. A hidden row
 * therefore leaves a GAP in the sequence, which is honest.
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
 *   - the bank position;
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
  item,
  template,
  bankPosition,
  selected,
  dirty,
  density = 'full',
  onSelect,
  onUpdate,
}: Props): JSX.Element {
  const link = useLink();
  const linkDown = link === 'disconnected';
  const { confirm, confirmDialog } = useConfirm();
  const { pickTemplate, pickerDialog } = useTemplatePicker();
  const { menu, open, close } = useContextMenu<number>();
  // The row's own hidden `.vcg` input. `pickFile` turns it into a promise so the
  // whole import+load chain is ONE action's `run` — the button and its menu twin
  // then share it by construction, rather than the real work living in an
  // undeclared `onChange`.
  const fileRef = useRef<HTMLInputElement>(null);
  const spec = densitySpec(density);

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

  const coord = { channel: slot.channel, layer: slot.layer };
  const actions = layerRowActions({
    item,
    observed: slot.observed,
    hasNext: template?.hasNext === true,
    linkDown,
    dirty,
    load: async () => {
      const input = fileRef.current;
      if (input === null) return { accepted: false };
      return importAndLoadOntoFixedSlot(coord, () => pickFile(input));
    },
    loadFromLibrary: async () => {
      const template = await pickTemplate(`Load onto ${rowName}`);
      // The operator's own dismissal: not a success, not a refusal to report.
      if (template === null) return { accepted: false, cancelled: true };
      return loadTemplateOntoFixedSlot(coord, template);
    },
    play: (itemId) => window.cg.stack.take({ itemId }),
    next: (itemId) => window.cg.stack.next({ itemId }),
    update: (itemId) => onUpdate(itemId),
    stop: (itemId) => window.cg.stack.stop({ itemId }),
    clear: (itemId) => window.cg.stack.out({ itemId }),
    remove: (itemId) => window.cg.stack.remove({ itemId }),
    onError: reportCommandError,
  }).map((action) => {
    // Confirm gates attached at DECLARATION time, so button and menu share them.
    // CLEAR destroys a live producer; REMOVE additionally takes the item off the
    // row. Both name the row and say what reaches air.
    if (action.key === 'clear') {
      return withConfirm(action, () =>
        confirm({
          title: `Clear ${rowName}?`,
          body: `Layer ${layerName} is cleared immediately — the graphic leaves air with no outro. The template stays on the row and can be played again.`,
          confirmLabel: 'Clear layer',
          variant: 'caution-strong',
        }),
      );
    }
    // The LOAD/REMOVE toggle: only the REMOVE half is gated. A toggle
    // affordance implies cheap and reversible, and this half is neither — it
    // takes the item off the row and CLEARS the layer, which for an on-air
    // graphic means it leaves the output. So the gate says that in words, and
    // says ON AIR plainly when the item is (part A's rule, kept).
    if (action.key === 'load-remove' && item !== null) {
      const onAirNow = isOnAir(item);
      return withConfirm(action, () =>
        confirm({
          title: `Remove “${templateLabel ?? rowName}” from ${rowName}?`,
          body: onAirNow
            ? `This item is ON AIR. Removing it CLEARS layer ${layerName} — the graphic leaves the output immediately, with no outro.`
            : `The item leaves the row and layer ${layerName} is cleared. Loading again is a fresh import or a pick from the library.`,
          confirmLabel: onAirNow ? 'Remove and clear (ON AIR)' : 'Remove',
          variant: 'danger',
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
  const badgeStatus: StackItemStatus | null =
    item === null ? null : linkDown && onAirClaim ? 'unverified' : item.status;
  // B-093 — WHY unverified? The bridge publishes the cause on the item itself,
  // so the row reads it directly rather than taking a second subscription.
  const oscBlind = badgeStatus === 'unverified' && item?.errorCode === 'osc-unverifiable';

  const state = rowState({
    status: badgeStatus,
    pending: item?.pending === true,
    observed: slot.observed,
    linkDown,
    simulated,
    oscBlind,
  });

  const description = occupancyLabel(slot.observed, linkDown);
  const select = (): void => onSelect(item === null ? null : item.itemId);

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
  const rowTitle = `Row ${String(bankPosition)} · ${rowName} · CasparCG layer ${layerName}`;

  return (
    <div
      // `has-template` lifts a row that holds something above the empty ones — a
      // semantic difference, not a striping pattern (see `controls.css`).
      className={`cg-row${item !== null ? ' has-template' : ''}${selected ? ' is-selected' : ''}`}
      style={{ ...styles.row, gridTemplateColumns: gridTemplateColumns(density) }}
      // The row's stable anchor is the LAYER NUMBER — the declared identity that
      // survives every load, unlike an itemId.
      data-layer={String(slot.layer)}
      data-row-number={String(bankPosition)}
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
        {bankPosition}
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
          <span style={styles.secondary} title={templateLabel} dir="auto">
            {templateLabel}
          </span>
        ) : (
          <span style={styles.empty}>Empty</span>
        ))}
      {spec.showDescription && (
        <span
          style={
            item === null ? { ...styles.description, ...styles.onEmptyRow } : styles.description
          }
          title={description}
        >
          {description}
        </span>
      )}
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

/** Load a library template onto this row (the picker path), for reuse by tests. */
export { loadTemplateOntoFixedSlot };
