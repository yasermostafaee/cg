import type { FixedSlotState } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { ContextMenu } from '../../ui/ContextMenu.js';
import { useContextMenu } from '../../ui/useContextMenu.js';
import { toMenuItems, withConfirm } from '../../ui/rowAction.js';
import { useConfirm } from '../../ui/useDialog.js';
import { useLink } from '../../hooks/useLink.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { fixedRowActions } from './fixedRowActions.js';
import { occupancyLabel } from './occupancyLabel.js';

interface Props {
  slot: FixedSlotState;
}

const styles = {
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.6rem 1rem',
    borderBottom: `1px solid ${colors.border}`,
  },
  body: { display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', minWidth: 0 },
  title: {
    fontSize: '0.95rem',
    fontWeight: 700,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  subtitle: { fontSize: '0.8rem', color: colors.textMuted },
  actions: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
} as const;

/**
 * R-021 stage 2b — one PERMANENT fixed-bank row: alias + layer number, an
 * honest occupancy line, and the verbs `fixedRowActions` derives — rendered as
 * buttons AND as the right-click menu from the SAME wrapped list, so the two
 * surfaces share gate, handler, wording and confirm by construction.
 *
 * D8 / B-087 — while the SPA↔bridge link is down, EVERY row displays as
 * UNKNOWN regardless of the frozen snapshot: `useBridgeSnapshot` freezes the
 * last value on `disconnected`, and a frozen `producer`/`empty` claim is one
 * the wire can no longer back. Purely a display mask over frozen data;
 * reconnect re-pulls the authoritative state and the mask lifts on its own.
 * The same `linkDown` also empties the verb list (R-006 — no door onto air).
 */
export function FixedRow({ slot }: Props): JSX.Element {
  const link = useLink();
  const linkDown = link === 'disconnected';
  const { confirm, confirmDialog } = useConfirm();
  const { menu, open, close } = useContextMenu<number>();

  const name = `${String(slot.channel)}-${String(slot.layer)}`;
  const title = slot.alias ?? `Layer ${String(slot.layer)}`;

  // The D3 shape: derive ONCE (the fixedRowActions declaration point), attach
  // the confirm gate ONCE (withConfirm), and hand the SAME wrapped list to the
  // buttons and to `toMenuItems` — parity by construction. The confirm dialog
  // names the layer and states what CLEAR does (the OrphanLayersBanner wording).
  const actions = fixedRowActions(slot, {
    linkDown,
    clear: () =>
      window.cg.layers.clear({ channel: slot.channel, layer: slot.layer }).then((r) => ({
        accepted: r.ok,
        ...(r.reason !== undefined ? { errorCode: r.reason } : {}),
      })),
    onError: reportCommandError,
  }).map((action) =>
    action.key === 'clear'
      ? withConfirm(action, () =>
          confirm({
            title: `Clear layer ${name}?`,
            body: 'This removes whatever is on that layer from air.',
            confirmLabel: 'Clear layer',
            variant: 'caution',
          }),
        )
      : action,
  );

  return (
    <div
      className="cg-row"
      style={styles.row}
      // The row's stable anchor for tests and shortcuts is the LAYER NUMBER —
      // the fixed bank's identity — the way stack rows anchor on data-template-id.
      data-layer={String(slot.layer)}
      // A menu is an alternate entry point to actions that exist. A no-verb row
      // (unknown / empty / non-html — D1) has nothing to offer, so right-click
      // opens nothing; the app-wide suppressor still swallows the browser menu.
      onContextMenu={(e) => {
        if (actions.length > 0) open(e, slot.layer);
      }}
    >
      <div style={styles.body} data-row-body="">
        <div style={styles.title}>{title}</div>
        <div style={styles.subtitle}>
          layer {String(slot.layer)} · {occupancyLabel(slot.observed, linkDown)}
        </div>
      </div>
      <div style={styles.actions}>
        {actions.map((action) => (
          <AsyncButton
            key={action.key}
            variant={action.variant}
            run={action.run}
            disabled={action.disabled}
            onError={action.onError}
            {...(action.title !== undefined ? { title: action.title } : {})}
          >
            {action.label}
          </AsyncButton>
        ))}
      </div>
      {menu !== null && (
        <ContextMenu
          items={toMenuItems(actions)}
          x={menu.x}
          y={menu.y}
          ariaLabel={`${title} actions`}
          onClose={close}
        />
      )}
      {confirmDialog}
    </div>
  );
}
