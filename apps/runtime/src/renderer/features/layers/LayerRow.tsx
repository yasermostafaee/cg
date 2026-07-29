import { useRef } from 'react';
import type { FixedSlotState, TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState, StackItemStatus } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { StatusBadge } from '../../ui/StatusBadge.js';
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

interface Props {
  slot: FixedSlotState;
  /** The stack item bound to this row, or null when the row is empty. */
  item: StackItemState | null;
  /** The bound item's template, for the name and the `hasNext` bit. */
  template: TemplateInfo | null;
  selected: boolean;
  dirty: boolean;
  onSelect: (itemId: string | null) => void;
  /** The Inspector's Apply, so the row's UPDATE runs the identical path. */
  onUpdate: (itemId: string) => Promise<{ accepted: boolean; errorCode?: string | undefined }>;
}

const styles = {
  row: {
    display: 'grid',
    // layer · badge · body · actions
    gridTemplateColumns: 'auto auto 1fr auto',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem 1rem',
    borderBottom: `1px solid ${colors.border}`,
  },
  layerCell: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    minWidth: '3.25rem',
    gap: '0.1rem',
  },
  layerNumber: { fontSize: '1rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' as const },
  layerAlias: {
    fontSize: '0.65rem',
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    maxWidth: '5.5rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  badgeCell: { minWidth: '8.5rem', display: 'flex', alignItems: 'center' },
  body: { display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', minWidth: 0 },
  title: {
    fontSize: '0.95rem',
    fontWeight: 700,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  empty: { fontSize: '0.95rem', color: colors.textMuted, fontStyle: 'italic' as const },
  subtitle: {
    fontSize: '0.8rem',
    color: colors.textMuted,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  actions: { display: 'flex', gap: '0.4rem', alignItems: 'center' },
  state: { fontSize: '0.75rem', fontWeight: 700 },
} as const;

/**
 * R-028 (4.1/4.2) — ONE layer row: the whole operator surface for one declared
 * layer, replacing the old split between a Fixed-Layers row and a Stack row.
 *
 * What it shows, and why each part is non-negotiable:
 *
 *   - the REAL CasparCG layer number, ALWAYS (design §b5). An operator may need
 *     it to clear that layer by hand over AMCP; an alias may sit beside it but
 *     never instead of it.
 *   - the alias, when configured — the name the operator actually thinks in.
 *   - the template on the row, resolved through the canonical display rule.
 *   - a state line: what the wire OBSERVES, and (separately) what this station
 *     put there. The row never infers one from the other.
 *
 * The verbs come from `layerRowActions` as ONE list, rendered as buttons AND as
 * the right-click menu, so the two can never diverge in gate, handler or
 * wording. Buttons are present-but-disabled before a load (the owner's point 8).
 *
 * D8 / B-087 — with the link down every row displays UNKNOWN regardless of the
 * frozen snapshot, and every verb is disabled: a frozen occupancy claim is one
 * the wire can no longer back.
 */
export function LayerRow({
  slot,
  item,
  template,
  selected,
  dirty,
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

  const layerName = `${String(slot.channel)}-${String(slot.layer)}`;
  const rowName = slot.alias ?? `Layer ${String(slot.layer)}`;
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

  return (
    <div
      className={`cg-row${selected ? ' is-selected' : ''}`}
      style={styles.row}
      // The row's stable anchor is the LAYER NUMBER — the declared identity that
      // survives every load, unlike an itemId.
      data-layer={String(slot.layer)}
      {...(item !== null ? { 'data-item-id': item.itemId } : {})}
      {...(template !== null ? { 'data-template-id': template.templateId } : {})}
      onContextMenu={(e) => open(e, slot.layer)}
    >
      <div style={styles.layerCell}>
        <span style={styles.layerNumber}>{String(slot.layer)}</span>
        {slot.alias !== undefined && <span style={styles.layerAlias}>{slot.alias}</span>}
      </div>
      {/* The badge cell is ALWAYS present so the grid columns do not shift when
          a row is loaded or emptied — the controls must not move under the
          operator's hand. */}
      <div style={styles.badgeCell}>
        {badgeStatus !== null && (
          <StatusBadge
            status={badgeStatus}
            pending={item?.pending === true}
            simulated={simulated}
            bridgeDown={linkDown}
            oscBlind={oscBlind}
          />
        )}
      </div>
      <div
        style={styles.body}
        data-row-body=""
        onClick={() => onSelect(item === null ? null : item.itemId)}
      >
        {templateLabel !== null ? (
          <div style={styles.title}>
            {templateLabel}
            {dirty && <DraftChip label={`${templateLabel} has unapplied edits`} />}
          </div>
        ) : (
          <div style={styles.empty}>Empty — load a template</div>
        )}
        <div style={styles.subtitle}>
          layer {String(slot.layer)} · {occupancyLabel(slot.observed, linkDown)}
        </div>
      </div>
      <div style={styles.actions}>
        {buttons.map((action) => (
          <AsyncButton
            key={action.key}
            variant={action.variant}
            run={action.run}
            disabled={action.disabled}
            onError={action.onError}
            {...(action.icon !== undefined ? { icon: action.icon } : {})}
            {...(action.title !== undefined ? { title: action.title } : {})}
          >
            {action.label}
          </AsyncButton>
        ))}
      </div>
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
